// Мелкие настройки изучения — в localStorage (переживают перезапуск, не критичны при потере).
const KEY = 'kotoba-prefs';
const defaults = {
  dir: 'jr', // jr: японский → русский, rj: русский → японский
  hideImage: false, // скрывать картинку на стороне вопроса
  shuffle: true,
  newPerDay: 10,
};

function load() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...defaults };
  }
}

let current = load();
const listeners = new Set();

export const getPrefs = () => current;

export function setPrefs(patch) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* приватный режим — живём без сохранения */
  }
  listeners.forEach((fn) => fn(current));
}

export function subscribePrefs(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const DIRS = {
  jr: { short: '日本語 → Рус', label: 'Японский → русский' },
  rj: { short: 'Рус → 日本語', label: 'Русский → японский' },
};
