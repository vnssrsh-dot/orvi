/* orvi. — Telegram Mini App runtime for the prototype.
   First launch opens a clean account (new user). Every change is saved to
   Telegram CloudStorage (per Telegram user, per bot) and loaded on the next
   launch. Without CloudStorage (old client or plain browser) the data is kept
   in this device's localStorage instead. */
(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  const user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  const KEY = 'orvi_v1';                       // CloudStorage keys: orvi_v1_n, orvi_v1_0..N
  const LOCAL = KEY + '_local_' + (user ? user.id : 'guest');
  const CHUNK = 4000;                          // CloudStorage value limit is 4096 chars

  let cloud = null;
  try {
    if (tg && tg.initData && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast('6.9')) cloud = tg.CloudStorage;
  } catch (e) {}

  if (tg) {
    try {
      tg.ready();
      tg.expand();
      if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
      const bg = tg.colorScheme === 'dark' ? '#17161F' : '#EEEDF4';
      if (tg.setHeaderColor) tg.setHeaderColor(bg);
      if (tg.setBackgroundColor) tg.setBackgroundColor(bg);
    } catch (e) {}
  }
  if (user && user.first_name) {
    U.me.f = user.first_name;
    U.me.voc = user.first_name;
    U.me.n = [user.first_name, user.last_name].filter(Boolean).join(' ');
    U.me.un = user.username ? '@' + user.username : '';
  }

  function fresh() {
    B.length = 0; T.length = 0; INV.length = 0;
    Object.assign(S, {
      mode: 'empty', tab: 'home', stacks: { home: [], personal: [], shared: [] }, sheet: null,
      cancelled: [], collapsed: {}, btab: {}, cal: {}, filesOpen: {},
      filter: { personal: 'all', shared: 'all' }, q: { personal: '', shared: '' },
      searchOpen: { personal: false, shared: false }, showAll: { mine: false, shared: false },
      toast: null, undo: null, onbHidden: false, theme: 'system',
      notif: { assign: true, due: true, lead: '1d', invite: true, changes: true },
      quiet: { on: true, from: '22:00', to: '07:00' }
    });
    S.flagged = new Set();
  }

  function snapshot() {
    return {
      v: 1, seq: seq, B: B, T: T, INV: INV,
      s: { theme: S.theme, notif: S.notif, quiet: S.quiet, collapsed: S.collapsed, btab: S.btab,
           onbHidden: !!S.onbHidden, flagged: [...S.flagged] }
    };
  }

  function apply(d) {
    if (!d || d.v !== 1 || !Array.isArray(d.B)) return false;
    B.length = 0; B.push(...d.B);
    T.length = 0; T.push(...(d.T || []));
    INV.length = 0; INV.push(...(d.INV || []));
    seq = Math.max(seq, d.seq || 0);
    Object.assign(S, d.s || {});
    S.flagged = new Set((d.s && d.s.flagged) || []);
    return true;
  }

  const readLocal = () => { try { return JSON.parse(localStorage.getItem(LOCAL) || 'null'); } catch (e) { return null; } };

  let savedChunks = 0;
  function load(cb) {
    let done = false;
    const finish = d => { if (!done) { done = true; cb(d); } };
    setTimeout(() => finish(readLocal()), 3000);          // never hang on a slow cloud
    if (!cloud) return finish(readLocal());
    cloud.getItem(KEY + '_n', (err, n) => {
      if (err || !n) return finish(readLocal());
      const keys = Array.from({ length: Number(n) }, (_, i) => KEY + '_' + i);
      cloud.getItems(keys, (err2, vals) => {
        if (err2 || !vals) return finish(readLocal());
        try { savedChunks = keys.length; finish(JSON.parse(keys.map(k => vals[k] || '').join(''))); }
        catch (e) { finish(readLocal()); }
      });
    });
  }

  let last = '', timer = null;
  function save() {
    clearTimeout(timer);
    const json = JSON.stringify(snapshot());
    if (json === last) return;
    last = json;
    try { localStorage.setItem(LOCAL, json); } catch (e) {}
    if (!cloud) return;
    const n = Math.ceil(json.length / CHUNK);
    for (let i = 0; i < n; i++) cloud.setItem(KEY + '_' + i, json.slice(i * CHUNK, (i + 1) * CHUNK));
    cloud.setItem(KEY + '_n', String(n));
    if (savedChunks > n) cloud.removeItems(Array.from({ length: savedChunks - n }, (_, i) => KEY + '_' + (n + i)));
    savedChunks = n;
  }

  window.orviReset = function () {
    fresh();
    try { localStorage.removeItem(LOCAL); } catch (e) {}
    if (cloud) cloud.getKeys((err, keys) => { if (!err && keys) { const mine = keys.filter(k => k.startsWith(KEY)); if (mine.length) cloud.removeItems(mine); } });
    savedChunks = 0;
    last = JSON.stringify(snapshot());
    applyTheme();
    render();
    toast('Дані видалено. Почнімо спочатку');
  };

  // Save shortly after every change; save at once when the app is hidden or closed.
  const baseRender = render;
  render = function () { baseRender(); clearTimeout(timer); timer = setTimeout(save, 1000); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);

  fresh();
  load(d => {
    apply(d);
    last = JSON.stringify(snapshot());
    applyTheme();
    document.documentElement.classList.add('orvi-ready');
    render();
  });
})();
