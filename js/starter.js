import { createDeck, saveCards, listDecks, getMeta, setMeta } from './db.js';

// Стартовая колода из starter/: 17 слов с картинками.
export async function addStarterDeck() {
  const list = await (await fetch('starter/starter.json')).json();
  const deck = await createDeck(list.name);
  const cards = await Promise.all(
    list.cards.map(async (c) => ({
      deckId: deck.id,
      kanji: c.kanji || '',
      kana: c.kana,
      translation: c.translation,
      image: c.image ? await (await fetch('starter/' + c.image)).blob() : null,
    }))
  );
  await saveCards(cards);
  return deck;
}

export async function seedIfNeeded() {
  if (await getMeta('seeded')) return;
  if ((await listDecks()).length === 0) await addStarterDeck();
  await setMeta('seeded', true);
}
