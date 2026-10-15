/* orvi. — Telegram Mini App runtime.
   Talks to the Cloudflare Worker API (same origin): loads the user's boards,
   sends every change as a three-way diff (so concurrent edits by several
   members merge instead of overwriting each other), refreshes shared boards,
   and routes start links from the bot (join_, inv_, task_, board_). */
(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  const initData = (tg && tg.initData) || '';
  const SHARED = ['type', 'name', 'icon', 'tint', 'desc', 'team', 'stages', 'deletedAt'];
  const COLORS = ['steel', 'rose', 'sage', 'lilac', 'sand'];
  let MY = 0;

  if (tg) {
    try {
      tg.ready(); tg.expand();
      if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
      const bg = tg.colorScheme === 'dark' ? '#17161F' : '#EEEDF4';
      if (tg.setHeaderColor) tg.setHeaderColor(bg);
      if (tg.setBackgroundColor) tg.setBackgroundColor(bg);
    } catch (e) {}
  }

  /* ---------- API ---------- */
  async function call(path, body) {
    try {
      const r = await fetch('/api/' + path, {
        method: body ? 'POST' : 'GET',
        headers: { 'content-type': 'application/json', 'x-init-data': initData },
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await r.json().catch(() => ({ ok: false, error: 'network' }));
      if (!r.ok && j.ok !== false) j.ok = false;
      return j;
    } catch (e) { return { ok: false, error: 'network' }; }
  }

  /* ---------- user ids: server numbers <-> app keys ('me', 'u123') ---------- */
  const K = id => (id === MY || String(id) === String(MY)) ? 'me' : (typeof id === 'string' && (id === 'me' || id[0] === 'u') ? id : 'u' + id);
  const ID = k => k === 'me' ? MY : (typeof k === 'string' && k[0] === 'u' ? Number(k.slice(1)) : k);
  function addUser(u) {
    if (!u) return 'u0';
    const k = K(u.id);
    const f = u.first_name || u.username || 'Користувач';
    U[k] = { n: [u.first_name, u.last_name].filter(Boolean).join(' ') || f, f, voc: f, un: u.username ? '@' + u.username : '', c: k === 'me' ? 'peach' : COLORS[Math.abs(u.id) % COLORS.length] };
    return k;
  }
  const mapUsers = (t, f) => {
    t.who = f(t.who); t.people = (t.people || []).map(f);
    (t.subs || []).forEach(s => { s.who = f(s.who); (s.comments || []).forEach(c => { c.u = f(c.u); }); });
    (t.comments || []).forEach(c => { c.u = f(c.u); });
    return t;
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  // stable JSON (sorted keys) so equal data always compares equal
  const canon = o => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v).sort().reduce((r, x) => { r[x] = v[x]; return r; }, {}) : v);
  const taskIn = d => mapUsers(clone(d), K);
  const taskOut = t => mapUsers(clone(t), ID);
  const sharedOf = b => { const r = {}; SHARED.forEach(k => { if (k in b) r[k] = b[k]; }); if (!('deletedAt' in r)) r.deletedAt = null; return r; };
  const prefsOf = b => ({ fav: !!b.fav, notif: b.notif, archived: !!b.archived });
  const userPrefs = () => ({ theme: S.theme, notif: S.notif, quiet: S.quiet, collapsed: S.collapsed, btab: S.btab, onbHidden: !!S.onbHidden, flagged: [...S.flagged], tz: -new Date().getTimezoneOffset() });

  /* ---------- last synced copies (the "prev" side of each diff) ---------- */
  const base = { b: new Map(), bp: new Map(), t: new Map(), prefs: '' };

  function boardIn(sb) {
    return Object.assign({ id: sb.id, type: 'personal', desc: '', team: '', stages: [], deletedAt: null }, sb.data, {
      id: sb.id,
      members: sb.members.map(m => ({ u: K(m.u), r: m.r })),
      pending: sb.pending || [],
      links: sb.links || { editor: '', viewer: '', owner: '' },
      fav: !!(sb.prefs && sb.prefs.fav), archived: !!(sb.prefs && sb.prefs.archived),
      notif: (sb.prefs && sb.prefs.notif) || defNotif(),
    });
  }

  function applyState(st, first) {
    MY = st.me;
    (st.users || []).forEach(addUser);
    if (!U.me) addUser({ id: MY, first_name: (tg && tg.initDataUnsafe && tg.initDataUnsafe.user || {}).first_name });
    B.length = 0; T.length = 0; INV.length = 0;
    base.b.clear(); base.bp.clear(); base.t.clear();
    for (const sb of st.boards) {
      const b = boardIn(sb);
      B.push(b);
      base.b.set(b.id, canon(sharedOf(b)));
      base.bp.set(b.id, canon(prefsOf(b)));
    }
    for (const st_t of st.tasks) {
      const t = taskIn(Object.assign({}, st_t.data, { id: st_t.id, board: st_t.board }));
      t.subs = t.subs || []; t.comments = t.comments || []; t.files = t.files || []; t.labels = t.labels || []; t.people = t.people || [];
      T.push(t);
      base.t.set(t.id, canon(taskOut(t)));
    }
    for (const i of st.invites || []) {
      const from = (st.users || []).find(u => u.id === i.from);
      INV.push({ id: 'i_' + i.id, inviteId: i.id, name: i.name, icon: i.icon || 'folder', tint: i.tint || '', from: from ? addUser(from) : 'u0', role: i.role, team: i.team, people: i.people });
    }
    if (first) {
      const p = st.prefs || {};
      ['theme', 'notif', 'quiet', 'collapsed', 'btab', 'onbHidden'].forEach(k => { if (p[k] !== undefined) S[k] = p[k]; });
      S.flagged = new Set(p.flagged || []);
      applyTheme();
    }
    base.prefs = canon(userPrefs());
    pruneStacks();
  }

  /* ---------- outgoing changes ---------- */
  function changes() {
    const body = { boards: [], boardPrefs: {}, tasks: [], delBoards: [], delTasks: [] };
    const sent = { b: [], bp: [], t: [] };
    const live = new Set();
    for (const b of B) {
      live.add(b.id);
      const s = canon(sharedOf(b)), prev = base.b.get(b.id);
      if (s !== prev) { body.boards.push({ id: b.id, prev: prev ? JSON.parse(prev) : null, next: JSON.parse(s) }); sent.b.push([b.id, s]); }
      const p = canon(prefsOf(b));
      if (p !== base.bp.get(b.id)) { body.boardPrefs[b.id] = JSON.parse(p); sent.bp.push([b.id, p]); }
    }
    for (const id of base.b.keys()) if (!live.has(id)) body.delBoards.push(id);
    const liveT = new Set();
    for (const t of T) {
      liveT.add(t.id);
      const s = canon(taskOut(t)), prev = base.t.get(t.id);
      if (s !== prev) { body.tasks.push({ id: t.id, board: t.board, prev: prev ? JSON.parse(prev) : null, next: JSON.parse(s) }); sent.t.push([t.id, s]); }
    }
    const goneBoards = new Set(body.delBoards);
    for (const [id, s] of base.t) if (!liveT.has(id) && !goneBoards.has(JSON.parse(s).board)) body.delTasks.push(id);
    const prefs = canon(userPrefs());
    if (prefs !== base.prefs) body.prefs = JSON.parse(prefs);
    const empty = !body.boards.length && !Object.keys(body.boardPrefs).length && !body.tasks.length && !body.delBoards.length && !body.delTasks.length && !body.prefs;
    return empty ? null : { body, sent, prefs };
  }

  let syncing = null, again = false, timer = null, offline = false;
  function schedule() { clearTimeout(timer); timer = setTimeout(flush, 700); }
  async function flush() {
    if (syncing) { again = true; return syncing; }
    const ch = changes();
    if (!ch) return;
    syncing = (async () => {
      const res = await call('sync', ch.body);
      if (!res.ok) {
        if (!offline) { offline = true; toast(LINK_ERR.network); }
        setTimeout(flush, 5000);
        return;
      }
      if (offline) { offline = false; toast('Зʼєднання відновлено, зміни збережено'); }
      // what we sent is now the common base
      ch.sent.b.forEach(([id, s]) => base.b.set(id, s));
      ch.sent.bp.forEach(([id, s]) => base.bp.set(id, s));
      ch.sent.t.forEach(([id, s]) => base.t.set(id, s));
      ch.body.delBoards.forEach(id => { base.b.delete(id); base.bp.delete(id); for (const [tid, s] of base.t) if (JSON.parse(s).board === id) base.t.delete(tid); });
      ch.body.delTasks.forEach(id => base.t.delete(id));
      if (ch.body.prefs) base.prefs = ch.prefs;
      // the server may have merged someone else's edits in: adopt its version where we have no newer local edits
      let changedLocally = false;
      for (const sb of res.boards || []) {
        const b = getB(sb.id); if (!b) continue;
        const sentS = (ch.sent.b.find(x => x[0] === sb.id) || [])[1];
        const srv = canon(sharedOf(Object.assign({}, sb.data)));
        if (sentS && canon(sharedOf(b)) === sentS && srv !== sentS) { Object.assign(b, JSON.parse(srv)); changedLocally = true; }
        if (sb.links) { b.links = sb.links; changedLocally = true; }
        base.b.set(sb.id, srv);
      }
      for (const st of res.tasks || []) {
        const i = T.findIndex(t => t.id === st.id); if (i < 0) continue;
        const sentS = (ch.sent.t.find(x => x[0] === st.id) || [])[1];
        const srv = canon(Object.assign({}, st.data, { id: st.id, board: st.board }));
        if (sentS && canon(taskOut(T[i])) === sentS && srv !== sentS) { T[i] = taskIn(JSON.parse(srv)); changedLocally = true; }
        base.t.set(st.id, srv);
      }
      if ((res.errors || []).length) { toast(LINK_ERR[res.errors[0].error] || 'Частину змін не збережено'); await reload(); return; }
      if (changedLocally) baseRender();
    })();
    await syncing;
    syncing = null;
    if (again) { again = false; return flush(); }
  }

  async function reload(first) {
    if (!first) await flush();
    const st = await call('state');
    if (!st.ok) return st;
    applyState(st, first);
    baseRender();
    return st;
  }

  async function refresh() {
    if (document.hidden || syncing || changes() || S.sheet) return;
    if ((typeof td !== 'undefined' && td) || (typeof drag !== 'undefined' && drag)) return;
    const st = await call('state');
    if (!st.ok || syncing || changes() || S.sheet) return;
    applyState(st, false);
    baseRender();
  }

  /* ---------- API used by the app's actions ---------- */
  window.orviApi = {
    userKey: addUser,
    invite: async (board, username, role) => { await flush(); return call('invite', { board, username, role }); },
    cancelInvite: id => call('invite/cancel', { id }),
    respond: (id, accept) => call('invite/respond', { id, accept }),
    setRole: async (board, userKey, role) => { await flush(); return call('role', { board, user: ID(userKey), role }); },
    newLink: async (board, role) => { await flush(); return call('link/new', { board, role }); },
    linkInfo: code => call('link/info', { code }),
    join: code => call('join', { code }),
    leave: async board => { await flush(); return call('leave', { board }); },
    forget: board => { base.b.delete(board); base.bp.delete(board); for (const [id, s] of base.t) if (JSON.parse(s).board === board) base.t.delete(id); },
    reload: () => reload(false),
  };

  /* ---------- start links from the bot ---------- */
  function route(param) {
    if (!param) return;
    if (param.startsWith('join_')) {
      S.tab = 'shared'; S.stacks.shared = [];
      S.sheet = { type: 'join', link: 'https://t.me/' + BOT + '?start=' + param }; S.fresh = true;
      A.checkLink();
    } else if (param.startsWith('inv_')) {
      const i = INV.find(x => x.inviteId === param.slice(4));
      S.tab = 'shared'; S.stacks.shared = []; S.filter.shared = 'inv';
      if (i) { S.sheet = { type: 'invite', id: i.id }; S.fresh = true; }
      else toast('Це запрошення вже неактуальне');
    } else if (param.startsWith('task_') && getT(param.slice(5))) {
      S.tab = 'home'; S.stacks.home = [{ v: 'task', id: param.slice(5) }];
    } else if (param.startsWith('board_') && getB(param.slice(6))) {
      S.tab = 'home'; S.stacks.home = [{ v: 'board', id: param.slice(6) }];
    }
  }

  /* ---------- boot ---------- */
  const baseRender = render;
  render = function () { baseRender(); schedule(); };

  function screen(html) {
    document.getElementById('app').innerHTML = `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:32px;text-align:center">${logo(64)}${html}</div>`;
    document.documentElement.classList.add('orvi-ready');
  }

  if (!initData) {
    screen(`<p class="lede" style="font-size:15px;max-width:30ch">orvi. працює всередині Telegram. Відкрийте застосунок через бота <b>@${BOT}</b>.</p><a class="btn acc" style="max-width:260px;text-decoration:none" href="https://t.me/${BOT}">Відкрити бота</a>`);
    return;
  }
  const u0 = tg.initDataUnsafe && tg.initDataUnsafe.user;
  if (u0) { MY = u0.id; addUser(u0); }
  B.length = 0; T.length = 0; INV.length = 0; LINK_ONLY.length = 0;
  Object.assign(S, { mode: 'empty', tab: 'home', stacks: { home: [], personal: [], shared: [] }, sheet: null, cancelled: [], toast: null, undo: null });

  (async function boot() {
    const st = await reload(true);
    if (!st || !st.ok) {
      screen(`<p class="lede" style="font-size:15px;max-width:30ch">${st && st.error === 'unauthorized' ? 'Не вдалося підтвердити ваш акаунт Telegram. Закрийте застосунок і відкрийте його знову через бота.' : 'Не вдалося завантажити дані. Перевірте інтернет і спробуйте ще раз.'}</p><button class="btn acc" style="max-width:220px" onclick="location.reload()">Спробувати ще раз</button>`);
      return;
    }
    const param = (tg.initDataUnsafe && tg.initDataUnsafe.start_param) || new URLSearchParams(location.search).get('startapp') || '';
    route(param);
    document.documentElement.classList.add('orvi-ready');
    baseRender();
    setInterval(refresh, 15000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); else refresh(); });
  })();
})();
