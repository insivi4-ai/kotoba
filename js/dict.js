// Японско-русский словарь (JMdict). Загружается по требованию — только на экранах добавления.
import { toHiragana, hasKanji } from './kana.js';

let loading = null;
let entries = null;

const KATAKANA = /[ァ-ヶ]/g;
const kataToHira = (s) => s.replace(KATAKANA, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
const CYRILLIC = /[а-яё]/i;
const HAS_KATAKANA = /[ァ-ヺ]/;

export const dictReady = () => !!entries;

export function loadDict() {
  if (!loading) {
    loading = fetch('data/dict.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((raw) => {
        entries = raw.map(([k, r, full, flags]) => {
          const kana = r.split('|');
          return { kanji: k ? k.split('|') : [], kana, kanaH: kana.map(kataToHira), full, flags, lower: null };
        });
        return entries;
      })
      .catch((e) => {
        loading = null;
        throw e;
      });
  }
  return loading;
}

function toSuggestion(e, query) {
  const kana = e.kana.find((k) => !HAS_KATAKANA.test(k)) || e.kana[0];
  const typedKanji = hasKanji(query);
  // Если искали по кандзи — берём именно ту запись, что набрали.
  const matched = typedKanji && (e.kanji.find((k) => k === query) || e.kanji.find((k) => k.startsWith(query)));
  const kanji = matched || e.kanji[0] || '';
  const usuallyKana = !!(e.flags & 2) && !typedKanji;
  const english = !!(e.flags & 4);
  const meanings = e.full.split(/;\s*/);
  return {
    kanji: usuallyKana ? '' : kanji,
    altKanji: usuallyKana ? kanji : '',
    kana,
    translation: english ? '' : meanings[0],
    meanings,
    english,
    common: !!(e.flags & 1),
  };
}

function scoreRussian(e, q) {
  if (e.flags & 4) return 0;
  const text = (e.lower ??= e.full.toLowerCase().replace(/ё/g, 'е'));
  if (!text.includes(q)) return 0;
  let best = 5;
  text.split(/[;,]\s*/).forEach((term, i) => {
    const t = term.trim();
    if (t === q) best = Math.max(best, 100 - i * 4);
    else if (t.startsWith(q + ' ') || t.endsWith(' ' + q)) best = Math.max(best, 50 - i);
    else if (t.startsWith(q)) best = Math.max(best, 30 - i);
  });
  return best;
}

function scoreJapanese(e, q, qh) {
  let best = 0;
  for (const k of e.kanji) {
    if (k === q) best = Math.max(best, 100);
    else if (k.startsWith(q)) best = Math.max(best, 50 - (k.length - q.length));
  }
  for (const k of e.kanaH) {
    if (k === qh) best = Math.max(best, 95);
    else if (k.startsWith(qh)) best = Math.max(best, 45 - (k.length - qh.length) * 2);
  }
  return best;
}

// query: ромадзи (ookami), кана (おおかみ), кандзи (狼) или русское слово (волк)
export function search(query, limit = 8) {
  const q = (query || '').trim();
  if (!entries || !q) return [];
  const results = [];
  if (CYRILLIC.test(q)) {
    const ql = q.toLowerCase().replace(/ё/g, 'е');
    for (const e of entries) {
      const s = scoreRussian(e, ql);
      // Заимствования на катакане (ドッグ) — чуть ниже исконных слов (犬).
      const loanword = !e.kanji.length && HAS_KATAKANA.test(e.kana[0]);
      if (s) results.push([s + (e.flags & 1 ? 15 : 0) - (loanword ? 8 : 0), e]);
    }
  } else {
    const qh = kataToHira(toHiragana(q).replace(/[a-z]+$/i, ''));
    if (!qh) return [];
    for (const e of entries) {
      const s = scoreJapanese(e, q, qh);
      if (s > 0) results.push([s + (e.flags & 1 ? 15 : 0), e]);
    }
  }
  results.sort((a, b) => b[0] - a[0]);
  return results.slice(0, limit).map(([, e]) => toSuggestion(e, q));
}

// Точное совпадение по кандзи или кане — для массового добавления.
export function lookupExact(word, translation = '') {
  const w = word.trim();
  const wh = kataToHira(toHiragana(w));
  const hits = search(w, 12).filter((s) => s.kanji === w || s.altKanji === w || kataToHira(s.kana) === wh);
  const t = translation.trim().toLowerCase().replace(/ё/g, 'е');
  if (t) {
    // Омонимы (かみ — бумага/бог/волосы): выбираем запись, где есть такой перевод.
    const byMeaning = hits.find((s) => s.meanings.some((m) => m.toLowerCase().replace(/ё/g, 'е').includes(t)));
    if (byMeaning) return { ...byMeaning, meaningMatched: true };
  }
  return hits[0] || null;
}
