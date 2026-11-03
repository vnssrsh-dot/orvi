// Validates every content/<level>/unit-XX.json against the format in SPEC §12.
// Usage: npm run check-content
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../content/', import.meta.url).pathname;
const topics = JSON.parse(readFileSync(join(root, 'topics.json'), 'utf8'));
const REQUIRED = {
  choose: ['question', 'options', 'answer'], fill: ['question', 'answer'], build: ['words', 'answer'],
  fix: ['sentence', 'answer'], listen: ['audio_text', 'options', 'answer'], translate: ['prompt', 'answer'],
  ipa: ['ipa', 'options', 'answer'], match: ['pairs'], wordbank: ['bank', 'sentences', 'answers'],
  define: ['definition', 'answer'], associate: ['cue', 'answer'], brackets: ['text', 'hints', 'answers'],
  reading: ['questions'], picture: ['image', 'questions'], write: ['prompt'],
};
const errors = [];
const warn = [];
const ids = new Set();
const str = (v) => (typeof v === 'string' ? v : v?.ua ?? '');
const norm = (s) => String(s).toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');

function checkEx(e, where) {
  const at = `${where} ${e.id || '(no id)'}`;
  if (!e.id) errors.push(`${at}: missing id`);
  else if (ids.has(e.id)) errors.push(`${at}: duplicate id`);
  ids.add(e.id);
  if (!REQUIRED[e.type]) return errors.push(`${at}: unknown type "${e.type}"`);
  for (const f of REQUIRED[e.type]) if (e[f] == null) errors.push(`${at}: ${e.type} needs "${f}"`);
  if (!e.topic) errors.push(`${at}: missing topic`);
  else if (!topics[e.topic]) warn.push(`${at}: topic "${e.topic}" has no name in topics.json`);
  if (!e.explain?.ua || !e.explain?.ru) errors.push(`${at}: explain needs ua and ru`);
  if (['choose', 'listen', 'ipa'].includes(e.type) && e.options && !e.options.map(str).includes(str(e.answer))) errors.push(`${at}: answer is not among options`);
  if (e.options && e.options.length !== new Set(e.options.map(str)).size) errors.push(`${at}: duplicate options`);
  if (['fill', 'wordbank'].includes(e.type)) {
    const s = e.type === 'fill' ? [e.question] : e.sentences;
    for (const x of s || []) if (!String(x).includes('___')) errors.push(`${at}: "${x}" has no ___ gap`);
  }
  if (e.type === 'wordbank' && e.sentences?.length !== e.answers?.length) errors.push(`${at}: sentences and answers differ in length`);
  if (e.type === 'build' && e.words && e.words.map(norm).sort().join(' ') !== norm(e.answer).split(' ').sort().join(' ')) errors.push(`${at}: words do not form the answer`);
}

function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/unit-\d+\.json$/.test(f) || f === 'transcription.json') checkUnit(p);
  }
}

function checkUnit(p) {
  let u;
  try { u = JSON.parse(readFileSync(p, 'utf8')); } catch (e) { return errors.push(`${p}: invalid JSON — ${e.message}`); }
  const w = p.replace(root, '');
  for (const f of ['id', 'level', 'order', 'kind', 'title', 'lessons']) if (u[f] == null) errors.push(`${w}: missing "${f}"`);
  for (const v of u.vocab || []) for (const f of ['word', 'ipa', 'ua', 'ru', 'example']) if (!v[f]) errors.push(`${w}: word "${v.word}" missing ${f}`);
  u.lessons?.forEach((l, i) => {
    if (!l.id || !l.title) errors.push(`${w}: lesson ${i + 1} needs id and title`);
    if (!l.exercises?.length) errors.push(`${w} ${l.id}: no exercises`);
    l.exercises?.forEach((e) => checkEx(e, w));
    l.recap?.exercises?.forEach((e) => checkEx(e, `${w} recap`));
    const n = l.exercises?.length || 0;
    if (u.kind !== 'course' && (n < 8 || n > 10)) warn.push(`${w} ${l.id}: ${n} exercises (norm 8–10)`);
  });
  (u.checkpoint || []).forEach((e) => checkEx(e, `${w} checkpoint`));
  if (u.kind !== 'course' && u.checkpoint && (u.checkpoint.length < 10 || u.checkpoint.length > 12)) warn.push(`${w}: checkpoint has ${u.checkpoint.length} tasks (norm 10–12)`);
}

walk(root);
for (const x of warn) console.log('⚠', x);
for (const x of errors) console.log('✖', x);
console.log(errors.length ? `\n${errors.length} error(s)` : `\n✓ content OK (${ids.size} exercises)`);
process.exit(errors.length ? 1 : 0);
