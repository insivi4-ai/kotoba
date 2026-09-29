// Сервис-воркер: приложение работает без интернета.
// Список файлов и версию обновляет tools/build_sw.py — запускайте его перед каждой публикацией.
const VERSION = '562b100f54';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/db.js',
  'js/dict.js',
  'js/kana.js',
  'js/prefs.js',
  'js/speech.js',
  'js/srs.js',
  'js/starter.js',
  'js/ui.js',
  'js/views/bulk.js',
  'js/views/deck.js',
  'js/views/editor.js',
  'js/views/home.js',
  'js/views/image-field.js',
  'js/views/settings.js',
  'js/views/study.js',
  'vendor/preact-htm.mjs',
  'vendor/wanakana.mjs',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'starter/akai.webp',
  'starter/aoi.webp',
  'starter/chiisai.webp',
  'starter/dorobou.webp',
  'starter/harinezumi.webp',
  'starter/hitsuji.webp',
  'starter/ika.webp',
  'starter/ikimasu.webp',
  'starter/isha.webp',
  'starter/mo.webp',
  'starter/nezumi.webp',
  'starter/ookami.webp',
  'starter/ookii.webp',
  'starter/starter.json',
  'starter/tako.webp',
  'starter/tatakai.webp',
  'starter/tori.webp',
  'starter/uchi.webp'
];
// __ASSETS_END__

const SHELL = `kotoba-shell-${VERSION}`;
const DATA = 'kotoba-data-v1';
const FONTS = 'kotoba-fonts-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kotoba-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(cacheFirst(FONTS, request));
    return;
  }
  if (url.origin !== location.origin) return;

  // Словарь большой и меняется редко — отдельный кэш, загружается при первом использовании.
  if (url.pathname.endsWith('/data/dict.json')) {
    event.respondWith(cacheFirst(DATA, request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(caches.match('index.html').then((hit) => hit || fetch(request)));
    return;
  }

  event.respondWith(caches.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request)));
});
