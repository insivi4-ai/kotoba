import { html, useState } from '../../vendor/preact-htm.mjs';
import {
  getFolder, renameFolder, deleteFolder, createDeck, moveDecks, exportData, folderScope, folderOf,
} from '../db.js';
import { saveFile } from './settings.js';
import { StudyPrefs, StudyModes, scopeSummary } from './deck.js';
import { DeckTile, libraryStats, decksWord } from './home.js';
import {
  TopBar, Icon, Menu, Modal, PromptModal, useLive, usePrefs, cardsWord, navigate, toast, Loading, Empty,
} from '../ui.js';

async function loadFolder(id, prefs) {
  const folder = await getFolder(id);
  if (!folder) return null;
  const [library, summary] = await Promise.all([libraryStats(prefs.dir), scopeSummary(folderScope(id), prefs)]);
  const decks = library.decks.filter((d) => d.folderId === id);
  const others = library.decks.filter((d) => d.folderId !== id);
  return { folder, decks, others, folders: library.folders, stats: library.stats, ...summary };
}

// Перенос существующих колод в эту папку (несколько сразу).
function PickDecksModal({ folder, decks, folders, onClose }) {
  const [picked, setPicked] = useState(new Set());
  const toggle = (id) =>
    setPicked((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const move = async () => {
    await moveDecks([...picked], folder.id);
    toast(`Перемещено в «${folder.name}»: ${decksWord(picked.size)}`);
    onClose();
  };
  return html`<${Modal} title=${`Добавить колоды в «${folder.name}»`} onClose=${onClose}>
    <div class="pick-list">
      ${decks.map((d) => {
        const from = folderOf(d, folders);
        return html`<button class=${'pick' + (picked.has(d.id) ? ' on' : '')} onClick=${() => toggle(d.id)}>
          <span class=${'checkbox' + (picked.has(d.id) ? ' on' : '')}>${picked.has(d.id) && html`<${Icon} name="check" size=${14} />`}</span>
          <span>${d.name}${from && html`<small class="muted"> · из «${from.name}»</small>`}</span>
        </button>`;
      })}
    </div>
    <div class="modal-actions">
      <button class="btn ghost" onClick=${onClose}>Отмена</button>
      <button class="btn primary" disabled=${!picked.size} onClick=${move}>Переместить${picked.size ? ` (${picked.size})` : ''}</button>
    </div>
  <//>`;
}

export function FolderView({ id }) {
  const prefs = usePrefs();
  const data = useLive(() => loadFolder(id, prefs), [id, prefs.dir, prefs.newPerDay]);
  const [modal, setModal] = useState(null); // 'rename' | 'newDeck' | 'pick'

  if (data === undefined) return html`<${TopBar} back="#/" title="" /><${Loading} />`;
  if (!data) {
    return html`<${TopBar} back="#/" title="Папка не найдена" />
      <main class="page"><${Empty} title="Такой папки нет"><a class="btn" href="#/">К колодам</a><//></main>`;
  }

  const { folder, decks, others, folders, stats, cards, due, newAvail } = data;
  const n = cards.length;

  const menu = [
    { icon: 'pencil', label: 'Переименовать', onClick: () => setModal('rename') },
    {
      icon: 'upload',
      label: 'Поделиться папкой (файл)',
      onClick: async () => saveFile(await exportData(folderScope(folder.id)), `kotoba-${folder.name}.json`),
    },
    {
      icon: 'trash',
      label: 'Удалить папку',
      danger: true,
      onClick: async () => {
        const text = decks.length
          ? `Удалить папку «${folder.name}»? Колоды из неё (${decks.length}) не удалятся — они появятся на главном экране.`
          : `Удалить папку «${folder.name}»?`;
        if (!confirm(text)) return;
        await deleteFolder(folder.id);
        toast('Папка удалена');
        navigate('/');
      },
    },
  ];

  const actions = html`<div class="section-actions">
    ${others.length > 0 &&
    html`<button class="btn small" onClick=${() => setModal('pick')}><${Icon} name="folderMove" size=${18} />Добавить</button>`}
    <button class="btn small primary" onClick=${() => setModal('newDeck')}><${Icon} name="plus" size=${18} />Колода</button>
  </div>`;

  return html`
    <${TopBar} back="#/" title=${folder.name} sub=${`${decksWord(decks.length)} · ${cardsWord(n)}`}>
      <${Menu} items=${menu} />
    <//>
    <main class="page">
      ${decks.length === 0
        ? html`<${Empty} title="В папке пока нет колод" text="Создайте новую колоду здесь или перенесите сюда уже готовые.">
            <button class="btn primary" onClick=${() => setModal('newDeck')}><${Icon} name="plus" />Новая колода</button>
            ${others.length > 0 &&
            html`<button class="btn" onClick=${() => setModal('pick')}><${Icon} name="folderMove" />Добавить колоды</button>`}
          <//>`
        : html`
          ${n > 0 &&
          html`<p class="scope-note"><${Icon} name="layers" size=${18} />Режимы ниже — по всем словам папки</p>
            <${StudyPrefs} prefs=${prefs} />
            <${StudyModes} scope=${folderScope(folder.id)} n=${n} due=${due} newAvail=${newAvail} dir=${prefs.dir} />`}
          <div class="section-head"><h2>Колоды</h2>${actions}</div>
          <div class="deck-grid">
            ${decks.map((d) => html`<${DeckTile} key=${d.id} deck=${d} s=${stats.get(d.id)} />`)}
          </div>`}
    </main>
    ${modal === 'rename' &&
    html`<${PromptModal} title="Название папки" initial=${folder.name}
      onOk=${async (name) => { await renameFolder(folder.id, name); setModal(null); }}
      onClose=${() => setModal(null)} />`}
    ${modal === 'newDeck' &&
    html`<${PromptModal} title=${`Новая колода в «${folder.name}»`} placeholder="Например: Животные" okText="Создать"
      onOk=${async (name) => { const deck = await createDeck(name, folder.id); setModal(null); navigate('/deck/' + deck.id); }}
      onClose=${() => setModal(null)} />`}
    ${modal === 'pick' &&
    html`<${PickDecksModal} folder=${folder} decks=${others} folders=${folders} onClose=${() => setModal(null)} />`}
  `;
}
