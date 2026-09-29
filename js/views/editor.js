import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.mjs';
import { listDecks, listCards, getCard, saveCard, deleteCard, createDeck } from '../db.js';
import { loadDict, search, dictReady } from '../dict.js';
import { romajiInput } from '../kana.js';
import { persistStorage } from './settings.js';
import { ImageField } from './image-field.js';
import { TopBar, Icon, FlipCard, useLive, navigate, toast, Loading } from '../ui.js';

const LAST_DECK = 'kotoba-last-deck';
const rememberDeck = (id) => {
  try {
    localStorage.setItem(LAST_DECK, id);
  } catch {}
};
const lastDeck = () => {
  try {
    return localStorage.getItem(LAST_DECK);
  } catch {
    return null;
  }
};

// Поиск по словарю: ромадзи / кана / кандзи / русское слово → подставляет поля.
export function DictSearch({ onPick, autoFocus }) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState(dictReady() ? 'ready' : 'idle');
  const [results, setResults] = useState([]);
  const inputRef = useRef();

  const ensure = () => {
    if (state !== 'idle') return;
    setState('loading');
    loadDict().then(
      () => setState('ready'),
      () => setState('error')
    );
  };

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
    ensure();
  }, []);

  useEffect(() => {
    if (state !== 'ready') return;
    const t = setTimeout(() => setResults(search(query)), 120);
    return () => clearTimeout(t);
  }, [query, state]);

  const pick = (s) => {
    onPick(s);
    setQuery('');
    setResults([]);
  };

  return html`<div class="dict">
    <label class="search big">
      <${Icon} name="search" size=${20} />
      <input ref=${inputRef} value=${query} lang="ja" autocomplete="off" autocapitalize="off" spellcheck="false"
        placeholder="Найти слово: ookami, おおかみ, 狼 или «волк»"
        onFocus=${ensure} onInput=${(e) => setQuery(romajiInput(e))}
        onKeyDown=${(e) => e.key === 'Enter' && (e.preventDefault(), results[0] && pick(results[0]))} />
    </label>
    ${state === 'loading' && html`<div class="dict-note">Загружаю словарь…</div>`}
    ${state === 'error' && html`<div class="dict-note">Словарь не загрузился — проверьте интернет. Поля можно заполнить вручную.</div>`}
    ${query.trim() && state === 'ready' && results.length === 0 && html`<div class="dict-note">Ничего не нашлось</div>`}
    ${results.length > 0 &&
    html`<ul class="dict-results">
      ${results.map(
        (s) => html`<li><button type="button" onClick=${() => pick(s)}>
          <span class="dict-word jp">${s.kanji || s.altKanji || s.kana}</span>
          ${(s.kanji || s.altKanji) && html`<span class="dict-kana jp">${s.kana}</span>`}
          <span class="dict-meaning">${s.english && html`<em class="tag">англ.</em>`}${s.meanings.join('; ')}</span>
        </button></li>`
      )}
    </ul>`}
  </div>`;
}

const emptyForm = (deckId) => ({ kanji: '', kana: '', translation: '', image: null, deckId: deckId || '' });

export function Editor({ cardId, deckId }) {
  const decks = useLive(listDecks, []);
  const allCards = useLive(() => listCards('all'), []);
  const [form, setForm] = useState(cardId ? null : emptyForm(deckId));
  const [meanings, setMeanings] = useState([]);
  const [altKanji, setAltKanji] = useState('');
  const [flipped, setFlipped] = useState(false);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchKey, setSearchKey] = useState(0);
  const isEdit = !!cardId;

  useEffect(() => {
    if (cardId) getCard(cardId).then((c) => setForm(c ? { ...c, kanji: c.kanji || '' } : false));
  }, [cardId]);

  // Колода по умолчанию: из ссылки, последняя использованная или первая.
  useEffect(() => {
    if (!decks || !form || form.deckId) return;
    const remembered = lastDeck();
    const id = decks.find((d) => d.id === remembered)?.id || decks[0]?.id;
    if (id) setForm((f) => ({ ...f, deckId: id }));
  }, [decks, form && form.deckId]);

  if (form === false) {
    return html`<${TopBar} back="#/" title="Карточка не найдена" />`;
  }
  if (!form || !decks) return html`<${TopBar} back="#/" title="" /><${Loading} />`;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const back = form.deckId && form.deckId !== '__new' ? '#/deck/' + form.deckId : '#/';

  const onPick = (s) => {
    set({ kanji: s.kanji, kana: s.kana, translation: s.translation || form.translation });
    setMeanings(s.meanings.length > 1 || s.english ? s.meanings : []);
    setAltKanji(s.altKanji);
  };

  const duplicate =
    allCards &&
    form.kana.trim() &&
    allCards.find((c) => c.id !== form.id && c.kana === form.kana.trim() && (c.kanji || '') === form.kanji.trim());
  const dupDeck = duplicate && decks.find((d) => d.id === duplicate.deckId);

  const errors = {
    kana: !form.kana.trim() && 'Впишите чтение',
    translation: !form.translation.trim() && 'Впишите перевод',
  };
  const valid = !errors.kana && !errors.translation;

  const save = async (addAnother) => {
    setTried(true);
    if (!valid || saving) return;
    setSaving(true);
    try {
      let deckIdToUse = form.deckId;
      if (!deckIdToUse || deckIdToUse === '__new') {
        const name = deckIdToUse === '__new' ? prompt('Название новой колоды', 'Мои слова') : 'Мои слова';
        if (!name) return;
        deckIdToUse = (await createDeck(name)).id;
      }
      await saveCard({
        ...form,
        deckId: deckIdToUse,
        kanji: form.kanji.trim(),
        kana: form.kana.trim(),
        translation: form.translation.trim(),
      });
      rememberDeck(deckIdToUse);
      persistStorage();
      toast(isEdit ? 'Сохранено' : 'Карточка добавлена');
      if (addAnother) {
        setForm(emptyForm(deckIdToUse));
        setMeanings([]);
        setAltKanji('');
        setTried(false);
        setFlipped(false);
        setSearchKey((k) => k + 1);
        scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        navigate('/deck/' + deckIdToUse);
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm('Удалить эту карточку?')) return;
    await deleteCard(form.id);
    toast('Карточка удалена');
    navigate('/deck/' + form.deckId);
  };

  const previewCard = {
    ...form,
    kana: form.kana || 'かな',
    translation: form.translation || 'перевод',
  };

  return html`
    <${TopBar} back=${back} title=${isEdit ? 'Редактирование' : 'Новая карточка'}>
      ${isEdit
        ? html`<button class="icon-btn danger" aria-label="Удалить" onClick=${remove}><${Icon} name="trash" /></button>`
        : html`<a class="btn small ghost" href=${'#/bulk' + (form.deckId ? '?deck=' + form.deckId : '')}><${Icon} name="list" size=${18} />Списком</a>`}
    <//>
    <main class="page editor">
      <div class="editor-form">
        <${DictSearch} key=${searchKey} onPick=${onPick} autoFocus=${!isEdit && matchMedia('(pointer: fine)').matches} />

        <div class="fields">
          <label class="field">
            <span>Кандзи <em>если есть</em></span>
            <input class="input jp" lang="ja" value=${form.kanji} placeholder="狼"
              onInput=${(e) => set({ kanji: e.target.value })} />
            ${altKanji && !form.kanji &&
            html`<div class="hint">Обычно пишется каной. Кандзи: <span class="jp">${altKanji}</span>${' — '}<button
              type="button" class="link" onClick=${() => set({ kanji: altKanji })}>подставить</button></div>`}
          </label>
          <label class=${'field' + (tried && errors.kana ? ' invalid' : '')}>
            <span>Чтение <em>хирагана — можно печатать латиницей</em></span>
            <input class="input jp" lang="ja" value=${form.kana} placeholder="おおかみ (ookami)" autocomplete="off"
              autocapitalize="off" spellcheck="false" onInput=${(e) => set({ kana: romajiInput(e) })} />
            ${tried && errors.kana && html`<div class="error">${errors.kana}</div>`}
          </label>
          <label class=${'field' + (tried && errors.translation ? ' invalid' : '')}>
            <span>Перевод</span>
            <input class="input" value=${form.translation} placeholder="волк"
              onInput=${(e) => set({ translation: e.target.value })} />
            ${tried && errors.translation && html`<div class="error">${errors.translation}</div>`}
            ${meanings.length > 0 &&
            html`<div class="chips">
              ${meanings.map(
                (m) => html`<button type="button" class=${'chip' + (form.translation === m ? ' on' : '')}
                  onClick=${() => set({ translation: m })}>${m}</button>`
              )}
            </div>`}
          </label>
          ${duplicate && html`<div class="warn">Такое слово уже есть${dupDeck ? ` в колоде «${dupDeck.name}»` : ''}.</div>`}
        </div>

        <div class="field">
          <span>Картинка</span>
          <${ImageField} value=${form.image} onChange=${(image) => set({ image })} />
        </div>

        <label class="field">
          <span>Колода</span>
          <select class="input" value=${form.deckId} onChange=${(e) => set({ deckId: e.target.value })}>
            ${decks.map((d) => html`<option value=${d.id}>${d.name}</option>`)}
            ${decks.length === 0 && html`<option value="">Мои слова (новая)</option>`}
            <option value="__new">+ Новая колода…</option>
          </select>
        </label>
      </div>

      <aside class="editor-preview">
        <div class="preview-label">Предпросмотр · нажмите, чтобы перевернуть</div>
        <${FlipCard} card=${previewCard} flipped=${flipped} onFlip=${() => setFlipped(!flipped)} />
      </aside>

      <div class="editor-actions">
        ${!isEdit &&
        html`<button class="btn" disabled=${saving} onClick=${() => save(true)}>Сохранить и ещё</button>`}
        <button class="btn primary" disabled=${saving} onClick=${() => save(false)}><${Icon} name="check" />Сохранить</button>
      </div>
    </main>
  `;
}
