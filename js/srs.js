// Интервальное повторение: упрощённый SM-2 (как в Anki) с тремя оценками.
export const DAY = 24 * 60 * 60 * 1000;
const RELEARN = 10 * 60 * 1000;

export function startOfDay(t = Date.now()) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const newState = (cardId, dir) => ({
  id: `${cardId}|${dir}`,
  cardId,
  dir,
  due: 0,
  interval: 0,
  ease: 2.5,
  reps: 0,
  lapses: 0,
});

// grade: 'again' — не помню, 'good' — помню, 'easy' — легко
export function schedule(state, grade, now = Date.now()) {
  const s = { ...state, last: now };
  if (grade === 'again') {
    s.reps = 0;
    s.lapses += 1;
    s.interval = 0;
    s.ease = Math.max(1.3, s.ease - 0.2);
    s.due = now + RELEARN;
    return s;
  }
  let interval;
  if (grade === 'good') {
    interval = s.reps === 0 ? 1 : s.reps === 1 ? 3 : s.interval * s.ease;
  } else {
    interval = s.reps === 0 ? 4 : Math.max(s.interval, 1) * s.ease * 1.3;
    s.ease += 0.15;
  }
  s.interval = Math.max(1, Math.round(interval));
  s.reps += 1;
  s.due = startOfDay(now) + s.interval * DAY;
  return s;
}

export function intervalLabel(state, grade) {
  if (grade === 'again') return '10 мин';
  const days = schedule(state, grade).interval;
  if (days < 7) return `${days} дн.`;
  if (days < 30) return `${Math.round(days / 7)} нед.`;
  if (days < 365) return `${Math.round(days / 30)} мес.`;
  return `${(days / 365).toFixed(1)} г.`;
}

export const isNew = (p) => !p || (p.reps === 0 && p.lapses === 0 && !p.last);
export const isDue = (p, now = Date.now()) => !!p && !isNew(p) && p.due <= now;
