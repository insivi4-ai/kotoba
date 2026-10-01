import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.mjs';
import {
  listCardsInScope, getDeck, getFolder, scopeFolderId, progressMap, saveProgress, getMeta, setMeta,
} from '../db.js';
import { schedule, newState, isNew, isDue, intervalLabel, startOfDay, DAY } from '../srs.js';
import { frontText, normalizeKana, romajiInput } from '../kana.js';
import { setPrefs, DIRS } from '../prefs.js';
import {
  Icon, FlipCard, StaticCard, AnswerBody, SpeakButton, Thumb, usePrefs, useKeys, shuffle, cardsWord, Loading, Empty,
} from '../ui.js';

// ---------- Общее ----------

function StudyHeader({ back, title, done = 0, total = 0, children }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return html`<header class="study-head">
    <a class="icon-btn" href=${back} aria-label="Закрыть"><${Icon} name="close" /></a>
    <div class="study-title">
      <div class="study-name">${title}</div>
      ${total > 0 && html`<div class="progress"><div class="progress-bar" style=${{ width: pct + '%' }}></div></div>`}
    </div>
    ${total > 0 && html`<div class="study-count">${Math.min(done, total)} / ${total}</div>`}
    ${children}
  </header>`;
}

function WordList({ cards }) {
  return html`<ul class="word-list">
    ${cards.map(
      (c) => html`<li key=${c.id}>
        <${Thumb} blob=${c.image} fallback=${frontText(c)} />
        <div class="wl-text">
          <div class="jp">${c.kanji ? html`${c.kanji} <small>${c.kana}</small>` : c.kana}</div>
          <div class="muted">${c.translation}</div>
        </div>
        <${SpeakButton} text=${c.kana} />
      </li>`
    )}
  </ul>`;
}

function Finish({ back, score, total, title, text, mark, mistakes = [], mistakesTitle = 'Ошибки', children }) {
  const ratio = total ? score / total : 1;
  const [jp, ru] =
    mark || (ratio >= 0.9 ? ['すばらしい！', 'Великолепно!'] : ratio >= 0.6 ? ['よくできました', 'Хорошая работа'] : ['がんばって！', 'Не сдавайся!']);
  return html`<main class="page finish">
    <div class="finish-mark jp">${jp}</div>
    <div class="finish-mark-ru">${ru}</div>
    <h2>${title}</h2>
    ${text && html`<p class="muted">${text}</p>`}
    <div class="finish-actions">
      ${children}
      <a class="btn ghost" href=${back}>К колоде</a>
    </div>
    ${mistakes.length > 0 && html`<h3>${mistakesTitle}</h3><${WordList} cards=${mistakes} />`}
  </main>`;
}

const DirTag = ({ dir }) => html`<span class="dir-tag">${DIRS[dir].short}</span>`;

// ---------- Карточки (листать) ----------

function SwipeCard({ card, dir, hideImage, flipped, onFlip, onSwipe, exit }) {
  const [dx, setDx] = useState(0);
  const start = useRef(null);

  const down = (e) => {
    if (e.target.closest('button')) return;
    start.current = { x: e.clientX, moved: false };
  };
  const move = (e) => {
    const s = start.current;
    if (!s) return;
    const d = e.clientX - s.x;
    if (!s.moved && Math.abs(d) > 8) {
      s.moved = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (s.moved) setDx(d);
  };
  const up = (e) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const d = e.clientX - s.x;
    if (s.moved && Math.abs(d) > 90) onSwipe(d > 0);
    else if (!s.moved) onFlip();
    setDx(0);
  };

  const style = exit
    ? { transform: `translateX(${exit === 'right' ? 130 : -130}%) rotate(${exit === 'right' ? 14 : -14}deg)`, opacity: 0, transition: 'transform .22s ease-in, opacity .22s ease-in' }
    : { transform: `translateX(${dx}px) rotate(${dx / 22}deg)`, transition: dx ? 'none' : 'transform .25s cubic-bezier(.3,.7,.3,1.2)' };

  return html`<div class="swipe" style=${style} onPointerDown=${down} onPointerMove=${move} onPointerUp=${up}
      onPointerCancel=${() => { start.current = null; setDx(0); }}>
    <${FlipCard} card=${card} dir=${dir} hideImage=${hideImage} flipped=${flipped}
      hint=${!flipped && 'нажмите, чтобы перевернуть'} />
    ${dx > 30 && html`<div class="swipe-tag good" style=${{ opacity: Math.min(1, (dx - 30) / 60) }}>Знаю</div>`}
    ${dx < -30 && html`<div class="swipe-tag bad" style=${{ opacity: Math.min(1, (-dx - 30) / 60) }}>Не знаю</div>`}
  </div>`;
}

function Flashcards({ cards, back, title, prefs }) {
  const arrange = (list, mix = prefs.shuffle) => (mix ? shuffle(list) : list);
  const [order, setOrder] = useState(() => arrange(cards));
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState([]);
  const [exit, setExit] = useState(null);
  const card = order[i];

  const answer = (known) => {
    if (!card || exit) return;
    setExit(known ? 'right' : 'left');
    setTimeout(() => {
      setResults((r) => [...r, { card, known }]);
      setI((x) => x + 1);
      setFlipped(false);
      setExit(null);
    }, 200);
  };
  const undo = () => {
    if (!results.length || exit) return;
    setResults((r) => r.slice(0, -1));
    setI((x) => x - 1);
    setFlipped(false);
  };
  const restart = (list, mix) => {
    setOrder(arrange(list, mix));
    setI(0);
    setResults([]);
    setFlipped(false);
  };
  const toggleShuffle = () => {
    setPrefs({ shuffle: !prefs.shuffle });
    restart(cards, !prefs.shuffle);
  };

  useKeys(
    (e) => {
      if (!card) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === 'ArrowRight') answer(true);
      else if (e.key === 'ArrowLeft') answer(false);
      else if (e.key === 'Backspace') undo();
    },
    [card, exit, results]
  );

  if (!card) {
    const unknown = results.filter((r) => !r.known).map((r) => r.card);
    const known = results.length - unknown.length;
    return html`<${StudyHeader} back=${back} title=${title} />
      <${Finish} back=${back} score=${known} total=${results.length} title=${`Знаю ${known} из ${results.length}`}
        mistakes=${unknown} mistakesTitle="Пока не запомнились">
        ${unknown.length > 0 &&
        html`<button class="btn primary" onClick=${() => restart(unknown)}>Повторить незнакомые (${unknown.length})</button>`}
        <button class="btn" onClick=${() => restart(cards)}>Сначала</button>
      <//>`;
  }

  const knownCount = results.filter((r) => r.known).length;
  return html`
    <${StudyHeader} back=${back} title=${title} done=${i} total=${order.length}>
      <button class=${'icon-btn' + (prefs.shuffle ? ' on' : '')} title="Перемешивать" aria-pressed=${prefs.shuffle}
        onClick=${toggleShuffle}><${Icon} name="shuffle" /></button>
    <//>
    <main class="page study">
      <${DirTag} dir=${prefs.dir} />
      <div class="stage">
        <${SwipeCard} key=${card.id + ':' + i} card=${card} dir=${prefs.dir} hideImage=${prefs.hideImage}
          flipped=${flipped} onFlip=${() => setFlipped((f) => !f)} onSwipe=${answer} exit=${exit} />
      </div>
      <div class="study-actions triple">
        <button class="btn bad big" onClick=${() => answer(false)}>
          <${Icon} name="close" />Не знаю<span class="count">${results.length - knownCount}</span>
        </button>
        <button class="icon-btn" disabled=${!results.length} onClick=${undo} aria-label="Вернуть предыдущую"><${Icon} name="undo" /></button>
        <button class="btn good big" onClick=${() => answer(true)}>
          <${Icon} name="check" />Знаю<span class="count">${knownCount}</span>
        </button>
      </div>
      <p class="kbd-hint">
        <span class="only-mouse">Пробел — перевернуть · ← не знаю · → знаю</span>
        <span class="only-touch">Смахните вправо — знаю, влево — не знаю</span>
      </p>
    </main>`;
}

// ---------- Интервальное повторение ----------

function interleave(due, fresh) {
  const out = [];
  let d = 0;
  let f = 0;
  while (d < due.length || f < fresh.length) {
    if (d < due.length) out.push(due[d++]);
    if (d < due.length) out.push(due[d++]);
    if (f < fresh.length) out.push(fresh[f++]);
  }
  return out;
}

function Review({ cards, back, title, prefs, scope }) {
  const dir = prefs.dir;
  const [state, setState] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const busy = useRef(false);

  const build = async (bonus = 0) => {
    const prog = await progressMap(dir);
    const now = Date.now();
    const due = cards.filter((c) => isDue(prog.get(c.id), now)).sort((a, b) => prog.get(a.id).due - prog.get(b.id).due);
    const meta = await getMeta('new-' + dir);
    const used = meta && meta.day === startOfDay() ? meta.count : 0;
    const fresh = cards.filter((c) => isNew(prog.get(c.id))).slice(0, Math.max(0, prefs.newPerDay - used) + bonus);
    setState((s) => ({ queue: interleave(due, fresh), prog, reviewed: s?.reviewed || 0 }));
    setFlipped(false);
  };

  useEffect(() => {
    build();
  }, []);

  const grade = async (g) => {
    if (!state?.queue.length || busy.current) return;
    busy.current = true;
    try {
      const card = state.queue[0];
      const prev = state.prog.get(card.id) || newState(card.id, dir);
      const next = schedule(prev, g);
      await saveProgress(next);
      if (isNew(prev)) {
        const meta = await getMeta('new-' + dir);
        const day = startOfDay();
        await setMeta('new-' + dir, { day, count: (meta && meta.day === day ? meta.count : 0) + 1 });
      }
      let rest = state.queue.slice(1);
      if (g === 'again') {
        const pos = Math.min(rest.length, 3);
        rest = [...rest.slice(0, pos), card, ...rest.slice(pos)];
      }
      setState({ queue: rest, prog: new Map(state.prog).set(card.id, next), reviewed: state.reviewed + 1 });
      setFlipped(false);
    } finally {
      busy.current = false;
    }
  };

  useKeys(
    (e) => {
      if (!state?.queue.length) return;
      if (!flipped && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setFlipped(true);
      } else if (flipped && ['1', '2', '3'].includes(e.key)) {
        grade(['again', 'good', 'easy'][+e.key - 1]);
      } else if (flipped && e.key === ' ') {
        e.preventDefault();
        grade('good');
      }
    },
    [state, flipped]
  );

  if (!state) return html`<${StudyHeader} back=${back} title=${title} /><${Loading} />`;

  if (!state.queue.length) {
    const remainingNew = cards.filter((c) => isNew(state.prog.get(c.id))).length;
    const soon = startOfDay() + 2 * DAY;
    const tomorrow = cards.filter((c) => {
      const p = state.prog.get(c.id);
      return p && !isNew(p) && p.due < soon;
    }).length;
    const text = [state.reviewed && `Повторено: ${state.reviewed}.`, tomorrow && `Завтра: ${cardsWord(tomorrow)}.`]
      .filter(Boolean)
      .join(' ');
    return html`<${StudyHeader} back=${back} title=${title} />
      <${Finish} back=${back} title=${state.reviewed ? 'На сегодня всё!' : 'Сейчас повторять нечего'} text=${text}
        mark=${state.reviewed ? ['おつかれさま！', 'Отличная работа'] : ['またあした', 'До завтра']}>
        ${remainingNew > 0 &&
        html`<button class="btn primary" onClick=${() => build(prefs.newPerDay)}>
          Учить ещё новые (${Math.min(remainingNew, prefs.newPerDay)})</button>`}
        <a class="btn" href=${`#/study/${scope}/cards`}>Просто полистать</a>
      <//>`;
  }

  const card = state.queue[0];
  const p = state.prog.get(card.id) || newState(card.id, dir);
  const newCount = state.queue.filter((c) => isNew(state.prog.get(c.id))).length;

  return html`
    <${StudyHeader} back=${back} title=${title}>
      <div class="srs-counts">
        <span class="badge new" title="Новые">${newCount}</span>
        <span class="badge due" title="К повторению">${state.queue.length - newCount}</span>
      </div>
    <//>
    <main class="page study">
      <${DirTag} dir=${dir} />
      <div class="stage">
        <${FlipCard} key=${card.id + ':' + state.reviewed} card=${card} dir=${dir} hideImage=${prefs.hideImage}
          flipped=${flipped} onFlip=${() => setFlipped(true)} hint=${!flipped && 'вспомните и нажмите'} />
      </div>
      ${flipped
        ? html`<div class="study-actions grades">
            <button class="btn bad big" onClick=${() => grade('again')}><span>Не помню</span><small>${intervalLabel(p, 'again')}</small></button>
            <button class="btn good big" onClick=${() => grade('good')}><span>Помню</span><small>${intervalLabel(p, 'good')}</small></button>
            <button class="btn indigo big" onClick=${() => grade('easy')}><span>Легко</span><small>${intervalLabel(p, 'easy')}</small></button>
          </div>`
        : html`<div class="study-actions">
            <button class="btn primary big wide" onClick=${() => setFlipped(true)}>Показать ответ</button>
          </div>`}
      <p class="kbd-hint only-mouse">Пробел — ответ · 1 не помню · 2 помню · 3 легко</p>
    </main>`;
}

// ---------- Тест: выбор ответа ----------

function Choice({ cards, back, title, prefs }) {
  const dir = prefs.dir;
  const key = (c) => (dir === 'jr' ? c.translation : frontText(c)).trim().toLowerCase();
  const makeQuestions = (list) =>
    shuffle(list).map((card) => {
      const seen = new Set([key(card)]);
      const wrong = [];
      for (const c of shuffle(cards)) {
        if (wrong.length >= 3) break;
        if (!seen.has(key(c))) {
          seen.add(key(c));
          wrong.push(c);
        }
      }
      return { card, options: shuffle([card, ...wrong]) };
    });

  const [qs, setQs] = useState(() => makeQuestions(cards));
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState(null);
  const [mistakes, setMistakes] = useState([]);
  const timer = useRef();
  const q = qs[i];

  useEffect(() => () => clearTimeout(timer.current), []);

  const next = () => {
    clearTimeout(timer.current);
    setPicked(null);
    setI((x) => x + 1);
  };
  const pick = (idx) => {
    if (picked !== null || !q) return;
    setPicked(idx);
    if (q.options[idx].id === q.card.id) timer.current = setTimeout(next, 1000);
    else setMistakes((m) => [...m, q.card]);
  };
  const restart = (list) => {
    setQs(makeQuestions(list));
    setI(0);
    setPicked(null);
    setMistakes([]);
  };

  useKeys(
    (e) => {
      if (!q) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= q.options.length) pick(n - 1);
      else if ((e.key === 'Enter' || e.key === ' ') && picked !== null) {
        e.preventDefault();
        next();
      }
    },
    [q, picked]
  );

  if (!q) {
    const score = qs.length - mistakes.length;
    return html`<${StudyHeader} back=${back} title=${title} />
      <${Finish} back=${back} score=${score} total=${qs.length} title=${`Правильно ${score} из ${qs.length}`} mistakes=${mistakes}>
        ${mistakes.length > 0 && html`<button class="btn primary" onClick=${() => restart(mistakes)}>Повторить ошибки (${mistakes.length})</button>`}
        <button class="btn" onClick=${() => restart(cards)}>Ещё раз</button>
      <//>`;
  }

  const answered = picked !== null;
  const wrong = answered && q.options[picked].id !== q.card.id;

  return html`
    <${StudyHeader} back=${back} title=${title} done=${i} total=${qs.length} />
    <main class="page study">
      <${DirTag} dir=${dir} />
      <div class="stage">
        <${StaticCard} key=${q.card.id + ':' + i} card=${q.card} dir=${dir} hideImage=${prefs.hideImage} reveal=${answered} />
      </div>
      <div class=${'options' + (dir === 'rj' ? ' jp-options' : '')}>
        ${q.options.map((c, idx) => {
          const cls = !answered ? '' : c.id === q.card.id ? ' right' : idx === picked ? ' wrong' : ' dim';
          return html`<button class=${'option' + cls} onClick=${() => pick(idx)}>
            <span class="opt-num">${idx + 1}</span>
            ${dir === 'jr'
              ? html`<span class="opt-text">${c.translation}</span>`
              : html`<span class="opt-text"><span class="jp opt-jp">${frontText(c)}</span>
                  ${c.kanji && html`<small class="jp">${c.kana}</small>`}</span>`}
          </button>`;
        })}
      </div>
      ${wrong && html`<div class="study-actions sticky"><button class="btn primary big wide" onClick=${next}>Дальше</button></div>`}
    </main>`;
}

// ---------- Тест: письмо ----------

const normRu = (s) =>
  s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();

function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

function checkRu(given, card) {
  const g = normRu(given);
  if (!g) return { ok: false };
  const variants = [card.translation, ...card.translation.split(/[,;/]|\sили\s/)].map(normRu).filter(Boolean);
  if (variants.includes(g)) return { ok: true };
  const typo = variants.some((v) => v.length >= 4 && levenshtein(g, v) <= (v.length >= 8 ? 2 : 1));
  return { ok: typo, typo };
}

function checkJp(given, card) {
  const g = normalizeKana(given);
  if (!g) return { ok: false };
  return { ok: g === normalizeKana(card.kana) || (!!card.kanji && given.replace(/\s/g, '') === card.kanji) };
}

function Write({ cards, back, title, prefs }) {
  const dir = prefs.dir;
  const [qs, setQs] = useState(() => shuffle(cards));
  const [i, setI] = useState(0);
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [mistakes, setMistakes] = useState([]);
  const inputRef = useRef();
  const verdictRef = useRef();
  const card = qs[i];

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, [i]);
  useEffect(() => {
    if (result) verdictRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [result]);

  const check = () => {
    if (result || !card || !input.trim()) return;
    const r = dir === 'rj' ? checkJp(input.trim(), card) : checkRu(input.trim(), card);
    setResult({ ...r, given: input.trim() });
    if (!r.ok) setMistakes((m) => [...m, card]);
  };
  const giveUp = () => {
    if (result) return;
    setResult({ ok: false, given: '' });
    setMistakes((m) => [...m, card]);
  };
  const override = () => {
    setResult((r) => ({ ...r, ok: true, overridden: true }));
    setMistakes((m) => m.filter((c) => c !== card));
  };
  const next = () => {
    setI((x) => x + 1);
    setInput('');
    setResult(null);
  };
  const restart = (list) => {
    setQs(shuffle(list));
    setI(0);
    setInput('');
    setResult(null);
    setMistakes([]);
  };

  useKeys(
    (e) => {
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      if (result) next();
      else check();
    },
    [result, input, card]
  );

  if (!card) {
    const score = qs.length - mistakes.length;
    return html`<${StudyHeader} back=${back} title=${title} />
      <${Finish} back=${back} score=${score} total=${qs.length} title=${`Правильно ${score} из ${qs.length}`} mistakes=${mistakes}>
        ${mistakes.length > 0 && html`<button class="btn primary" onClick=${() => restart(mistakes)}>Повторить ошибки (${mistakes.length})</button>`}
        <button class="btn" onClick=${() => restart(cards)}>Ещё раз</button>
      <//>`;
  }

  const verdict = result && (result.ok ? (result.overridden ? 'Засчитано' : result.typo ? 'Верно, но с опечаткой' : 'Верно!') : result.given ? 'Неверно' : 'Правильный ответ');

  return html`
    <${StudyHeader} back=${back} title=${title} done=${i} total=${qs.length} />
    <main class="page study">
      <${DirTag} dir=${dir} />
      <div class="stage">
        <${StaticCard} key=${card.id + ':' + i} card=${card} dir=${dir} hideImage=${prefs.hideImage} />
      </div>
      <div class="write-box">
        <input ref=${inputRef} class=${'input big' + (dir === 'rj' ? ' jp' : '') + (result ? (result.ok ? ' ok' : ' bad') : '')}
          lang=${dir === 'rj' ? 'ja' : 'ru'} value=${input} readOnly=${!!result} enterkeyhint="done"
          placeholder=${dir === 'rj' ? 'Чтение (можно латиницей)' : 'Перевод по-русски'}
          autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
          onInput=${(e) => setInput(dir === 'rj' ? romajiInput(e) : e.target.value)} />
        ${!result
          ? html`<div class="row-actions">
              <button class="btn ghost" onClick=${giveUp}>Не знаю</button>
              <button class="btn primary" disabled=${!input.trim()} onClick=${check}>Проверить</button>
            </div>`
          : html`<div ref=${verdictRef} class=${'verdict ' + (result.ok ? 'ok' : 'bad')}>
              <div class="verdict-title">${verdict}</div>
              ${!result.ok && result.given && html`<div class="given">Ваш ответ: <s>${result.given}</s></div>`}
              <div class="verdict-answer"><${AnswerBody} card=${card} /></div>
              <div class="row-actions">
                ${!result.ok && result.given && html`<button class="btn ghost" onClick=${override}>Засчитать мой ответ</button>`}
                <button class="btn primary" onClick=${next}>Дальше</button>
              </div>
            </div>`}
      </div>
    </main>`;
}

// ---------- Экран изучения ----------

const MODES = { cards: Flashcards, srs: Review, choice: Choice, write: Write };

// Что учим: колоду, папку ('folder:<id>') или всё ('all') — и куда возвращаться.
async function loadScope(scope) {
  const cards = await listCardsInScope(scope);
  if (scope === 'all') return { cards, title: 'Все колоды', back: '#/', addHref: '#/add' };
  const folderId = scopeFolderId(scope);
  if (folderId) {
    const folder = await getFolder(folderId);
    const back = '#/folder/' + folderId;
    return { cards, title: folder ? `Папка «${folder.name}»` : 'Папка', back, addHref: back };
  }
  const deck = await getDeck(scope);
  return { cards, title: deck?.name || '', back: '#/deck/' + scope, addHref: '#/add?deck=' + scope };
}

export function Study({ scope, mode }) {
  const prefs = usePrefs();
  const [data, setData] = useState(null);

  useEffect(() => {
    loadScope(scope).then(setData);
  }, [scope]);

  if (!data) return html`<${Loading} />`;
  const { cards, title, back, addHref } = data;
  if (!cards.length) {
    return html`<${StudyHeader} back=${back} title=${title} />
      <main class="page"><${Empty} title="Здесь пока нет карточек"><a class="btn primary" href=${addHref}>Добавить</a><//></main>`;
  }
  const View = MODES[mode] || Flashcards;
  return html`<${View} key=${prefs.dir} cards=${cards} back=${back} title=${title} prefs=${prefs} scope=${scope} />`;
}
