import { LEVELS, levelPath, getUnit, allExercises } from './content.js';

export function topicStatus(s, topic) {
  const r = s.topics[topic];
  if (!r || r.ok + r.bad === 0) return 'gap';
  const acc = r.ok / (r.ok + r.bad);
  if (acc >= 0.8 && r.last !== false) return 'know';
  if (acc >= 0.5 || r.ok >= 2) return 'shaky';
  return 'gap';
}

export function levelUnlocked(s, level) {
  const i = LEVELS.indexOf(level);
  if (i <= 0) return true;
  return Boolean(s.levelsPassed[LEVELS[i - 1]]);
}

export function unitComplete(s, u) {
  return Boolean(s.unitsPassed[u.id]);
}

function lessonsAllDone(s, unit) {
  return unit.lessons.every((l) => s.lessonsDone[l.id]);
}

// Decorated serpentine for a level.
export function buildPath(s, level) {
  const path = levelPath(level);
  let prevComplete = levelUnlocked(s, level);
  let currentFound = false;
  const units = path.map((u) => {
    const unlocked = Boolean(u.data) && prevComplete;
    const complete = unitComplete(s, u);
    const lessons = (u.data?.lessons || []).map((l, i) => {
      const done = Boolean(s.lessonsDone[l.id]) || complete;
      const prevDone = i === 0 || Boolean(s.lessonsDone[u.data.lessons[i - 1].id]) || complete;
      let status = 'locked';
      if (unlocked && done) {
        const topics = [...new Set(l.exercises.map((e) => e.topic))];
        status = topics.some((t) => s.topics[t]?.last === false && topicStatus(s, t) !== 'know') ? 'refresh' : 'done';
      } else if (unlocked && prevDone) status = 'available';
      if (status === 'available' && !currentFound) { status = 'current'; currentFound = true; }
      return { id: l.id, title: l.title, status, index: i };
    });
    let cpStatus = 'locked';
    if (complete) cpStatus = 'done';
    else if (unlocked && u.data && lessonsAllDone(s, u.data)) {
      cpStatus = currentFound ? 'available' : 'current';
      currentFound = true;
    }
    const canJump = Boolean(u.data) && !complete && !unlocked;
    prevComplete = complete;
    return { ...u, unlocked, complete, lessons, checkpoint: cpStatus, canJump };
  });
  const allDone = units.length > 0 && units.every((u) => u.complete);
  const anyContent = units.some((u) => u.data);
  return { units, finalTest: s.levelsPassed[level] ? 'done' : allDone ? 'current' : 'locked', anyContent };
}

export function levelPercent(s, level) {
  const path = levelPath(level);
  let total = 0;
  let done = 0;
  for (const u of path) {
    total += u.planned + 1;
    if (s.unitsPassed[u.id]) done += u.planned + 1;
    else if (u.data) done += u.data.lessons.filter((l) => s.lessonsDone[l.id]).length;
  }
  if (s.levelsPassed[level]) return 100;
  return total ? Math.round((done / total) * 100) : 0;
}

export function currentLevel(s) {
  for (const l of LEVELS) if (!s.levelsPassed[l]) return l;
  return LEVELS[LEVELS.length - 1];
}

// Next thing to do on the path: { kind: 'lesson'|'checkpoint'|'level', unit, lesson }
export function nextStep(s, level) {
  const { units, finalTest } = buildPath(s, level);
  for (const u of units) {
    const cur = u.lessons.find((l) => l.status === 'current');
    if (cur) return { kind: 'lesson', unit: u.data, lesson: u.data.lessons[cur.index], index: cur.index };
    if (u.checkpoint === 'current') return { kind: 'checkpoint', unit: u.data };
  }
  if (finalTest === 'current') return { kind: 'level', level };
  return null;
}

// Warm-up «Згадаймо» (SPEC §13.2). Uses the lesson's recap; builds one when it is absent;
// mistakes from the previous topic take priority.
export function buildRecap(s, unit, index, levelUnits) {
  const lesson = unit.lessons[index];
  let source = null;
  let base = lesson.recap;
  if (index > 0) source = unit.lessons[index - 1];
  let rule = source?.rule || null;
  let pool = source ? source.exercises : [];
  if (index === 0) {
    const pos = levelUnits.findIndex((u) => u.id === unit.id);
    const prev = pos > 0 ? getUnit(levelUnits[pos - 1].id) : null;
    if (!prev) return base ? { note: base.note, rule: null, exercises: base.exercises } : null;
    rule = prev.rule;
    pool = prev.checkpoint || allExercises(prev);
  }
  const fromMistakes = pool.filter((e) => s.mistakes.includes(e.id)).slice(0, 3);
  if (base) {
    return { note: base.note, rule, exercises: fromMistakes.length ? fromMistakes : base.exercises };
  }
  const simple = pool.filter((e) => ['choose', 'fill', 'fix', 'listen'].includes(e.type)).slice(0, 2);
  const exercises = fromMistakes.length ? fromMistakes : simple;
  if (!rule && !exercises.length) return null;
  return { note: null, rule, exercises };
}

export function levelTestExercises(level, n = 25) {
  const pool = [];
  for (const u of levelPath(level)) if (u.data) pool.push(...(u.data.checkpoint || []), ...u.data.lessons.flatMap((l) => l.exercises));
  const pick = [];
  const seen = new Set();
  // spread across the pool so every unit is represented
  const step = Math.max(1, Math.floor(pool.length / n));
  for (let i = 0; i < pool.length && pick.length < n; i += step) if (!seen.has(pool[i].id)) { seen.add(pool[i].id); pick.push(pool[i]); }
  return pick;
}
