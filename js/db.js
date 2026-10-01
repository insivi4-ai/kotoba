// Хранилище в IndexedDB: папки, колоды, карточки (с картинками-Blob), прогресс повторения, служебные флаги.
const DB_NAME = 'kotoba';
const DB_VERSION = 2;

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      // Миграции по шагам: у уже установленного приложения данные сохраняются.
      req.onupgradeneeded = (e) => {
        const db = req.result;
        if (e.oldVersion < 1) {
          db.createObjectStore('decks', { keyPath: 'id' });
          db.createObjectStore('cards', { keyPath: 'id' }).createIndex('deckId', 'deckId');
          db.createObjectStore('progress', { keyPath: 'id' }).createIndex('cardId', 'cardId');
          db.createObjectStore('meta', { keyPath: 'key' });
        }
        if (e.oldVersion < 2) {
          db.createObjectStore('folders', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // Новая версия приложения в другой вкладке — уступаем ей базу.
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function transaction(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    Promise.resolve(fn(tx)).then((r) => (result = r), reject);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const read = (store, fn) => transaction([store], 'readonly', (tx) => fn(tx.objectStore(store)));

// Подписка на изменения: экраны перечитывают данные после любой записи.
export const bus = new EventTarget();
const notify = () => bus.dispatchEvent(new Event('change'));

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

const byCreated = (a, b) => a.createdAt - b.createdAt;

// ---------- Папки ----------

export async function listFolders() {
  return (await read('folders', (s) => request(s.getAll()))).sort(byCreated);
}

export const getFolder = (id) => read('folders', (s) => request(s.get(id)));

export async function createFolder(name) {
  const folder = { id: uid(), name: name.trim() || 'Новая папка', createdAt: Date.now() };
  await transaction(['folders'], 'readwrite', (tx) => tx.objectStore('folders').put(folder));
  notify();
  return folder;
}

export async function renameFolder(id, name) {
  await transaction(['folders'], 'readwrite', async (tx) => {
    const store = tx.objectStore('folders');
    const folder = await request(store.get(id));
    if (folder) store.put({ ...folder, name: name.trim() || folder.name });
  });
  notify();
}

// Колоды из удалённой папки не удаляются — просто становятся «без папки».
export async function deleteFolder(id) {
  await transaction(['folders', 'decks'], 'readwrite', async (tx) => {
    tx.objectStore('folders').delete(id);
    const decks = tx.objectStore('decks');
    for (const deck of await request(decks.getAll())) {
      if (deck.folderId === id) decks.put({ ...deck, folderId: null });
    }
  });
  notify();
}

// Колода считается «без папки», если её папки нет (например, колоду импортировали отдельно).
export const folderOf = (deck, folders) => (deck.folderId && folders.find((f) => f.id === deck.folderId)) || null;

// ---------- Колоды ----------

export async function listDecks() {
  return (await read('decks', (s) => request(s.getAll()))).sort(byCreated);
}

export const getDeck = (id) => read('decks', (s) => request(s.get(id)));

export async function moveDecks(deckIds, folderId) {
  await transaction(['decks'], 'readwrite', async (tx) => {
    const store = tx.objectStore('decks');
    for (const id of deckIds) {
      const deck = await request(store.get(id));
      if (deck) store.put({ ...deck, folderId: folderId || null });
    }
  });
  notify();
}

export async function createDeck(name, folderId = null) {
  const deck = { id: uid(), name: name.trim() || 'Новая колода', folderId, createdAt: Date.now() };
  await transaction(['decks'], 'readwrite', (tx) => tx.objectStore('decks').put(deck));
  notify();
  return deck;
}

export async function renameDeck(id, name) {
  await transaction(['decks'], 'readwrite', async (tx) => {
    const store = tx.objectStore('decks');
    const deck = await request(store.get(id));
    if (deck) store.put({ ...deck, name: name.trim() || deck.name });
  });
  notify();
}

export async function deleteDeck(id) {
  await transaction(['decks', 'cards', 'progress'], 'readwrite', async (tx) => {
    tx.objectStore('decks').delete(id);
    const cards = await request(tx.objectStore('cards').index('deckId').getAllKeys(id));
    for (const cardId of cards) await deleteCardIn(tx, cardId);
  });
  notify();
}

// ---------- Карточки ----------

export async function listCards(deckId) {
  const cards = await read('cards', (s) =>
    request(deckId && deckId !== 'all' ? s.index('deckId').getAll(deckId) : s.getAll())
  );
  return cards.sort(byCreated);
}

export const getCard = (id) => read('cards', (s) => request(s.get(id)));

// Набор для изучения: 'all' — все карточки, 'folder:<id>' — все колоды папки, иначе — id колоды.
export const folderScope = (id) => 'folder:' + id;
export const scopeFolderId = (scope) => (scope?.startsWith('folder:') ? scope.slice(7) : null);

export async function decksInScope(scope) {
  if (scope === 'all') return listDecks();
  const folderId = scopeFolderId(scope);
  if (folderId) return (await listDecks()).filter((d) => d.folderId === folderId);
  const deck = await getDeck(scope);
  return deck ? [deck] : [];
}

export async function listCardsInScope(scope) {
  const folderId = scopeFolderId(scope);
  if (!folderId) return listCards(scope);
  const ids = new Set((await decksInScope(scope)).map((d) => d.id));
  return (await listCards('all')).filter((c) => ids.has(c.deckId));
}

export async function saveCard(card) {
  const now = Date.now();
  const saved = { createdAt: now, ...card, id: card.id || uid(), updatedAt: now };
  await transaction(['cards'], 'readwrite', (tx) => tx.objectStore('cards').put(saved));
  notify();
  return saved;
}

export async function saveCards(cards) {
  const now = Date.now();
  await transaction(['cards'], 'readwrite', (tx) => {
    const store = tx.objectStore('cards');
    cards.forEach((card, i) => store.put({ createdAt: now + i, ...card, id: card.id || uid(), updatedAt: now }));
  });
  notify();
}

async function deleteCardIn(tx, cardId) {
  tx.objectStore('cards').delete(cardId);
  const progress = tx.objectStore('progress');
  const keys = await request(progress.index('cardId').getAllKeys(cardId));
  keys.forEach((k) => progress.delete(k));
}

export async function deleteCard(id) {
  await transaction(['cards', 'progress'], 'readwrite', (tx) => deleteCardIn(tx, id));
  notify();
}

// ---------- Прогресс интервального повторения ----------

export async function progressMap(dir) {
  const all = await read('progress', (s) => request(s.getAll()));
  return new Map(all.filter((p) => p.dir === dir).map((p) => [p.cardId, p]));
}

export async function saveProgress(p) {
  await transaction(['progress'], 'readwrite', (tx) => tx.objectStore('progress').put(p));
}

// ---------- Служебное ----------

export async function getMeta(key, fallback = null) {
  const row = await read('meta', (s) => request(s.get(key)));
  return row ? row.value : fallback;
}

export const setMeta = (key, value) =>
  transaction(['meta'], 'readwrite', (tx) => tx.objectStore('meta').put({ key, value }));

// ---------- Экспорт / импорт ----------

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

// scope: 'all' — полная копия с прогрессом; колода или 'folder:<id>' — чтобы поделиться (без прогресса).
export async function exportData(scope = 'all') {
  const full = scope === 'all';
  const decks = await decksInScope(scope);
  const folderIds = new Set(decks.map((d) => d.folderId).filter(Boolean));
  const folders = (await listFolders()).filter((f) => full || folderIds.has(f.id));
  const cards = await listCardsInScope(scope);
  const progress = full ? await read('progress', (s) => request(s.getAll())) : [];
  return {
    app: 'kotoba',
    version: 2,
    exportedAt: new Date().toISOString(),
    folders,
    decks,
    cards: await Promise.all(
      cards.map(async (c) => ({ ...c, image: c.image ? await blobToDataUrl(c.image) : null }))
    ),
    progress,
  };
}

export async function importData(data) {
  if (!data || data.app !== 'kotoba' || !Array.isArray(data.cards)) {
    throw new Error('Это не файл Kotoba');
  }
  const cards = await Promise.all(
    data.cards.map(async (c) => ({ ...c, image: c.image ? await (await fetch(c.image)).blob() : null }))
  );
  await transaction(['folders', 'decks', 'cards', 'progress'], 'readwrite', (tx) => {
    (data.folders || []).forEach((f) => tx.objectStore('folders').put(f));
    (data.decks || []).forEach((d) => tx.objectStore('decks').put(d));
    cards.forEach((c) => tx.objectStore('cards').put(c));
    (data.progress || []).forEach((p) => tx.objectStore('progress').put(p));
  });
  notify();
  return { decks: (data.decks || []).length, cards: cards.length };
}
