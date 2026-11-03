// Answer-checking tests over all content: every right answer passes, every wrong option fails.
// Usage: npm test
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { matches, normalize, answerIndex, gapSentences } from '../src/lib/check.js';

const root = new URL('../content/', import.meta.url).pathname;
let pass = 0;
const fails = [];
const ok = (cond, msg) => (cond ? pass++ : fails.push(msg));

// ---- targeted cases ----
ok(matches('i am happy', 'I am happy.'), 'case + final dot');
ok(matches('  I   am  happy . ', 'I am happy.'), 'spaces');
ok(matches('I’m at home', "I'm at home."), 'curly apostrophe');
ok(!matches('I are happy', 'I am happy.'), 'wrong verb fails');
ok(!matches('', 'am'), 'empty fails');
ok(matches("I'm happy", 'I am happy.', [], { shortForms: true }), 'short form in a sentence');
ok(matches('They are happy', "They're happy.", [], { shortForms: true }), 'full form in a sentence');
ok(!matches('They is happy', 'They are happy.', [], { shortForms: true }), 'short-forms option keeps wrong answers wrong');
ok(!matches('Their happy', "They're happy.", [], { shortForms: true }), 'their ≠ they are');
ok(!matches('I am', "I'm"), 'gap testing the short form stays strict');
ok(matches('Anna is a student', 'is', gapSentences('Anna ___ a student.', ['is', "'s"])), 'gap typed as a whole sentence');
ok(matches("Anna's a student.", 'is', gapSentences('Anna ___ a student.', ['is', "'s"])), "'s glued to the word before");
ok(answerIndex(['TA-ble', 'ta-BLE'], 'TA-ble', 'ua') === 0 && answerIndex(['TA-ble', 'ta-BLE'], 'ta-BLE', 'ua') === 1, 'options differing only by case');
ok(answerIndex([{ ua: 'а', ru: 'а' }, { ua: 'б', ru: 'в' }], { ua: 'б', ru: 'в' }, 'ru') === 1, 'localized options');

// ---- every exercise in content ----
function exercises(u) {
  const out = [];
  for (const l of u.lessons || []) out.push(...(l.exercises || []), ...(l.recap?.exercises || []));
  return [...out, ...(u.checkpoint || [])];
}
function walk(dir, files = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (/unit-\d+\.json$/.test(f) || f === 'transcription.json') files.push(p);
  }
  return files;
}
for (const file of walk(root)) {
  const u = JSON.parse(readFileSync(file, 'utf8'));
  for (const e of exercises(u)) {
    const id = e.id;
    for (const lang of ['ua', 'ru']) {
      if (['choose', 'listen', 'ipa'].includes(e.type)) {
        const r = answerIndex(e.options, e.answer, lang);
        ok(r >= 0, `${id} (${lang}): answer not in options`);
        e.options.forEach((_, i) => i !== r && ok(i !== answerIndex(e.options, e.answer, lang), `${id}: wrong option ${i} counts as right`));
      }
    }
    if (['fill', 'define', 'associate'].includes(e.type)) {
      const acc = e.type === 'fill' ? [...(e.accept || []), ...gapSentences(e.question, [e.answer, ...(e.accept || [])])] : e.accept;
      ok(matches(e.answer, e.answer, acc), `${id}: answer rejected`);
      ok(matches(e.answer.toUpperCase() + '.', e.answer, acc), `${id}: answer in caps rejected`);
      for (const a of e.accept || []) ok(matches(a, e.answer, acc), `${id}: accept "${a}" rejected`);
      ok(!matches('xyz', e.answer, acc), `${id}: junk accepted`);
    }
    if (e.type === 'fix') {
      ok(matches(e.answer, e.answer, e.accept, { shortForms: true }), `${id}: answer rejected`);
      ok(!matches(e.sentence, e.answer, e.accept, { shortForms: true }), `${id}: the original mistake is accepted`);
      for (const a of e.accept || []) ok(matches(a, e.answer, e.accept, { shortForms: true }), `${id}: accept rejected`);
    }
    if (e.type === 'translate') {
      ok(matches(e.answer.toLowerCase().replace(/\.$/, ''), e.answer, e.accept, { shortForms: true }), `${id}: answer rejected`);
      for (const a of e.accept || []) ok(matches(a, e.answer, e.accept, { shortForms: true }), `${id}: accept rejected`);
    }
    if (e.type === 'build') {
      ok(matches(e.answer, e.answer, e.accept), `${id}: answer rejected`);
      ok(!matches([...e.words].reverse().join(' '), e.answer, e.accept) || [...e.words].reverse().join(' ').toLowerCase() === normalize(e.answer), `${id}: reversed order accepted`);
    }
    if (e.type === 'wordbank') {
      e.answers.forEach((a, i) => ok(e.bank.some((b) => normalize(b) === normalize(a)), `${id}: answer ${i} not in bank`));
    }
    if (e.type === 'reading') {
      for (const q of e.questions) if (q.type === 'choose') ok(answerIndex(q.options, q.answer, 'ua') >= 0, `${id}: reading answer not in options`);
    }
  }
}

for (const f of fails) console.log('✖', f);
console.log(fails.length ? `\n${fails.length} failed, ${pass} passed` : `✓ ${pass} checks passed`);
process.exit(fails.length ? 1 : 0);
