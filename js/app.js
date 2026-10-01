import { html, render, useState, useEffect } from '../vendor/preact-htm.mjs';
import { seedIfNeeded } from './starter.js';
import { TabBar, Toasts, Loading } from './ui.js';
import { Home } from './views/home.js';
import { DeckView } from './views/deck.js';
import { FolderView } from './views/folder.js';
import { Editor } from './views/editor.js';
import { Bulk } from './views/bulk.js';
import { Settings } from './views/settings.js';
import { Study } from './views/study.js';

function parseHash() {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || 'home', params: parts.slice(1), query: new URLSearchParams(qs || '') };
}

// Баннер «доступна новая версия» — появляется, когда сервис-воркер скачал обновление.
function UpdateBanner() {
  const [worker, setWorker] = useState(null);
  useEffect(() => {
    const onUpdate = (e) => setWorker(e.detail);
    addEventListener('sw-update', onUpdate);
    return () => removeEventListener('sw-update', onUpdate);
  }, []);
  if (!worker) return null;
  return html`<div class="update-banner">
    <span>Есть новая версия приложения</span>
    <button class="btn small primary" onClick=${() => worker.postMessage('skip-waiting')}>Обновить</button>
  </div>`;
}

function App() {
  const [route, setRoute] = useState(parseHash);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash());
      scrollTo(0, 0);
    };
    addEventListener('hashchange', onHash);
    seedIfNeeded()
      .catch((e) => console.error('Стартовая колода не загрузилась', e))
      .finally(() => setReady(true));
    return () => removeEventListener('hashchange', onHash);
  }, []);

  if (!ready) return html`<${Loading} />`;

  const { name, params, query } = route;
  let view;
  let tabs = true;
  switch (name) {
    case 'deck':
      view = html`<${DeckView} key=${params[0]} id=${params[0]} />`;
      break;
    case 'folder':
      view = html`<${FolderView} key=${params[0]} id=${params[0]} />`;
      break;
    case 'study':
      view = html`<${Study} key=${params.join('/')} scope=${params[0]} mode=${params[1]} />`;
      tabs = false;
      break;
    case 'add':
      view = html`<${Editor} key=${'add' + location.hash} deckId=${query.get('deck')} />`;
      break;
    case 'edit':
      view = html`<${Editor} key=${params[0]} cardId=${params[0]} />`;
      break;
    case 'bulk':
      view = html`<${Bulk} key=${location.hash} deckId=${query.get('deck')} />`;
      break;
    case 'settings':
      view = html`<${Settings} />`;
      break;
    default:
      view = html`<${Home} />`;
  }

  return html`<div class=${'app' + (tabs ? ' with-tabs' : ' focus')}>
    ${view}
    ${tabs && html`<${TabBar} active=${name} />`}
    <${Toasts} />
    <${UpdateBanner} />
  </div>`;
}

render(html`<${App} />`, document.getElementById('app'));

// На localhost офлайн-кэш мешает разработке — включается только с ?sw в адресе.
const devHost = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !location.search.includes('sw');

if ('serviceWorker' in navigator && location.protocol !== 'file:' && !devHost) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const announce = (w) => w && dispatchEvent(new CustomEvent('sw-update', { detail: w }));
    if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) announce(w);
      });
    });
  });
}
