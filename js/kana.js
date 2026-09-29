import { toKana, toHiragana, isKanji, isKana, isJapanese } from '../vendor/wanakana.mjs';

export { toHiragana, isKanji, isKana, isJapanese };

const LATIN = /[a-z]/i;

// Ромадзи → кана прямо при вводе (ookami → おおかみ, заглавные → катакана).
// Во время набора японской клавиатурой (IME) текст не трогаем.
export function romajiInput(event) {
  const value = event.target.value;
  if (event.isComposing || !LATIN.test(value)) return value;
  return toKana(value, { IMEMode: true });
}

// Для сравнения ответов: катакана = хирагана, без пробелов и точек.
export function normalizeKana(text) {
  return toHiragana(
    (text || '')
      .normalize('NFKC')
      .replace(/[\s・.,、。]/g, '')
      .trim()
  );
}

export const hasKanji = (text) => [...(text || '')].some((ch) => isKanji(ch));

// Лицевая сторона: кандзи, если есть, иначе кана.
export const frontText = (card) => card.kanji || card.kana;

// Длинные слова — мельче, чтобы влезали в карточку.
export function sizeClass(text) {
  const n = [...(text || '')].length;
  return n <= 3 ? 'xl' : n <= 5 ? 'l' : n <= 8 ? 'm' : 's';
}
