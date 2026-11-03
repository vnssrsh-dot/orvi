// Localized value helper: strings are shared, {ua, ru} objects pick the UI language.
export function loc(v, lang) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  return v[lang] ?? v.ua ?? v.en ?? '';
}
