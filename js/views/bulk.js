import { html, useState, useEffect } from '../../vendor/preact-htm.mjs';
import { listDecks, saveCards, createDeck } from '../db.js';
import { loadDict, lookupExact } from '../dict.js';
import { hasKanji, romajiInput } from '../kana.js';
import { toKana } from '../../vendor/wanakana.mjs';
import { persistStorage } from './settings.js';
import { TopBar, Icon, useLive, navigate, toast, cardsWord, Loading } from '../ui.js';

const EXAMPLE = `ookami; волк
ねこ; кошка
犬
鳥; とり; птица`;

const toReading = (s) => (/[a-z]/i.test(s) ? toKana(s) : s);

// Строка → карточка. Форматы: «слово», «слово; перевод», «кандзи; чтение; перевод».
function parseLine(line) {
  const parts = line
    .split(/\t|;|\s[—–-]\s/)
    .map((s) => s.trim())
    .filter(Boolean);
  const row = { kanji: '', kana: '', translation: '', note: '' };
  if (parts.length >= 3) {
    row.kanji = parts[0];
    row.kana = toReading(parts[1]);
    row.translation = parts.slice(2).join(', ');
    if (!hasKanji(row.kanji)) row.kanji = '';
    return row;
  }
  const word = toReading(parts[0]);
  const hit = lookupExact(word, parts[1] || '');
  if (hasKanji(word)) {
    row.kanji = word;
    row.kana = hit?.kana || '';
    if (!hit) row.note = 'нет в словаре — впишите чтение';
  } else {
    row.kana = word;
    // Кандзи подставляем, только если уверены: слово без перевода или перевод совпал со словарём.
    if (hit && (parts.length === 1 || hit.meaningMatched)) row.kanji = hit.kanji;
  }
  row.translation = parts[1] || hit?.translation || '';
  if (!row.translation && !row.note) row.note = hit?.english ? `англ.: ${hit.meanings[0]}` : 'нет в словаре — впишите перевод';
  return row;
}

export function Bulk({ deckId }) {
  const decks = useLive(listDecks, []);
  const [target, setTarget] = useState(deckId || '');
  const [text, setText] = useState('');
  const [rows, setRows] = useState(null);
  const [dict, setDict] = useState('loading');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadDict().then(() => setDict('ready'), () => setDict('error'));
  }, []);
  useEffect(() => {
    if (decks && !target && decks[0]) setTarget(decks[0].id);
  }, [decks]);

  if (!decks) return html`<${TopBar} back="#/" title="" /><${Loading} />`;

  const parse = () => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    setRows(lines.map(parseLine));
  };
  const update = (i, patch) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const ready = (rows || []).filter((r) => r.kana.trim() && r.translation.trim());

  const save = async () => {
    if (!ready.length || saving) return;
    setSaving(true);
    try {
      const id = target || (await createDeck('Мои слова')).id;
      await saveCards(
        ready.map((r) => ({ deckId: id, kanji: r.kanji.trim(), kana: r.kana.trim(), translation: r.translation.trim(), image: null }))
      );
      persistStorage();
      toast(`Добавлено: ${cardsWord(ready.length)}. Картинки можно добавить, нажав на карточку.`, 'long');
      navigate('/deck/' + id);
    } finally {
      setSaving(false);
    }
  };

  return html`
    <${TopBar} back=${target ? '#/deck/' + target : '#/'} title="Добавить списком" />
    <main class="page bulk">
      <label class="field">
        <span>Колода</span>
        <select class="input" value=${target} onChange=${(e) => setTarget(e.target.value)}>
          ${decks.map((d) => html`<option value=${d.id}>${d.name}</option>`)}
          ${decks.length === 0 && html`<option value="">Мои слова (новая)</option>`}
        </select>
      </label>

      ${rows === null
        ? html`
          <div class="panel help">
            <b>Одна строка — одна карточка.</b> Разделитель — точка с запятой.
            <ul>
              <li><code>слово</code> — чтение и перевод подставятся из словаря</li>
              <li><code>слово; перевод</code></li>
              <li><code>кандзи; чтение; перевод</code></li>
            </ul>
            Чтение можно печатать латиницей: <code>ookami</code> → <span class="jp">おおかみ</span>.
          </div>
          <textarea class="input area jp-mix" rows="10" placeholder=${EXAMPLE} value=${text}
            onInput=${(e) => setText(e.target.value)}></textarea>
          ${dict === 'error' && html`<div class="warn">Словарь не загрузился: автозаполнение не сработает, но формат «кандзи; чтение; перевод» работает.</div>`}
          <div class="editor-actions">
            <button class="btn primary" disabled=${!text.trim() || dict === 'loading'} onClick=${parse}>
              ${dict === 'loading' ? 'Загружаю словарь…' : 'Разобрать'}
            </button>
          </div>`
        : html`
          <div class="bulk-table">
            <div class="bulk-row head"><span>Кандзи</span><span>Чтение</span><span>Перевод</span><span></span></div>
            ${rows.map(
              (r, i) => html`<div class=${'bulk-row' + (r.kana.trim() && r.translation.trim() ? '' : ' incomplete')}>
                <input class="input jp" lang="ja" value=${r.kanji} placeholder="—" onInput=${(e) => update(i, { kanji: e.target.value })} />
                <input class="input jp" lang="ja" value=${r.kana} placeholder="чтение" onInput=${(e) => update(i, { kana: romajiInput(e) })} />
                <input class="input" value=${r.translation} placeholder="перевод" onInput=${(e) => update(i, { translation: e.target.value })} />
                <button class="icon-btn" aria-label="Убрать" onClick=${() => setRows(rows.filter((_, j) => j !== i))}><${Icon} name="close" size=${18} /></button>
                ${r.note && !(r.kana.trim() && r.translation.trim()) && html`<div class="bulk-note">${r.note}</div>`}
              </div>`
            )}
          </div>
          ${ready.length < rows.length &&
          html`<div class="warn">Строки без чтения или перевода (${rows.length - ready.length}) будут пропущены.</div>`}
          <div class="editor-actions">
            <button class="btn" onClick=${() => setRows(null)}>Назад к тексту</button>
            <button class="btn primary" disabled=${!ready.length || saving} onClick=${save}>
              <${Icon} name="check" />Добавить ${cardsWord(ready.length)}
            </button>
          </div>`}
    </main>
  `;
}
