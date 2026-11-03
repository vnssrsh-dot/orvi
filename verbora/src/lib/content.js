// Content engine: every JSON under /content is picked up at build time.
// Adding a unit = dropping content/<level>/unit-XX.json, no code changes (SPEC §12).
import levelsData from '../../content/levels.json';
import diagnostic from '../../content/diagnostic.json';
import ipaSounds from '../../content/extra/ipa-sounds.json';
import transcription from '../../content/extra/transcription.json';

const unitFiles = import.meta.glob('../../content/*/unit-*.json', { eager: true, import: 'default' });

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

const unitsById = {};
for (const u of Object.values(unitFiles)) unitsById[u.id] = u;
unitsById[transcription.id] = transcription;

export { diagnostic, ipaSounds, transcription };

export function getUnit(id) {
  return unitsById[id] || null;
}

// The serpentine for a level: outline from levels.json merged with available unit files.
// Unit files that are not in the outline are appended by their `order`.
export function levelPath(levelId) {
  const lvl = levelsData.levels.find((l) => l.id === levelId);
  const outline = lvl ? lvl.units : [];
  const known = new Set(outline.map((u) => u.id));
  const extra = Object.values(unitFiles)
    .filter((u) => u.level === levelId && !known.has(u.id))
    .sort((a, b) => a.order - b.order)
    .map((u) => ({ id: u.id, kind: u.kind, lessons: u.lessons.length, title: u.title }));
  return [...outline, ...extra].map((o) => {
    const data = unitsById[o.id] || null;
    return {
      id: o.id,
      kind: data?.kind || o.kind,
      title: data?.title || o.title,
      planned: data ? data.lessons.length : o.lessons,
      data,
    };
  });
}

export function levelInfo(levelId) {
  return levelsData.levels.find((l) => l.id === levelId) || { id: levelId, title: { ua: levelId, ru: levelId }, units: [] };
}

export function levelHasContent(levelId) {
  return levelPath(levelId).some((u) => u.data);
}

export function findLesson(lessonId) {
  for (const u of Object.values(unitsById)) {
    const i = u.lessons.findIndex((l) => l.id === lessonId);
    if (i >= 0) return { unit: u, lesson: u.lessons[i], index: i };
  }
  return null;
}

export function allExercises(unit) {
  const list = [];
  for (const l of unit.lessons) {
    for (const e of l.exercises) list.push(e);
    for (const e of l.recap?.exercises || []) list.push(e);
  }
  for (const e of unit.checkpoint || []) list.push(e);
  return list;
}

export function findExercise(id) {
  for (const u of Object.values(unitsById)) {
    const e = allExercises(u).find((x) => x.id === id);
    if (e) return e;
  }
  return null;
}

// Topics of a unit, in order of appearance — used by the grammar map.
export function unitTopics(unit) {
  const seen = [];
  for (const e of allExercises(unit)) if (e.topic && !seen.includes(e.topic)) seen.push(e.topic);
  return seen;
}

export function allVocab() {
  const out = [];
  for (const lvl of LEVELS) {
    for (const u of levelPath(lvl)) {
      for (const w of u.data?.vocab || []) out.push({ ...w, unitId: u.id, level: lvl });
    }
  }
  return out;
}
