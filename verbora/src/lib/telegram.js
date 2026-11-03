// Thin wrapper around Telegram Web App SDK. Everything degrades gracefully in a normal browser.
const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
const inTelegram = Boolean(tg && tg.initData);

export function initTelegram() {
  if (!inTelegram) return;
  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor?.('#f6f2fc');
    tg.setBackgroundColor?.('#f6f2fc');
    tg.disableVerticalSwipes?.();
  } catch {}
}

export function tgUser() {
  return inTelegram ? tg.initDataUnsafe?.user || null : null;
}

// Telegram gives Ukrainian as "uk"; the app uses "ua".
export function suggestedLang() {
  const code = (tgUser()?.language_code || navigator.language || 'uk').toLowerCase();
  if (code.startsWith('ru')) return 'ru';
  return 'ua';
}

export function haptic(kind) {
  if (!inTelegram) return;
  try {
    const h = tg.HapticFeedback;
    if (kind === 'success' || kind === 'error' || kind === 'warning') h.notificationOccurred(kind);
    else if (kind === 'select') h.selectionChanged();
    else h.impactOccurred(kind || 'light');
  } catch {}
}

export function initData() {
  return inTelegram ? tg.initData : '';
}
