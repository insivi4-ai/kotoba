import { html, useState, useEffect, useRef } from '../vendor/preact-htm.mjs';
import { bus } from './db.js';
import { frontText, sizeClass } from './kana.js';
import { canSpeak, speak } from './speech.js';
import { getPrefs, subscribePrefs } from './prefs.js';

export const navigate = (path) => {
  location.hash = path;
};

// Русские окончания: plural(5, ['карточка', 'карточки', 'карточек'])
export function plural(n, [one, few, many]) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
export const cardsWord = (n) => `${n} ${plural(n, ['карточка', 'карточки', 'карточек'])}`;

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Хуки ----------

// Загружает данные и перечитывает их после любых изменений в базе.
export function useLive(loader, deps = []) {
  const [data, setData] = useState(undefined);
  useEffect(() => {
    let alive = true;
    const run = () =>
      loader()
        .then((d) => alive && setData(d))
        .catch((e) => {
          console.error(e);
          if (alive) setData(null);
        });
    run();
    bus.addEventListener('change', run);
    return () => {
      alive = false;
      bus.removeEventListener('change', run);
    };
  }, deps);
  return data;
}

export function usePrefs() {
  const [prefs, set] = useState(getPrefs);
  useEffect(() => subscribePrefs(set), []);
  return prefs;
}

export function useImageUrl(blob) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function useKeys(handler, deps) {
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && e.key !== 'Enter') return;
      handler(e);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, deps);
}

// ---------- Иконки (контурные, 24×24) ----------

const ICONS = {
  back: 'M15 18l-6-6 6-6',
  close: 'M18 6L6 18M6 6l12 12',
  plus: 'M12 5v14M5 12h14',
  check: 'M20 6L9 17l-5-5',
  deck: 'M4 7h13a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2zM6 4h13a3 3 0 013 3v10',
  settings:
    'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  cards: 'M3 8a2 2 0 012-2h11a2 2 0 012 2v11a2 2 0 01-2 2H5a2 2 0 01-2-2zM7 3h12a2 2 0 012 2v12',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  pencil: 'M17 3a2.8 2.8 0 014 4L7.5 20.5 2 22l1.5-5.5z',
  trash: 'M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6',
  sound: 'M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14',
  shuffle: 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  more: 'M12 13a1 1 0 100-2 1 1 0 000 2zM19 13a1 1 0 100-2 1 1 0 000 2zM5 13a1 1 0 100-2 1 1 0 000 2z',
  image: 'M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM21 15l-5-5L5 21',
  undo: 'M3 7v6h6M3 13a9 9 0 103-7.7L3 7',
  upload: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
  download: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  eyeOff: 'M17.9 17.9A10.1 10.1 0 0112 20c-7 0-11-8-11-8a18.4 18.4 0 015.1-5.9M9.9 4.2A9.1 9.1 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.2 3.2M1 1l22 22M14.1 14.1a3 3 0 01-4.2-4.2',
  crop: 'M6 2v14a2 2 0 002 2h14M18 22V8a2 2 0 00-2-2H2',
  pen: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z',
  choice: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  swap: 'M7 16V4M3 8l4-4 4 4M17 8v12M21 16l-4 4-4-4',
};

export function Icon({ name, size = 22 }) {
  return html`<svg class="icon" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${ICONS[name]} /></svg>`;
}

// ---------- Каркас ----------

export function TopBar({ title, sub, back, children }) {
  return html`<header class="topbar">
    ${back && html`<a class="icon-btn" href=${back} aria-label="Назад"><${Icon} name="back" /></a>`}
    <div class="topbar-title">
      <h1>${title}</h1>
      ${sub && html`<div class="topbar-sub">${sub}</div>`}
    </div>
    <div class="topbar-actions">${children}</div>
  </header>`;
}

export function TabBar({ active }) {
  const tab = (href, icon, label, names) => html`<a href=${href}
    class=${'tab' + (names.includes(active) ? ' active' : '')}><${Icon} name=${icon} /><span>${label}</span></a>`;
  return html`<nav class="tabbar">
    ${tab('#/', 'deck', 'Колоды', ['home', 'deck'])}
    ${tab('#/add', 'plus', 'Добавить', ['add', 'edit', 'bulk'])}
    ${tab('#/settings', 'settings', 'Настройки', ['settings'])}
  </nav>`;
}

export function Menu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return html`<div class="menu" ref=${ref}>
    <button class="icon-btn" aria-label="Ещё" onClick=${() => setOpen(!open)}><${Icon} name="more" /></button>
    ${open &&
    html`<div class="menu-list">
      ${items.map(
        (it) => html`<button class=${'menu-item' + (it.danger ? ' danger' : '')}
          onClick=${() => { setOpen(false); it.onClick(); }}><${Icon} name=${it.icon} size=${18} />${it.label}</button>`
      )}
    </div>`}
  </div>`;
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  return html`<div class="modal-backdrop" onPointerDown=${(e) => e.target === e.currentTarget && onClose?.()}>
    <div class=${'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true">
      ${title && html`<h2 class="modal-title">${title}</h2>`}
      ${children}
    </div>
  </div>`;
}

export function PromptModal({ title, initial = '', placeholder, okText = 'Сохранить', onOk, onClose }) {
  const [value, setValue] = useState(initial);
  const submit = (e) => {
    e.preventDefault();
    if (value.trim()) onOk(value.trim());
  };
  return html`<${Modal} title=${title} onClose=${onClose}>
    <form onSubmit=${submit}>
      <input class="input" autofocus value=${value} placeholder=${placeholder}
        onInput=${(e) => setValue(e.target.value)} ref=${(el) => el && setTimeout(() => el.focus(), 30)} />
      <div class="modal-actions">
        <button type="button" class="btn ghost" onClick=${onClose}>Отмена</button>
        <button type="submit" class="btn primary" disabled=${!value.trim()}>${okText}</button>
      </div>
    </form>
  <//>`;
}

// ---------- Всплывающие сообщения ----------

let toastId = 0;
const toastListeners = new Set();
let toasts = [];

export function toast(text, kind = '') {
  const t = { id: ++toastId, text, kind };
  toasts = [...toasts, t];
  toastListeners.forEach((fn) => fn(toasts));
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    toastListeners.forEach((fn) => fn(toasts));
  }, kind === 'long' ? 6000 : 2600);
}

export function Toasts() {
  const [list, setList] = useState(toasts);
  useEffect(() => {
    toastListeners.add(setList);
    return () => toastListeners.delete(setList);
  }, []);
  return html`<div class="toasts" aria-live="polite">
    ${list.map((t) => html`<div key=${t.id} class=${'toast ' + t.kind}>${t.text}</div>`)}
  </div>`;
}

// ---------- Карточка ----------

export function SpeakButton({ text, big }) {
  if (!canSpeak() || !text) return null;
  return html`<button type="button" class=${'speak' + (big ? ' big' : '')} aria-label="Произнести"
    onClick=${(e) => { e.stopPropagation(); speak(text); }}><${Icon} name="sound" size=${big ? 22 : 20} /></button>`;
}

function CardImg({ url }) {
  return url ? html`<img class="fc-img" src=${url} alt="" draggable="false" />` : null;
}

// Сторона-вопрос: dir 'jr' — кандзи/кана, 'rj' — перевод.
export function QuestionFace({ card, dir, url, hideImage, hint, children }) {
  const text = dir === 'jr' ? frontText(card) : card.translation;
  return html`<div class="fc-face fc-front">
    ${!hideImage && html`<${CardImg} url=${url} />`}
    <div class="fc-panel">
      ${dir === 'jr'
        ? html`<div class=${'fc-main jp ' + sizeClass(text)}>${text}</div>`
        : html`<div class="fc-main ru">${text}</div>`}
      ${children}
      ${hint && html`<div class="fc-hint">${hint}</div>`}
    </div>
  </div>`;
}

export function AnswerBody({ card, speakBig }) {
  return html`
    ${card.kanji && html`<div class=${'fc-main jp ' + sizeClass(card.kanji)}>${card.kanji}</div>`}
    <div class=${card.kanji ? 'fc-kana jp' : 'fc-main jp ' + sizeClass(card.kana)}>${card.kana}</div>
    <div class="fc-tr">${card.translation}</div>
    <${SpeakButton} text=${card.kana} big=${speakBig} />`;
}

export function FlipCard({ card, dir = 'jr', flipped, onFlip, hideImage, hint }) {
  const url = useImageUrl(card.image);
  return html`<div class=${'fc' + (flipped ? ' flipped' : '') + (url ? '' : ' no-img')}
      onClick=${onFlip} role="button" tabindex="0" aria-label=${flipped ? 'Ответ' : 'Вопрос'}>
    <div class="fc-inner">
      <${QuestionFace} card=${card} dir=${dir} url=${url} hideImage=${hideImage} hint=${hint} />
      <div class="fc-face fc-back">
        <${CardImg} url=${url} />
        <div class="fc-panel"><${AnswerBody} card=${card} /></div>
      </div>
    </div>
  </div>`;
}

// Карточка без переворота (для тестов): вопрос + опционально ответ под ним.
export function StaticCard({ card, dir, hideImage, reveal }) {
  const url = useImageUrl(card.image);
  return html`<div class=${'fc static' + (url ? '' : ' no-img')}>
    <div class="fc-inner">
      <${QuestionFace} card=${card} dir=${dir} url=${url} hideImage=${hideImage}>
        ${reveal &&
        html`<div class="reveal">
          ${dir === 'jr'
            ? html`${card.kanji && html`<div class="fc-kana jp">${card.kana}</div>`}`
            : html`${card.kanji && html`<div class="fc-main jp m">${card.kanji}</div>`}
                <div class="fc-kana jp">${card.kana}</div>`}
          <${SpeakButton} text=${card.kana} />
        </div>`}
      <//>
    </div>
  </div>`;
}

export function Thumb({ blob, fallback }) {
  const url = useImageUrl(blob);
  return url
    ? html`<img class="thumb-img" src=${url} alt="" loading="lazy" />`
    : html`<div class="thumb-img placeholder jp">${fallback}</div>`;
}

export function Empty({ title, text, children }) {
  return html`<div class="empty">
    <div class="empty-mark jp">空</div>
    <h3>${title}</h3>
    ${text && html`<p>${text}</p>`}
    <div class="empty-actions">${children}</div>
  </div>`;
}

export const Loading = () => html`<div class="loading"><span class="spinner"></span></div>`;
