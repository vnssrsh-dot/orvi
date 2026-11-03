import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BADGES } from './badges.js';

// Local-first progress store. Persists to localStorage; the same shape is what a future
// Supabase sync would upload (SPEC §10). Every read/write is guarded — storage can be unavailable.
const KEY = 'verbora:v1';

export const today = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

export function freshState() {
  return {
    v: 1,
    lang: null,
    onboarded: false,
    profile: { experience: null, goal: null, minutes: 15, name: '' },
    currentLevel: 'A1',
    xp: 0,
    streak: { count: 0, best: 0, last: null },
    week: {}, // date -> true (activity)
    lessonsDone: {}, // lessonId -> { acc, at }
    unitsPassed: {}, // unitId -> { score, at }
    levelsPassed: {}, // A1 -> date
    topics: {}, // topic -> { ok, bad, last }
    mistakes: [], // exercise ids for «робота над помилками»
    vocab: {}, // word -> { box, due, learned }
    badges: {}, // id -> date
    daily: { date: today(), lessons: 0, words: 0, correct: 0, xp: 0 },
    settings: { sound: true, theme: 'light' },
    lastVisit: null,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshState();
    const s = JSON.parse(raw);
    const base = freshState();
    return { ...base, ...s, profile: { ...base.profile, ...s.profile }, settings: { ...base.settings, ...s.settings } };
  } catch {
    return freshState();
  }
}

function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [state, setState] = useState(load);
  const ref = useRef(state);
  const prevVisit = useRef(state.lastVisit);

  useEffect(() => { save(state); }, [state]);
  // update(fn): fn mutates a draft copy synchronously and may return a value.
  const update = useMemo(() => (fn) => {
    const draft = structuredClone(ref.current);
    const out = fn(draft);
    ref.current = draft;
    setState(draft);
    return out;
  }, []);
  const replace = useMemo(() => (next) => { ref.current = next; setState(next); }, []);

  useEffect(() => {
    update((s) => { s.lastVisit = today(); touchDaily(s); });
  }, []);

  const api = useMemo(() => ({ state, update, replace, prevVisit: prevVisit.current }), [state]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore() {
  return useContext(Ctx);
}

// ---------- pure mutators (operate on a draft clone) ----------

function touchDaily(s) {
  if (s.daily.date !== today()) s.daily = { date: today(), lessons: 0, words: 0, correct: 0, xp: 0 };
}

export function recordAnswer(s, exercise, ok) {
  touchDaily(s);
  const t = exercise.topic || 'misc';
  const rec = s.topics[t] || { ok: 0, bad: 0, last: null };
  if (ok) rec.ok++; else rec.bad++;
  rec.last = ok;
  s.topics[t] = rec;
  if (ok) {
    s.daily.correct++;
    if (s.mistakes.includes(exercise.id)) s.fixedMistakes = (s.fixedMistakes || 0) + 1;
    s.mistakes = s.mistakes.filter((id) => id !== exercise.id);
  } else if (exercise.id && !s.mistakes.includes(exercise.id)) {
    s.mistakes = [exercise.id, ...s.mistakes].slice(0, 60);
  }
}

export function bumpStreak(s) {
  const t = today();
  const last = s.streak.last;
  if (last === t) return false;
  s.streak.count = last && dayDiff(last, t) === 1 ? s.streak.count + 1 : 1;
  s.streak.best = Math.max(s.streak.best, s.streak.count);
  s.streak.last = t;
  s.week[t] = true;
  return true;
}

export function addXp(s, n) {
  touchDaily(s);
  s.xp += n;
  s.daily.xp += n;
}

export function streakAlive(s) {
  if (!s.streak.last) return 0;
  return dayDiff(s.streak.last, today()) <= 1 ? s.streak.count : 0;
}

export function streakLost(s) {
  return s.streak.count > 1 && s.streak.last && dayDiff(s.streak.last, today()) > 1;
}

// Returns newly earned badge ids.
export function awardBadges(s) {
  const earned = [];
  for (const b of BADGES) {
    if (!s.badges[b.id] && b.test(s)) {
      s.badges[b.id] = today();
      earned.push(b.id);
    }
  }
  return earned;
}

// ---------- spaced repetition for word cards (Leitner, Anki-like) ----------
const INTERVALS = [0, 1, 2, 4, 8, 16, 32];

export function reviewWord(s, word, known) {
  touchDaily(s);
  const c = s.vocab[word] || { box: 0, due: today(), learned: false };
  c.box = known ? Math.min(c.box + 1, INTERVALS.length - 1) : 0;
  const d = new Date();
  d.setDate(d.getDate() + INTERVALS[c.box]);
  c.due = today(d);
  if (known && !c.learned && c.box >= 2) c.learned = true;
  if (known) s.daily.words++;
  s.vocab[word] = c;
}

export function isDue(card) {
  return !card || card.due <= today();
}
