import { html, useState } from '../../vendor/preact-htm.mjs';
import { listFolders, listDecks, listCards, progressMap, createDeck, createFolder, folderOf } from '../db.js';
import { isDue, isNew } from '../srs.js';
import { setPrefs, DIRS } from '../prefs.js';
import {
  TopBar, Icon, Thumb, PromptModal, useLive, usePrefs, cardsWord, plural, navigate, Loading, Empty,
} from '../ui.js';

export const decksWord = (n) => `${n} ${plural(n, ['колода', 'колоды', 'колод'])}`;

// Сводка по всей библиотеке: карточки, «к повторению» и обложки — по колодам и папкам.
export async function libraryStats(dir) {
  const [folders, decks, cards, prog] = await Promise.all([listFolders(), listDecks(), listCards('all'), progressMap(dir)]);
  const now = Date.now();
  const stats = new Map(decks.map((d) => [d.id, { count: 0, due: 0, fresh: 0, cover: null }]));
  for (const c of cards) {
    const s = stats.get(c.deckId);
    if (!s) continue;
    s.count++;
    const p = prog.get(c.id);
    if (isDue(p, now)) s.due++;
    else if (isNew(p)) s.fresh++;
    if (!s.cover && c.image) s.cover = c.image;
  }
  const folderStats = new Map(
    folders.map((f) => {
      const inside = decks.filter((d) => d.folderId === f.id).map((d) => stats.get(d.id));
      return [
        f.id,
        {
          decks: inside.length,
          count: inside.reduce((n, s) => n + s.count, 0),
          due: inside.reduce((n, s) => n + s.due, 0),
          covers: inside.map((s) => s.cover).filter(Boolean).slice(0, 4),
        },
      ];
    })
  );
  const loose = decks.filter((d) => !folderOf(d, folders));
  const totalDue = [...stats.values()].reduce((sum, s) => sum + s.due, 0);
  return { folders, decks, loose, stats, folderStats, total: cards.length, totalDue };
}

export function DeckTile({ deck, s }) {
  return html`<a class="deck-tile" href=${'#/deck/' + deck.id}>
    <div class="deck-cover"><${Thumb} blob=${s.cover} fallback="言" /></div>
    <div class="deck-info">
      <div class="deck-name">${deck.name}</div>
      <div class="deck-meta">
        ${cardsWord(s.count)}
        ${s.due > 0 && html`<span class="badge due">${s.due} к повторению</span>`}
      </div>
    </div>
  </a>`;
}

function FolderTile({ folder, s }) {
  const cells = [0, 1, 2, 3].map((i) => s.covers[i] || null);
  return html`<a class="deck-tile folder-tile" href=${'#/folder/' + folder.id}>
    <div class="deck-cover mosaic">
      ${cells.map((blob, i) => html`<div class="mosaic-cell" key=${i}>${blob ? html`<${Thumb} blob=${blob} />` : null}</div>`)}
      <span class="folder-badge"><${Icon} name="folder" size=${16} /></span>
    </div>
    <div class="deck-info">
      <div class="deck-name">${folder.name}</div>
      <div class="deck-meta">
        ${decksWord(s.decks)} · ${cardsWord(s.count)}
        ${s.due > 0 && html`<span class="badge due">${s.due} к повторению</span>`}
      </div>
    </div>
  </a>`;
}

// «Учить всё»: любой режим по всем словам из всех колод — в одно нажатие.
function StudyAll({ total, decks, due, prefs }) {
  const base = '#/study/all/';
  const nextDir = prefs.dir === 'jr' ? 'rj' : 'jr';
  const mode = (href, icon, label, extra, disabled) =>
    disabled
      ? html`<span class="quick-mode disabled"><${Icon} name=${icon} /><span>${label}</span></span>`
      : html`<a class="quick-mode" href=${href}><${Icon} name=${icon} /><span>${label}</span>${extra}</a>`;
  return html`<section class="launcher">
    <div class="launcher-head">
      <div>
        <div class="launcher-title">Учить всё</div>
        <div class="launcher-sub">${cardsWord(total)} · ${decksWord(decks)}</div>
      </div>
      <button class="chip" title=${'Сменить направление: ' + DIRS[nextDir].label} onClick=${() => setPrefs({ dir: nextDir })}>
        <${Icon} name="swap" size=${16} />${DIRS[prefs.dir].short}
      </button>
    </div>
    <div class="quick-modes">
      ${mode(base + 'cards', 'cards', 'Карточки')}
      ${mode(base + 'srs', 'repeat', 'Повторение', due > 0 && html`<span class="quick-badge">${due}</span>`)}
      ${mode(base + 'choice', 'choice', 'Выбор', null, total < 2)}
      ${mode(base + 'write', 'pen', 'Письмо')}
    </div>
    <a class="launcher-link" href="#/deck/all">Все слова списком →</a>
  </section>`;
}

const INSTALL_KEY = 'kotoba-install-hint';
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isPhone = () => matchMedia('(pointer: coarse)').matches;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

function shouldHintInstall() {
  try {
    return isPhone() && !isInstalled() && !localStorage.getItem(INSTALL_KEY);
  } catch {
    return false;
  }
}

// На телефоне браузер может стереть данные сайта; у приложения на главном экране такого нет.
function InstallHint({ onClose }) {
  return html`<div class="install-hint">
    <div>
      <b>Установите на главный экран</b>
      <p>
        Так карточки не пропадут и приложение будет открываться без интернета.
        ${isIOS() ? ' В Safari: «Поделиться» → «На экран Домой».' : ' В Chrome: меню ⋮ → «Добавить на главный экран».'}
      </p>
    </div>
    <button class="icon-btn" aria-label="Скрыть" onClick=${onClose}><${Icon} name="close" size=${18} /></button>
  </div>`;
}

export function Home() {
  const prefs = usePrefs();
  const data = useLive(() => libraryStats(prefs.dir), [prefs.dir]);
  const [creating, setCreating] = useState(null); // 'deck' | 'folder'
  const [installHint, setInstallHint] = useState(shouldHintInstall);
  const hideInstallHint = () => {
    try {
      localStorage.setItem(INSTALL_KEY, '1');
    } catch {}
    setInstallHint(false);
  };

  const create = async (name) => {
    const kind = creating;
    setCreating(null);
    if (kind === 'folder') navigate('/folder/' + (await createFolder(name)).id);
    else navigate('/deck/' + (await createDeck(name)).id);
  };

  const addButtons = html`<div class="section-actions">
    <button class="btn small" onClick=${() => setCreating('folder')}><${Icon} name="folder" size=${18} />Папка</button>
    <button class="btn small primary" onClick=${() => setCreating('deck')}><${Icon} name="plus" size=${18} />Колода</button>
  </div>`;

  let body;
  if (data === undefined) body = html`<${Loading} />`;
  else if (!data.decks.length && !data.folders.length) {
    body = html`<${Empty} title="Колод пока нет" text="Создайте первую колоду и добавьте в неё слова. Колоды можно раскладывать по папкам.">
      <button class="btn primary" onClick=${() => setCreating('deck')}><${Icon} name="plus" />Новая колода</button>
      <button class="btn" onClick=${() => setCreating('folder')}><${Icon} name="folder" />Новая папка</button>
    <//>`;
  } else {
    body = html`
      ${data.total > 0 && html`<${StudyAll} total=${data.total} decks=${data.decks.length} due=${data.totalDue} prefs=${prefs} />`}
      ${data.folders.length > 0 &&
      html`<div class="section-head"><h2>Папки</h2></div>
        <div class="deck-grid">
          ${data.folders.map((f) => html`<${FolderTile} key=${f.id} folder=${f} s=${data.folderStats.get(f.id)} />`)}
        </div>`}
      <div class="section-head"><h2>Колоды</h2>${addButtons}</div>
      ${data.loose.length > 0
        ? html`<div class="deck-grid">
            ${data.loose.map((d) => html`<${DeckTile} key=${d.id} deck=${d} s=${data.stats.get(d.id)} />`)}
          </div>`
        : html`<p class="muted">${data.decks.length ? 'Все колоды лежат в папках.' : 'Колод пока нет — создайте первую.'}</p>`}`;
  }

  return html`
    <${TopBar} title=${html`<span class="logo jp">言葉</span> Kotoba`} sub="японские карточки" />
    <main class="page">
      ${installHint && html`<${InstallHint} onClose=${hideInstallHint} />`}
      ${body}
    </main>
    ${creating &&
    html`<${PromptModal}
      title=${creating === 'folder' ? 'Новая папка' : 'Новая колода'}
      placeholder=${creating === 'folder' ? 'Например: JLPT N5' : 'Например: Животные'}
      okText="Создать" onOk=${create} onClose=${() => setCreating(null)} />`}
  `;
}
