import { loc } from './loc.js';

// Answer checking for closed exercises (SPEC §12): case-insensitive, extra spaces and the final
// punctuation mark are ignored, ’ and ' are the same, plus variants from accept[].
export function normalize(s) {
  return String(s ?? '')
    .replace(/[’‘ʼ`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*[.!?…,;:]+$/u, '')
    .trim();
}

// Full and short forms of pronoun + be/do/can mean the same in a whole sentence:
// "I'm happy" = "I am happy". Used for fix/translate, never for a single gap,
// where the exercise may be testing the short form itself.
const SHORT = [
  [/\bi'm\b/g, 'i am'], [/\b(you|we|they)'re\b/g, '$1 are'], [/\b(he|she|it|that|what|where|who)'s\b/g, '$1 is'],
  [/\bisn't\b/g, 'is not'], [/\baren't\b/g, 'are not'], [/\bwasn't\b/g, 'was not'], [/\bweren't\b/g, 'were not'],
  [/\bdon't\b/g, 'do not'], [/\bdoesn't\b/g, 'does not'], [/\bdidn't\b/g, 'did not'], [/\bcan't\b/g, 'cannot'],
  [/\bcan not\b/g, 'cannot'], [/\bwon't\b/g, 'will not'], [/\b(i|you|we|they)'ve\b/g, '$1 have'], [/\b(i|you|he|she|it|we|they)'ll\b/g, '$1 will'],
];
export function expandShort(s) {
  let out = normalize(s);
  for (const [re, to] of SHORT) out = out.replace(re, to);
  return out;
}

export function matches(input, answer, accept = [], { shortForms = false } = {}) {
  const n = normalize(input);
  if (!n) return false;
  const variants = [answer, ...(accept || [])];
  if (variants.some((a) => normalize(a) === n)) return true;
  if (shortForms) {
    const e = expandShort(input);
    return variants.some((a) => expandShort(a) === e);
  }
  return false;
}

// A gap answer may also be typed as the whole sentence: "Anna is a student".
export function gapSentences(question, variants) {
  return variants.map((v) => {
    const [a, ...rest] = String(question).split('___');
    const b = rest.join('___');
    const glue = /^'/.test(v) ? a.replace(/\s+$/, '') : a;
    return `${glue}${v}${b}`;
  });
}

export function shuffle(arr, seed) {
  const a = [...arr];
  let s = seed ?? Math.floor(Math.random() * 1e9);
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function hashSeed(str) {
  let h = 2166136261;
  for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

// For picked options the answer is one exact option: case matters ("TA-ble" ≠ "ta-BLE").
// Lenient matching (case, spaces, final dot) applies only to typed answers.
export function answerIndex(options, answer, lang) {
  const a = loc(answer, lang);
  const exact = options.findIndex((o) => loc(o, lang) === a);
  return exact >= 0 ? exact : options.findIndex((o) => normalize(loc(o, lang)) === normalize(a));
}
