import { html, useState } from '../../vendor/preact-htm.mjs';
import { listDecks, listCards, progressMap, createDeck } from '../db.js';
import { isDue, isNew } from '../srs.js';
import { TopBar, Icon, Thumb, PromptModal, useLive, usePrefs, cardsWord, navigate, Loading, Empty } from '../ui.js';

export async function deckStats(dir) {
  const [decks, cards, prog] = await Promise.all([listDecks(), listCards('all'), progressMap(dir)]);
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
  const totalDue = [...stats.values()].reduce((sum, s) => sum + s.due, 0);
  return { decks, stats, total: cards.length, totalDue };
}

function DeckTile({ deck, s }) {
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
  const data = useLive(() => deckStats(prefs.dir), [prefs.dir]);
  const [creating, setCreating] = useState(false);
  const [installHint, setInstallHint] = useState(shouldHintInstall);
  const hideInstallHint = () => {
    try {
      localStorage.setItem(INSTALL_KEY, '1');
    } catch {}
    setInstallHint(false);
  };

  const create = async (name) => {
    const deck = await createDeck(name);
    setCreating(false);
    navigate('/deck/' + deck.id);
  };

  return html`
    <${TopBar} title=${html`<span class="logo jp">言葉</span> Kotoba`} sub="японские карточки" />
    <main class="page">
      ${data === undefined
        ? html`<${Loading} />`
        : html`
          ${installHint && html`<${InstallHint} onClose=${hideInstallHint} />`}
          ${data.totalDue > 0 &&
          html`<a class="due-banner" href="#/study/all/srs">
            <div>
              <div class="due-title">Пора повторить</div>
              <div class="due-sub">${cardsWord(data.totalDue)} ждут вас сегодня</div>
            </div>
            <span class="btn primary small">Начать</span>
          </a>`}
          ${data.decks.length === 0
            ? html`<${Empty} title="Колод пока нет" text="Создайте первую колоду и добавьте в неё слова.">
                <button class="btn primary" onClick=${() => setCreating(true)}><${Icon} name="plus" />Новая колода</button>
              <//>`
            : html`
              <div class="section-head"><h2>Колоды</h2></div>
              <div class="deck-grid">
                ${data.decks.map((d) => html`<${DeckTile} key=${d.id} deck=${d} s=${data.stats.get(d.id)} />`)}
                <button class="deck-tile new" onClick=${() => setCreating(true)}>
                  <${Icon} name="plus" size=${28} /><span>Новая колода</span>
                </button>
              </div>
              ${data.decks.length > 1 &&
              html`<a class="row-link" href="#/deck/all">
                <span>Все карточки</span><span class="muted">${cardsWord(data.total)} →</span>
              </a>`}`}`}
    </main>
    ${creating &&
    html`<${PromptModal} title="Новая колода" placeholder="Например: Животные" okText="Создать"
      onOk=${create} onClose=${() => setCreating(false)} />`}
  `;
}
