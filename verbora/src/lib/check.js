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

export function matches(input, answer, accept = []) {
  const n = normalize(input);
  if (!n) return false;
  return [answer, ...(accept || [])].some((a) => normalize(a) === n);
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
