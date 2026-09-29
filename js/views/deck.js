import { html, useState } from '../../vendor/preact-htm.mjs';
import { getDeck, listCards, progressMap, renameDeck, deleteDeck, exportData, getMeta } from '../db.js';
import { isDue, isNew, startOfDay } from '../srs.js';
import { frontText, normalizeKana } from '../kana.js';
import { setPrefs, DIRS } from '../prefs.js';
import { saveFile } from './settings.js';
import {
  TopBar, Icon, Menu, Thumb, PromptModal, useLive, usePrefs, cardsWord, navigate, toast, Loading, Empty,
} from '../ui.js';

export function StudyPrefs({ prefs }) {
  return html`<div class="study-prefs">
    <div class="segmented" role="group" aria-label="Направление">
      ${Object.entries(DIRS).map(
        ([key, d]) => html`<button class=${prefs.dir === key ? 'on' : ''} onClick=${() => setPrefs({ dir: key })}
          title=${d.label}>${d.short}</button>`
      )}
    </div>
    <button class=${'chip' + (prefs.hideImage ? ' on' : '')} onClick=${() => setPrefs({ hideImage: !prefs.hideImage })}
      title="Скрывать картинку на стороне вопроса">
      <${Icon} name=${prefs.hideImage ? 'eyeOff' : 'eye'} size=${18} />
      ${prefs.hideImage ? 'Без картинки' : 'С картинкой'}
    </button>
  </div>`;
}

function ModeButton({ href, icon, title, sub, disabled }) {
  return disabled
    ? html`<div class="mode disabled"><${Icon} name=${icon} size=${26} /><div><b>${title}</b><span>${sub}</span></div></div>`
    : html`<a class="mode" href=${href}><${Icon} name=${icon} size=${26} /><div><b>${title}</b><span>${sub}</span></div></a>`;
}

function CardTile({ card }) {
  return html`<a class="card-tile" href=${'#/edit/' + card.id}>
    <${Thumb} blob=${card.image} fallback=${frontText(card)} />
    <div class="card-tile-text">
      <div class="jp">${frontText(card)}</div>
      <div class="muted">${card.translation}</div>
    </div>
  </a>`;
}

async function loadDeck(id, prefs) {
  const isAll = id === 'all';
  const deck = isAll ? { id: 'all', name: 'Все карточки' } : await getDeck(id);
  if (!deck) return null;
  const [cards, prog, newMeta] = await Promise.all([listCards(id), progressMap(prefs.dir), getMeta('new-' + prefs.dir)]);
  const now = Date.now();
  const due = cards.filter((c) => isDue(prog.get(c.id), now)).length;
  const fresh = cards.filter((c) => isNew(prog.get(c.id))).length;
  const usedToday = newMeta && newMeta.day === startOfDay() ? newMeta.count : 0;
  const newAvail = Math.min(fresh, Math.max(0, prefs.newPerDay - usedToday));
  return { deck, cards, due, newAvail, isAll };
}

export function DeckView({ id }) {
  const prefs = usePrefs();
  const data = useLive(() => loadDeck(id, prefs), [id, prefs.dir, prefs.newPerDay]);
  const [renaming, setRenaming] = useState(false);
  const [query, setQuery] = useState('');

  if (data === undefined) return html`<${TopBar} back="#/" title="" /><${Loading} />`;
  if (!data) {
    return html`<${TopBar} back="#/" title="Колода не найдена" />
      <main class="page"><${Empty} title="Такой колоды нет"><a class="btn" href="#/">К колодам</a><//></main>`;
  }

  const { deck, cards, due, newAvail, isAll } = data;
  const n = cards.length;
  const addQuery = isAll ? '' : '?deck=' + deck.id;
  const q = query.trim().toLowerCase();
  const qk = normalizeKana(query);
  const shown = q
    ? cards.filter(
        (c) =>
          c.translation.toLowerCase().includes(q) ||
          (c.kanji || '').includes(query.trim()) ||
          (qk && normalizeKana(c.kana).includes(qk))
      )
    : cards;

  const menu = [
    { icon: 'pencil', label: 'Переименовать', onClick: () => setRenaming(true) },
    {
      icon: 'upload',
      label: 'Поделиться колодой (файл)',
      onClick: async () => saveFile(await exportData(deck.id), `kotoba-${deck.name}.json`),
    },
    {
      icon: 'trash',
      label: 'Удалить колоду',
      danger: true,
      onClick: async () => {
        if (!confirm(`Удалить колоду «${deck.name}» и все её карточки (${n})? Это нельзя отменить.`)) return;
        await deleteDeck(deck.id);
        toast('Колода удалена');
        navigate('/');
      },
    },
  ];

  const srsSub =
    due + newAvail > 0
      ? [due && `${due} к повторению`, newAvail && `${newAvail} новых`].filter(Boolean).join(' · ')
      : 'На сегодня всё';
  const base = `#/study/${deck.id}/`;

  return html`
    <${TopBar} back="#/" title=${deck.name} sub=${cardsWord(n)}>
      ${!isAll && html`<${Menu} items=${menu} />`}
    <//>
    <main class="page">
      ${n === 0
        ? html`<${Empty} title="В колоде пока нет карточек" text="Добавьте слова по одному или сразу списком.">
            <a class="btn primary" href=${'#/add' + addQuery}><${Icon} name="plus" />Карточка</a>
            <a class="btn" href=${'#/bulk' + addQuery}><${Icon} name="list" />Списком</a>
          <//>`
        : html`
          <${StudyPrefs} prefs=${prefs} />
          <div class="modes">
            <${ModeButton} href=${base + 'cards'} icon="cards" title="Карточки" sub="Листать и переворачивать" />
            <${ModeButton} href=${base + 'srs'} icon="repeat" title="Повторение" sub=${srsSub} />
            <${ModeButton} href=${base + 'choice'} icon="choice" title="Тест: выбор"
              sub=${n < 2 ? 'Нужно минимум 2 карточки' : 'Выбрать из 4 вариантов'} disabled=${n < 2} />
            <${ModeButton} href=${base + 'write'} icon="pen" title="Тест: письмо"
              sub=${prefs.dir === 'jr' ? 'Написать перевод' : 'Написать слово по-японски'} />
          </div>

          <div class="section-head">
            <h2>Слова</h2>
            <div class="section-actions">
              <a class="btn small" href=${'#/bulk' + addQuery}><${Icon} name="list" size=${18} />Списком</a>
              <a class="btn small primary" href=${'#/add' + addQuery}><${Icon} name="plus" size=${18} />Карточка</a>
            </div>
          </div>
          ${n > 8 &&
          html`<label class="search">
            <${Icon} name="search" size=${18} />
            <input type="search" placeholder="Поиск по колоде" value=${query} onInput=${(e) => setQuery(e.target.value)} />
          </label>`}
          <div class="card-grid">
            ${shown.map((c) => html`<${CardTile} key=${c.id} card=${c} />`)}
          </div>
          ${q && shown.length === 0 && html`<p class="muted center">Ничего не нашлось</p>`}`}
    </main>
    ${renaming &&
    html`<${PromptModal} title="Название колоды" initial=${deck.name}
      onOk=${async (name) => { await renameDeck(deck.id, name); setRenaming(false); }}
      onClose=${() => setRenaming(false)} />`}
  `;
}
