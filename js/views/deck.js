import { html, useState } from '../../vendor/preact-htm.mjs';
import {
  getDeck, listFolders, listCardsInScope, progressMap, renameDeck, deleteDeck, moveDecks, createFolder,
  exportData, getMeta, folderOf,
} from '../db.js';
import { isDue, isNew, startOfDay } from '../srs.js';
import { frontText, normalizeKana } from '../kana.js';
import { setPrefs, DIRS } from '../prefs.js';
import { saveFile } from './settings.js';
import {
  TopBar, Icon, Menu, Modal, Thumb, PromptModal, useLive, usePrefs, cardsWord, navigate, toast, Loading, Empty,
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

// Сколько карточек в наборе, сколько к повторению и сколько новых можно взять сегодня.
export async function scopeSummary(scope, prefs) {
  const [cards, prog, newMeta] = await Promise.all([
    listCardsInScope(scope),
    progressMap(prefs.dir),
    getMeta('new-' + prefs.dir),
  ]);
  const now = Date.now();
  const due = cards.filter((c) => isDue(prog.get(c.id), now)).length;
  const fresh = cards.filter((c) => isNew(prog.get(c.id))).length;
  const usedToday = newMeta && newMeta.day === startOfDay() ? newMeta.count : 0;
  return { cards, due, newAvail: Math.min(fresh, Math.max(0, prefs.newPerDay - usedToday)) };
}

// Четыре режима изучения для набора: колоды, папки или всех карточек.
export function StudyModes({ scope, n, due, newAvail, dir }) {
  const srsSub =
    due + newAvail > 0
      ? [due && `${due} к повторению`, newAvail && `${newAvail} новых`].filter(Boolean).join(' · ')
      : 'На сегодня всё';
  const base = `#/study/${scope}/`;
  return html`<div class="modes">
    <${ModeButton} href=${base + 'cards'} icon="cards" title="Карточки" sub="Листать и переворачивать" />
    <${ModeButton} href=${base + 'srs'} icon="repeat" title="Повторение" sub=${srsSub} />
    <${ModeButton} href=${base + 'choice'} icon="choice" title="Тест: выбор"
      sub=${n < 2 ? 'Нужно минимум 2 карточки' : 'Выбрать из 4 вариантов'} disabled=${n < 2} />
    <${ModeButton} href=${base + 'write'} icon="pen" title="Тест: письмо"
      sub=${dir === 'jr' ? 'Написать перевод' : 'Написать слово по-японски'} />
  </div>`;
}

// Выбор папки для колоды (или «без папки»), с созданием новой папки на месте.
export function MoveDeckModal({ deck, folders, onClose }) {
  const [newName, setNewName] = useState(null);
  const current = folderOf(deck, folders)?.id || null;

  const move = async (folderId, name) => {
    await moveDecks([deck.id], folderId);
    toast(folderId ? `Колода теперь в папке «${name}»` : 'Колода теперь без папки');
    onClose();
  };
  const createAndMove = async (e) => {
    e.preventDefault();
    if (!newName?.trim()) return;
    const folder = await createFolder(newName);
    await move(folder.id, folder.name);
  };

  const option = (id, name, icon) => html`<button class=${'pick' + (current === id ? ' on' : '')}
      onClick=${() => (current === id ? onClose() : move(id, name))}>
    <${Icon} name=${icon} size=${20} /><span>${name}</span>${current === id && html`<${Icon} name="check" size=${18} />`}
  </button>`;

  return html`<${Modal} title=${`Переместить «${deck.name}»`} onClose=${onClose}>
    <div class="pick-list">
      ${option(null, 'Без папки (на главном экране)', 'deck')}
      ${folders.map((f) => option(f.id, f.name, 'folder'))}
    </div>
    ${newName === null
      ? html`<button class="btn ghost wide" onClick=${() => setNewName('')}><${Icon} name="plus" />Новая папка…</button>`
      : html`<form class="url-row" onSubmit=${createAndMove}>
          <input class="input" placeholder="Название папки" value=${newName} ref=${(el) => el && setTimeout(() => el.focus(), 30)}
            onInput=${(e) => setNewName(e.target.value)} />
          <button class="btn primary" disabled=${!newName.trim()}>Создать</button>
        </form>`}
    <div class="modal-actions"><button class="btn ghost" onClick=${onClose}>Отмена</button></div>
  <//>`;
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
  const [summary, folders] = await Promise.all([scopeSummary(id, prefs), listFolders()]);
  return { deck, isAll, folders, folder: isAll ? null : folderOf(deck, folders), ...summary };
}

export function DeckView({ id }) {
  const prefs = usePrefs();
  const data = useLive(() => loadDeck(id, prefs), [id, prefs.dir, prefs.newPerDay]);
  const [modal, setModal] = useState(null); // 'rename' | 'move'
  const [query, setQuery] = useState('');

  if (data === undefined) return html`<${TopBar} back="#/" title="" /><${Loading} />`;
  if (!data) {
    return html`<${TopBar} back="#/" title="Колода не найдена" />
      <main class="page"><${Empty} title="Такой колоды нет"><a class="btn" href="#/">К колодам</a><//></main>`;
  }

  const { deck, cards, due, newAvail, isAll, folder, folders } = data;
  const n = cards.length;
  const back = folder ? '#/folder/' + folder.id : '#/';
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
    { icon: 'pencil', label: 'Переименовать', onClick: () => setModal('rename') },
    { icon: 'folderMove', label: 'Переместить в папку', onClick: () => setModal('move') },
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
        navigate(back.slice(1));
      },
    },
  ];

  const sub = folder ? html`<${Icon} name="folder" size=${13} /> ${folder.name} · ${cardsWord(n)}` : cardsWord(n);

  return html`
    <${TopBar} back=${back} title=${deck.name} sub=${sub}>
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
          <${StudyModes} scope=${deck.id} n=${n} due=${due} newAvail=${newAvail} dir=${prefs.dir} />

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
            <input type="search" placeholder=${isAll ? 'Поиск по всем словам' : 'Поиск по колоде'} value=${query}
              onInput=${(e) => setQuery(e.target.value)} />
          </label>`}
          <div class="card-grid">
            ${shown.map((c) => html`<${CardTile} key=${c.id} card=${c} />`)}
          </div>
          ${q && shown.length === 0 && html`<p class="muted center">Ничего не нашлось</p>`}`}
    </main>
    ${modal === 'rename' &&
    html`<${PromptModal} title="Название колоды" initial=${deck.name}
      onOk=${async (name) => { await renameDeck(deck.id, name); setModal(null); }}
      onClose=${() => setModal(null)} />`}
    ${modal === 'move' && html`<${MoveDeckModal} deck=${deck} folders=${folders} onClose=${() => setModal(null)} />`}
  `;
}
