// orvi. — Cloudflare Worker: Mini App API, Telegram bot webhook and scheduled reminders.
// Storage: D1 (binding DB). Secrets: BOT_TOKEN, WEBHOOK_SECRET. Var: BOT_USERNAME.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, username TEXT, username_lc TEXT,
     chat_ok INTEGER DEFAULT 0, prefs TEXT DEFAULT '{}', updated_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS users_username ON users(username_lc)`,
  `CREATE TABLE IF NOT EXISTS boards (id TEXT PRIMARY KEY, owner_id INTEGER, data TEXT, version INTEGER DEFAULT 1, updated_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS members (board_id TEXT, user_id INTEGER, role TEXT, prefs TEXT DEFAULT '{}', joined_at INTEGER,
     PRIMARY KEY (board_id, user_id))`,
  `CREATE INDEX IF NOT EXISTS members_user ON members(user_id)`,
  `CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, board_id TEXT, data TEXT, version INTEGER DEFAULT 1, updated_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS tasks_board ON tasks(board_id)`,
  `CREATE TABLE IF NOT EXISTS invites (id TEXT PRIMARY KEY, board_id TEXT, from_id INTEGER, to_id INTEGER, to_username TEXT,
     role TEXT, status TEXT, created_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS invites_to ON invites(to_id, status)`,
  `CREATE INDEX IF NOT EXISTS invites_board ON invites(board_id, status)`,
  `CREATE TABLE IF NOT EXISTS links (code TEXT PRIMARY KEY, board_id TEXT, role TEXT, created_by INTEGER, expires_at INTEGER,
     uses INTEGER DEFAULT 0, max_uses INTEGER DEFAULT 10, revoked INTEGER DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS links_board ON links(board_id)`,
  `CREATE TABLE IF NOT EXISTS sent (key TEXT PRIMARY KEY, at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`,
];

const ROLES = ['owner', 'editor', 'viewer'];
const ROLE_UA = { owner: 'Власник', editor: 'Редактор', viewer: 'Спостерігач' };
const ROLE_CAN = {
  owner: 'Ви зможете керувати дошкою, учасниками та доступом нарівні з власником.',
  editor: 'Ви зможете створювати й змінювати задачі та підзадачі.',
  viewer: 'Ви зможете переглядати задачі та коментарі без змін.',
};
const SHARED_FIELDS = ['type', 'name', 'icon', 'tint', 'desc', 'team', 'stages', 'deletedAt'];
const LINK_DAYS = 7, LINK_MAX = 10, INIT_MAX_AGE = 7 * 86400;
const ID_RE = /^[A-Za-z0-9_-]{3,64}$/;

const now = () => Date.now();
const S_ = JSON.stringify;
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const rnd = (n = 10) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => 'abcdefghijkmnpqrstuvwxyz23456789'[x % 32]).join(''); };
const json = (o, status = 200) => new Response(S_(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nameOf = u => (u && ([u.first_name, u.last_name].filter(Boolean).join(' ') || (u.username ? '@' + u.username : ''))) || 'Користувач';

let inited = false;
async function init(env) {
  if (inited) return;
  await env.DB.batch(SCHEMA.map(s => env.DB.prepare(s)));
  inited = true;
}

/* ---------- Telegram auth (Mini App initData) ---------- */
const enc = new TextEncoder();
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}
const hex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
async function verifyInitData(initData, token) {
  if (!initData || !token) return null;
  const p = new URLSearchParams(initData);
  const hash = p.get('hash');
  if (!hash) return null;
  p.delete('hash');
  const dcs = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => k + '=' + v).join('\n');
  const secret = await hmac('WebAppData', token);
  if (hex(await hmac(secret, dcs)) !== hash) return null;
  if (now() / 1000 - Number(p.get('auth_date') || 0) > INIT_MAX_AGE) return null;
  const user = parse(p.get('user'), null);
  return user && user.id ? user : null;
}

/* ---------- Telegram Bot API ---------- */
async function tg(env, method, body) {
  try {
    const r = await fetch(`${env.TG_API || 'https://api.telegram.org'}/bot${env.BOT_TOKEN}/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: S_(body),
    });
    return await r.json();
  } catch (e) { return { ok: false, description: String(e) }; }
}
async function appUrl(env) {
  const r = await env.DB.prepare(`SELECT value FROM meta WHERE key='app_url'`).first();
  return r ? r.value : '';
}
async function sendTo(env, userId, html, button) {
  const u = await env.DB.prepare('SELECT chat_ok FROM users WHERE id=?').bind(userId).first();
  if (!u || !u.chat_ok) return false;
  const base = await appUrl(env);
  const body = { chat_id: userId, text: html, parse_mode: 'HTML', disable_web_page_preview: true };
  if (button && base) body.reply_markup = { inline_keyboard: [[{ text: button.text, web_app: { url: base + '/' + (button.start ? '?startapp=' + encodeURIComponent(button.start) : '') } }]] };
  const r = await tg(env, 'sendMessage', body);
  if (!r.ok && r.error_code === 403) await env.DB.prepare('UPDATE users SET chat_ok=0 WHERE id=?').bind(userId).run();
  return !!r.ok;
}

/* ---------- prefs helpers ---------- */
const DEF_NOTIF = { on: true, digest: { on: false, time: '09:00', days: [1, 2, 3, 4, 5, 6, 0], scope: 'today', skipEmpty: true }, due: { when: 'same', time: '09:00', timed: '1h' }, ev: { assign: true, newTask: false, changes: true, comments: true, review: true, members: true } };
const DEF_GLOBAL = { assign: true, due: true, invite: true, changes: true };
function boardNotif(memberPrefs) { const n = parse(memberPrefs, {}).notif; return n ? { ...DEF_NOTIF, ...n, digest: { ...DEF_NOTIF.digest, ...(n.digest || {}) }, due: { ...DEF_NOTIF.due, ...(n.due || {}) }, ev: { ...DEF_NOTIF.ev, ...(n.ev || {}) } } : DEF_NOTIF; }
function globalNotif(userPrefs) { return { ...DEF_GLOBAL, ...(parse(userPrefs, {}).notif || {}) }; }
async function wants(env, userId, boardId, ev) {
  const row = await env.DB.prepare('SELECT u.prefs up, m.prefs mp FROM users u JOIN members m ON m.user_id=u.id WHERE u.id=? AND m.board_id=?').bind(userId, boardId).first();
  if (!row) return false;
  const g = globalNotif(row.up), b = boardNotif(row.mp);
  if (!b.on) return false;
  if (ev === 'assign') return g.assign && b.ev.assign;
  if (ev === 'changes' || ev === 'review' || ev === 'comments') return g.changes && b.ev[ev];
  return !!b.ev[ev];
}

/* ---------- three-way merge (concurrent edits) ---------- */
const keyOf = x => (x && typeof x === 'object') ? String(x.id ?? (x.u + '|' + (x.ts ?? x.t))) : S_(x);
const isIdArr = a => Array.isArray(a) && a.length > 0 && a.every(x => x && typeof x === 'object' && ('id' in x || 'u' in x));
function merge3(prev, next, cur) {
  if (cur === undefined || cur === null) return next;
  if (Array.isArray(next) || Array.isArray(cur)) {
    if (Array.isArray(next) && Array.isArray(cur) && (isIdArr(next) || isIdArr(prev) || isIdArr(cur))) return mergeArr(Array.isArray(prev) ? prev : [], next, cur);
    return S_(next) !== S_(prev) ? next : cur;
  }
  if (!next || typeof next !== 'object' || !cur || typeof cur !== 'object') return S_(next) !== S_(prev) ? next : cur;
  prev = prev && typeof prev === 'object' ? prev : {};
  const out = { ...cur };
  for (const k of new Set([...Object.keys(next), ...Object.keys(prev)])) {
    if (S_(next[k]) === S_(prev[k])) continue;
    if (!(k in next)) { delete out[k]; continue; }
    out[k] = merge3(prev[k], next[k], cur[k]);
  }
  return out;
}
function mergeArr(prev, next, cur) {
  const P = new Map(prev.map(x => [keyOf(x), x])), N = new Map(next.map(x => [keyOf(x), x])), C = new Map(cur.map(x => [keyOf(x), x]));
  const removed = new Set([...P.keys()].filter(k => !N.has(k)));
  const orderChanged = S_(prev.map(keyOf).filter(k => N.has(k))) !== S_(next.map(keyOf).filter(k => P.has(k)));
  const order = orderChanged ? [...next.map(keyOf), ...cur.map(keyOf)] : [...cur.map(keyOf), ...next.map(keyOf)];
  const out = new Map();
  for (const k of order) {
    if (out.has(k) || removed.has(k)) continue;
    const n = N.get(k), p = P.get(k), c = C.get(k);
    if (c && n) out.set(k, p ? merge3(p, n, c) : n);
    else if (c) out.set(k, c);
    else if (n && !p) out.set(k, n); // added by this client; (n && p && !c) = deleted by someone else
  }
  return [...out.values()];
}
const pick = (o, keys) => { const r = {}; for (const k of keys) if (o && k in o) r[k] = o[k]; return r; };

/* ---------- data access ---------- */
async function inChunks(env, sql, ids, pre = []) {
  const out = [];
  for (let i = 0; i < ids.length; i += 80) {
    const part = ids.slice(i, i + 80);
    const r = await env.DB.prepare(sql.replace('(?*)', '(' + part.map(() => '?').join(',') + ')')).bind(...pre, ...part).all();
    out.push(...r.results);
  }
  return out;
}
const roleOf = (env, boardId, userId) => env.DB.prepare('SELECT role FROM members WHERE board_id=? AND user_id=?').bind(boardId, userId).first().then(r => r && r.role);
async function ensureLinks(env, boardId, userId) {
  const rows = (await env.DB.prepare('SELECT code, role, expires_at, uses, max_uses FROM links WHERE board_id=? AND revoked=0').bind(boardId).all()).results;
  const links = {};
  for (const r of ROLES) {
    const ok = rows.find(x => x.role === r && x.expires_at > now() && x.uses < x.max_uses);
    if (ok) { links[r] = ok.code; continue; }
    links[r] = await newLink(env, boardId, r, userId);
  }
  return links;
}
async function newLink(env, boardId, role, userId) {
  await env.DB.prepare('UPDATE links SET revoked=1 WHERE board_id=? AND role=?').bind(boardId, role).run();
  const code = `join_${role.slice(0, 2)}_${rnd(10)}`;
  await env.DB.prepare('INSERT INTO links (code, board_id, role, created_by, expires_at, uses, max_uses) VALUES (?,?,?,?,?,0,?)')
    .bind(code, boardId, role, userId, now() + LINK_DAYS * 86400e3, LINK_MAX).run();
  return code;
}

async function state(env, me) {
  const rows = (await env.DB.prepare('SELECT b.id, b.owner_id, b.data, m.role, m.prefs FROM boards b JOIN members m ON m.board_id=b.id WHERE m.user_id=?').bind(me).all()).results
    .map(r => ({ ...r, data: parse(r.data, {}) }))
    .filter(r => !r.data.deletedAt || r.role === 'owner');
  const ids = rows.map(r => r.id);
  const members = ids.length ? await inChunks(env, 'SELECT board_id, user_id, role FROM members WHERE board_id IN (?*)', ids) : [];
  const tasks = ids.length ? await inChunks(env, 'SELECT id, board_id, data FROM tasks WHERE board_id IN (?*)', ids) : [];
  const pending = ids.length ? await inChunks(env, `SELECT id, board_id, to_username, role FROM invites WHERE status='pending' AND board_id IN (?*)`, ids) : [];
  const invites = (await env.DB.prepare(`SELECT i.id, i.board_id, i.role, i.from_id, b.data FROM invites i JOIN boards b ON b.id=i.board_id WHERE i.to_id=? AND i.status='pending'`).bind(me).all()).results;
  const boards = [];
  for (const r of rows) {
    boards.push({
      id: r.id, role: r.role, data: r.data, prefs: parse(r.prefs, {}),
      members: members.filter(m => m.board_id === r.id).map(m => ({ u: m.user_id, r: m.role })),
      pending: pending.filter(p => p.board_id === r.id).map(p => ({ id: p.id, u: '@' + p.to_username, r: p.role })),
      links: r.role === 'owner' ? await ensureLinks(env, r.id, me) : null,
    });
  }
  const userIds = [...new Set([me, ...members.map(m => m.user_id), ...invites.map(i => i.from_id)])];
  const users = await inChunks(env, 'SELECT id, first_name, last_name, username FROM users WHERE id IN (?*)', userIds);
  const counts = invites.length ? await inChunks(env, 'SELECT board_id, COUNT(*) n FROM members WHERE board_id IN (?*) GROUP BY board_id', invites.map(i => i.board_id)) : [];
  const meRow = await env.DB.prepare('SELECT prefs FROM users WHERE id=?').bind(me).first();
  return {
    ok: true, me, prefs: parse(meRow && meRow.prefs, {}), users, boards,
    tasks: tasks.map(t => ({ id: t.id, board: t.board_id, data: parse(t.data, {}) })),
    invites: invites.map(i => {
      const d = parse(i.data, {});
      return { id: i.id, board: i.board_id, role: i.role, from: i.from_id, name: d.name, icon: d.icon, tint: d.tint, team: d.team || '', people: (counts.find(c => c.board_id === i.board_id) || {}).n || 1 };
    }),
  };
}

/* ---------- sync: boards & tasks with merge and permission checks ---------- */
async function sync(env, me, meUser, body) {
  const out = { ok: true, boards: [], tasks: [], errors: [] };
  const notes = [];
  const kinds = new Map(); // boardId -> {stageId: kind}
  const stagesOf = async id => {
    if (!kinds.has(id)) {
      const b = await env.DB.prepare('SELECT data FROM boards WHERE id=?').bind(id).first();
      const m = {}; (parse(b && b.data, {}).stages || []).forEach(s => { m[s.id] = s; }); kinds.set(id, m);
    }
    return kinds.get(id);
  };

  if (body.prefs && typeof body.prefs === 'object') {
    await env.DB.prepare('UPDATE users SET prefs=? WHERE id=?').bind(S_(body.prefs).slice(0, 20000), me).run();
  }

  for (const it of body.boards || []) {
    if (!it || !ID_RE.test(it.id || '') || !it.next) { out.errors.push({ id: it && it.id, error: 'bad_request' }); continue; }
    const next = pick(it.next, SHARED_FIELDS);
    if (S_(next).length > 100000) { out.errors.push({ id: it.id, error: 'too_large' }); continue; }
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await env.DB.prepare('SELECT data, version FROM boards WHERE id=?').bind(it.id).first();
      if (!cur) {
        next.type = next.type === 'shared' ? 'shared' : 'personal';
        await env.DB.batch([
          env.DB.prepare('INSERT INTO boards (id, owner_id, data, version, updated_at) VALUES (?,?,?,1,?)').bind(it.id, me, S_(next), now()),
          env.DB.prepare('INSERT INTO members (board_id, user_id, role, prefs, joined_at) VALUES (?,?,?,?,?)').bind(it.id, me, 'owner', '{}', now()),
        ]);
        out.boards.push({ id: it.id, data: next, links: await ensureLinks(env, it.id, me) });
        break;
      }
      const role = await roleOf(env, it.id, me);
      if (!role || role === 'viewer') { out.errors.push({ id: it.id, error: 'forbidden' }); break; }
      const curData = parse(cur.data, {});
      let merged = merge3(pick(it.prev, SHARED_FIELDS), next, curData);
      if (role !== 'owner') { merged.type = curData.type; merged.deletedAt = curData.deletedAt ?? null; }
      const r = await env.DB.prepare('UPDATE boards SET data=?, version=version+1, updated_at=? WHERE id=? AND version=?').bind(S_(merged), now(), it.id, cur.version).run();
      if (r.meta.changes) { kinds.delete(it.id); out.boards.push({ id: it.id, data: merged }); break; }
    }
  }

  for (const [id, p] of Object.entries(body.boardPrefs || {})) {
    await env.DB.prepare('UPDATE members SET prefs=? WHERE board_id=? AND user_id=?').bind(S_(pick(p, ['fav', 'notif', 'archived'])), id, me).run();
  }

  for (const it of body.tasks || []) {
    if (!it || !ID_RE.test(it.id || '') || !it.next) { out.errors.push({ id: it && it.id, error: 'bad_request' }); continue; }
    if (S_(it.next).length > 100000) { out.errors.push({ id: it.id, error: 'too_large' }); continue; }
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await env.DB.prepare('SELECT board_id, data, version FROM tasks WHERE id=?').bind(it.id).first();
      const boardId = cur ? cur.board_id : it.board;
      const role = boardId && await roleOf(env, boardId, me);
      if (!role || role === 'viewer') { out.errors.push({ id: it.id, error: 'forbidden' }); break; }
      const next = { ...it.next, board: boardId };
      if (!cur) {
        await env.DB.prepare('INSERT INTO tasks (id, board_id, data, version, updated_at) VALUES (?,?,?,1,?)').bind(it.id, boardId, S_(next), now()).run();
        out.tasks.push({ id: it.id, board: boardId, data: next });
        notes.push({ kind: 'new', board: boardId, task: next, old: null });
        break;
      }
      const curData = parse(cur.data, {});
      const merged = { ...merge3(it.prev || {}, next, curData), board: boardId };
      const r = await env.DB.prepare('UPDATE tasks SET data=?, version=version+1, updated_at=? WHERE id=? AND version=?').bind(S_(merged), now(), it.id, cur.version).run();
      if (r.meta.changes) { out.tasks.push({ id: it.id, board: boardId, data: merged }); notes.push({ kind: 'upd', board: boardId, task: merged, old: curData }); break; }
    }
  }

  for (const id of body.delTasks || []) {
    const cur = await env.DB.prepare('SELECT board_id FROM tasks WHERE id=?').bind(id).first();
    if (!cur) continue;
    const role = await roleOf(env, cur.board_id, me);
    if (!role || role === 'viewer') { out.errors.push({ id, error: 'forbidden' }); continue; }
    await env.DB.prepare('DELETE FROM tasks WHERE id=?').bind(id).run();
  }

  for (const id of body.delBoards || []) {
    const role = await roleOf(env, id, me);
    if (role !== 'owner') { out.errors.push({ id, error: 'forbidden' }); continue; }
    await env.DB.batch(['boards WHERE id', 'members WHERE board_id', 'tasks WHERE board_id', 'invites WHERE board_id', 'links WHERE board_id']
      .map(t => env.DB.prepare(`DELETE FROM ${t}=?`).bind(id)));
  }

  // Telegram notifications for other people affected by this change.
  for (const n of notes) {
    const st = await stagesOf(n.board);
    const bRow = await env.DB.prepare('SELECT data FROM boards WHERE id=?').bind(n.board).first();
    const bName = esc(parse(bRow && bRow.data, {}).name || 'дошка');
    const actor = esc(nameOf(meUser));
    const t = n.task, o = n.old;
    const open = { text: 'Відкрити задачу', start: 'task_' + t.id };
    if (t.who && t.who !== me && (!o || o.who !== t.who) && await wants(env, t.who, n.board, 'assign'))
      await sendTo(env, t.who, `👤 <b>${actor}</b> призначає вам задачу «${esc(t.title)}» · ${bName}`, open);
    for (const s of t.subs || []) {
      const os = o && (o.subs || []).find(x => x.id === s.id);
      if (s.who && s.who !== me && (!os || os.who !== s.who) && await wants(env, s.who, n.board, 'assign'))
        await sendTo(env, s.who, `👤 <b>${actor}</b> призначає вам підзадачу «${esc(s.title)}» у задачі «${esc(t.title)}» · ${bName}`, open);
    }
    if (!o) {
      const ms = (await env.DB.prepare('SELECT user_id FROM members WHERE board_id=? AND user_id<>?').bind(n.board, me).all()).results;
      for (const m of ms) if (m.user_id !== t.who && await wants(env, m.user_id, n.board, 'newTask'))
        await sendTo(env, m.user_id, `➕ Нова задача на дошці ${bName}: «${esc(t.title)}» · додає ${actor}`, open);
      continue;
    }
    if (t.who && t.who !== me) {
      const nk = st[t.stage] && st[t.stage].kind, okk = st[o.stage] && st[o.stage].kind;
      if (t.stage !== o.stage && nk === 'rev' && await wants(env, t.who, n.board, 'review'))
        await sendTo(env, t.who, `👁 <b>${actor}</b> передає на перевірку задачу «${esc(t.title)}» · ${bName}`, open);
      else if ((t.stage !== o.stage || t.due !== o.due) && o.who === t.who && await wants(env, t.who, n.board, 'changes'))
        await sendTo(env, t.who, `✏️ <b>${actor}</b> змінює ${t.due !== o.due ? `термін задачі «${esc(t.title)}»: ${t.due ? t.due.split('-').reverse().slice(0, 2).join('.') : 'без терміну'}` : `етап задачі «${esc(t.title)}» на «${esc((st[t.stage] || {}).name || '')}»`} · ${bName}`, open);
      void okk;
    }
    const oldC = new Set((o.comments || []).map(keyOf));
    const fresh = (t.comments || []).filter(c => !oldC.has(keyOf(c)) && c.u === me);
    if (fresh.length) {
      const to = new Set([t.who, ...(t.people || [])].filter(x => x && x !== me));
      for (const u of to) if (await wants(env, u, n.board, 'comments'))
        await sendTo(env, u, `💬 <b>${actor}</b> у задачі «${esc(t.title)}»: ${esc(fresh[fresh.length - 1].t).slice(0, 300)}`, open);
    }
  }
  return out;
}

/* ---------- membership & invitations ---------- */
async function boardRow(env, id) { const r = await env.DB.prepare('SELECT id, data FROM boards WHERE id=?').bind(id).first(); return r ? { id: r.id, data: parse(r.data, {}) } : null; }

async function invite(env, me, meUser, { board, username, role }) {
  if (!ROLES.includes(role)) return { ok: false, error: 'bad_request' };
  if (await roleOf(env, board, me) !== 'owner') return { ok: false, error: 'forbidden' };
  const uname = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!/^[a-z0-9_]{4,32}$/.test(uname)) return { ok: false, error: 'bad_username' };
  const u = await env.DB.prepare('SELECT id, chat_ok, prefs FROM users WHERE username_lc=?').bind(uname).first();
  if (!u || !u.chat_ok) return { ok: false, error: 'not_started' };
  if (u.id === me) return { ok: false, error: 'self' };
  if (await roleOf(env, board, u.id)) return { ok: false, error: 'member' };
  await env.DB.prepare(`UPDATE invites SET status='cancelled' WHERE board_id=? AND to_id=? AND status='pending'`).bind(board, u.id).run();
  const id = rnd(12);
  await env.DB.prepare(`INSERT INTO invites (id, board_id, from_id, to_id, to_username, role, status, created_at) VALUES (?,?,?,?,?,?,'pending',?)`)
    .bind(id, board, me, u.id, uname, role, now()).run();
  const b = await boardRow(env, board);
  if (globalNotif(u.prefs).invite)
    await sendTo(env, u.id, `📩 <b>${esc(nameOf(meUser))}</b> запрошує вас приєднатися до дошки «${esc(b.data.name)}».\nВаша роль: <b>${ROLE_UA[role]}</b>. ${ROLE_CAN[role]}`, { text: 'Відкрити запрошення', start: 'inv_' + id });
  return { ok: true, pending: { id, u: '@' + uname, r: role } };
}

async function addMember(env, board, userId, role, meUser) {
  await env.DB.prepare('INSERT OR IGNORE INTO members (board_id, user_id, role, prefs, joined_at) VALUES (?,?,?,?,?)').bind(board, userId, role, '{}', now()).run();
  const b = await boardRow(env, board);
  const owners = (await env.DB.prepare(`SELECT user_id FROM members WHERE board_id=? AND role='owner' AND user_id<>?`).bind(board, userId).all()).results;
  for (const o of owners) if (await wants(env, o.user_id, board, 'members'))
    await sendTo(env, o.user_id, `🙌 <b>${esc(nameOf(meUser))}</b> приєднується до дошки «${esc(b.data.name)}» як ${ROLE_UA[role].toLowerCase()}.`, { text: 'Відкрити дошку', start: 'board_' + board });
}

async function linkInfo(env, me, code) {
  const l = await env.DB.prepare('SELECT * FROM links WHERE code=?').bind(String(code || '')).first();
  if (!l || l.revoked) return { ok: false, error: 'invalid' };
  const b = await boardRow(env, l.board_id);
  if (!b || b.data.deletedAt) return { ok: false, error: 'invalid' };
  if (await roleOf(env, l.board_id, me)) return { ok: true, member: l.board_id };
  if (l.expires_at < now()) return { ok: false, error: 'expired' };
  if (l.uses >= l.max_uses) return { ok: false, error: 'full' };
  const people = await env.DB.prepare('SELECT COUNT(*) n FROM members WHERE board_id=?').bind(l.board_id).first();
  const from = await env.DB.prepare('SELECT id, first_name, last_name, username FROM users WHERE id=?').bind(l.created_by).first();
  return { ok: true, board: l.board_id, role: l.role, name: b.data.name, icon: b.data.icon, tint: b.data.tint, team: b.data.team || '', people: people.n, from };
}

/* ---------- HTTP ---------- */
async function api(req, env, path) {
  const user = await verifyInitData(req.headers.get('x-init-data'), env.BOT_TOKEN);
  if (!user) return json({ ok: false, error: 'unauthorized' }, 401);
  const me = user.id;
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

  if (path === 'state') {
    await env.DB.prepare(`INSERT INTO users (id, first_name, last_name, username, username_lc, updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET first_name=excluded.first_name, last_name=excluded.last_name, username=excluded.username, username_lc=excluded.username_lc, updated_at=excluded.updated_at`)
      .bind(me, user.first_name || '', user.last_name || '', user.username || '', (user.username || '').toLowerCase(), now()).run();
    await env.DB.prepare(`INSERT INTO meta (key, value) VALUES ('app_url', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(new URL(req.url).origin).run();
    return json(await state(env, me));
  }
  if (path === 'sync') return json(await sync(env, me, user, body));
  if (path === 'invite') return json(await invite(env, me, user, body));
  if (path === 'invite/cancel') {
    const i = await env.DB.prepare('SELECT board_id FROM invites WHERE id=?').bind(body.id).first();
    if (!i || await roleOf(env, i.board_id, me) !== 'owner') return json({ ok: false, error: 'forbidden' });
    await env.DB.prepare(`UPDATE invites SET status='cancelled' WHERE id=?`).bind(body.id).run();
    return json({ ok: true });
  }
  if (path === 'invite/respond') {
    const i = await env.DB.prepare(`SELECT * FROM invites WHERE id=? AND to_id=? AND status='pending'`).bind(body.id, me).first();
    if (!i) return json({ ok: false, error: 'invalid' });
    const b = await boardRow(env, i.board_id);
    if (!b || b.data.deletedAt) return json({ ok: false, error: 'invalid' });
    await env.DB.prepare('UPDATE invites SET status=? WHERE id=?').bind(body.accept ? 'accepted' : 'declined', i.id).run();
    if (body.accept) await addMember(env, i.board_id, me, i.role, user);
    return json({ ok: true, board: i.board_id, role: i.role });
  }
  if (path === 'role') {
    const { board, user: target, role } = body;
    if (await roleOf(env, board, me) !== 'owner') return json({ ok: false, error: 'forbidden' });
    if (target === me) return json({ ok: false, error: 'self' });
    if (role === 'remove') await env.DB.prepare('DELETE FROM members WHERE board_id=? AND user_id=?').bind(board, target).run();
    else if (ROLES.includes(role)) await env.DB.prepare('UPDATE members SET role=? WHERE board_id=? AND user_id=?').bind(role, board, target).run();
    else return json({ ok: false, error: 'bad_request' });
    return json({ ok: true });
  }
  if (path === 'link/new') {
    if (!ROLES.includes(body.role) || await roleOf(env, body.board, me) !== 'owner') return json({ ok: false, error: 'forbidden' });
    return json({ ok: true, code: await newLink(env, body.board, body.role, me) });
  }
  if (path === 'link/info') return json(await linkInfo(env, me, body.code));
  if (path === 'join') {
    const info = await linkInfo(env, me, body.code);
    if (!info.ok) return json(info);
    if (info.member) return json({ ok: true, board: info.member, already: true });
    const r = await env.DB.prepare('UPDATE links SET uses=uses+1 WHERE code=? AND uses<max_uses AND revoked=0').bind(body.code).run();
    if (!r.meta.changes) return json({ ok: false, error: 'full' });
    await addMember(env, info.board, me, info.role, user);
    return json({ ok: true, board: info.board, role: info.role });
  }
  if (path === 'leave') {
    const role = await roleOf(env, body.board, me);
    if (!role) return json({ ok: true });
    if (role === 'owner') {
      const others = await env.DB.prepare(`SELECT COUNT(*) n FROM members WHERE board_id=? AND role='owner' AND user_id<>?`).bind(body.board, me).first();
      if (!others.n) return json({ ok: false, error: 'last_owner' });
    }
    await env.DB.prepare('DELETE FROM members WHERE board_id=? AND user_id=?').bind(body.board, me).run();
    return json({ ok: true });
  }
  return json({ ok: false, error: 'not_found' }, 404);
}

async function webhook(req, env) {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
  const up = await req.json().catch(() => ({}));
  if (up.my_chat_member) {
    const st = up.my_chat_member.new_chat_member && up.my_chat_member.new_chat_member.status;
    if (st === 'kicked') await env.DB.prepare('UPDATE users SET chat_ok=0 WHERE id=?').bind(up.my_chat_member.from.id).run();
    return new Response('ok');
  }
  const m = up.message;
  if (!m || !m.from || (m.chat && m.chat.type !== 'private')) return new Response('ok');
  const u = m.from;
  await env.DB.prepare(`INSERT INTO users (id, first_name, last_name, username, username_lc, chat_ok, updated_at) VALUES (?,?,?,?,?,1,?)
    ON CONFLICT(id) DO UPDATE SET first_name=excluded.first_name, last_name=excluded.last_name, username=excluded.username, username_lc=excluded.username_lc, chat_ok=1, updated_at=excluded.updated_at`)
    .bind(u.id, u.first_name || '', u.last_name || '', u.username || '', (u.username || '').toLowerCase(), now()).run();
  const text = String(m.text || '');
  const param = text.startsWith('/start') ? (text.split(/\s+/)[1] || '') : '';
  const safe = /^[A-Za-z0-9_-]{1,64}$/.test(param) ? param : '';
  let msg = `Вітаю в <b>orvi.</b> Тут зібрані ваші особисті та спільні дошки.\n\nПорядок створює свободу.`;
  if (safe.startsWith('join_')) msg = 'Вас запрошують до дошки в <b>orvi.</b> Натисніть кнопку, щоб переглянути запрошення.';
  await sendTo(env, u.id, msg, { text: safe.startsWith('join_') ? 'Переглянути запрошення' : 'Відкрити orvi.', start: safe });
  return new Response('ok');
}

async function setup(req, env) {
  const url = new URL(req.url);
  if (!env.WEBHOOK_SECRET || url.searchParams.get('secret') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
  await init(env);
  const origin = url.origin;
  await env.DB.prepare(`INSERT INTO meta (key, value) VALUES ('app_url', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(origin).run();
  const res = {
    webhook: await tg(env, 'setWebhook', { url: origin + '/bot/' + env.WEBHOOK_SECRET, secret_token: env.WEBHOOK_SECRET, allowed_updates: ['message', 'my_chat_member'] }),
    menu: await tg(env, 'setChatMenuButton', { menu_button: { type: 'web_app', text: 'orvi.', web_app: { url: origin + '/' } } }),
    commands: await tg(env, 'setMyCommands', { commands: [{ command: 'start', description: 'Відкрити orvi.' }] }),
  };
  const ok = res.webhook.ok && res.menu.ok;
  return new Response(ok ? `orvi. готово ✅\nWebhook: ${origin}/bot/…\nКнопка меню бота відкриває ${origin}/\n` : 'Помилка налаштування:\n' + S_(res, null, 2), { headers: { 'content-type': 'text/plain; charset=utf-8' }, status: ok ? 200 : 500 });
}

/* ---------- scheduled: daily digests and due-date reminders ---------- */
const hm = d => String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
const isoUTC = d => d.toISOString().slice(0, 10);
const addMin = (t, m) => { const [h, mm] = t.split(':').map(Number); const x = ((h * 60 + mm + m) % 1440 + 1440) % 1440; return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); };
const minsBetween = (a, b) => { const [ah, am] = a.split(':').map(Number), [bh, bm] = b.split(':').map(Number); return (bh * 60 + bm) - (ah * 60 + am); };
function quietShift(t, q) {
  if (!q || !q.on) return t;
  const inQ = q.from < q.to ? (t >= q.from && t < q.to) : (t >= q.from || t < q.to);
  return inQ ? q.to : t;
}
const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400e3);

async function once(env, key) {
  const r = await env.DB.prepare('INSERT OR IGNORE INTO sent (key, at) VALUES (?,?)').bind(key, now()).run();
  return r.meta.changes > 0;
}

async function scheduled(env) {
  await init(env);
  const users = (await env.DB.prepare('SELECT id, prefs FROM users WHERE chat_ok=1').all()).results;
  for (const u of users) {
    const prefs = parse(u.prefs, {});
    const g = globalNotif(u.prefs);
    const tz = Number.isFinite(prefs.tz) ? prefs.tz : 120;
    const local = new Date(Date.now() + tz * 60000);
    const today = isoUTC(local), nowHM = hm(local), wd = local.getUTCDay();
    const due = (target) => { const t = quietShift(target, prefs.quiet); const m = minsBetween(t, nowHM); return m >= 0 && m < 30; };
    const ms = (await env.DB.prepare('SELECT m.board_id, m.prefs, b.data FROM members m JOIN boards b ON b.id=m.board_id WHERE m.user_id=?').bind(u.id).all()).results;
    for (const m of ms) {
      const bd = parse(m.data, {});
      if (bd.deletedAt) continue;
      const n = boardNotif(m.prefs);
      if (!n.on) continue;
      const kind = {}; (bd.stages || []).forEach(s => { kind[s.id] = s.kind; });
      const tasks = (await env.DB.prepare('SELECT id, data FROM tasks WHERE board_id=?').bind(m.board_id).all()).results.map(t => parse(t.data, {}));
      const items = [];
      for (const t of tasks) {
        if (kind[t.stage] === 'done') continue;
        if (t.who === u.id) items.push({ id: t.id, title: t.title, due: t.due, time: t.time, task: t.id });
        for (const s of t.subs || []) if (s.who === u.id && s.st !== 'done') items.push({ id: s.id, title: s.title, due: s.due, time: '', task: t.id, sub: true });
      }
      const bName = esc(bd.name || 'дошка');
      // daily digest
      if (n.digest.on && (n.digest.days || []).includes(wd) && due(n.digest.time) && await once(env, `dg:${u.id}:${m.board_id}:${today}`)) {
        const sc = n.digest.scope;
        const list = items.filter(x => sc === 'all' || (x.due && (sc === 'today' ? x.due <= today : dayDiff(today, x.due) <= 7))).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
        if (list.length || !n.digest.skipEmpty) {
          const rel = d => { if (!d) return ''; const k = dayDiff(today, d); return k < 0 ? ' (прострочено)' : k === 0 ? ' (сьогодні)' : k === 1 ? ' (завтра)' : ` (${d.split('-').reverse().slice(0, 2).join('.')})`; };
          const head = { today: 'На сьогодні', week: 'Найближчий тиждень', all: 'Відкриті задачі' }[sc];
          const body = list.length ? `${head}: ${list.length}\n` + list.slice(0, 10).map(x => `• ${esc(x.title)}${rel(x.due)}`).join('\n') + (list.length > 10 ? `\nі ще ${list.length - 10}` : '') : 'Задач немає. Гарного дня!';
          await sendTo(env, u.id, `☀️ <b>${bName}</b>\n${body}`, { text: 'Відкрити дошку', start: 'board_' + m.board_id });
        }
      }
      // due-date reminders at an exact time
      if (g.due && n.due.when !== 'off') {
        const off = { same: 0, before1: 1, before2: 2 }[n.due.when] || 0;
        for (const x of items) {
          if (!x.due || dayDiff(today, x.due) !== off) continue;
          if (due(n.due.time) && await once(env, `due:${u.id}:${x.id}:${x.due}:${n.due.when}:${n.due.time}`)) {
            const when = off === 0 ? 'сьогодні' : off === 1 ? 'завтра' : 'післязавтра';
            await sendTo(env, u.id, `⏰ Нагадування: «${esc(x.title)}», термін ${when}${x.time ? ' о ' + x.time : ''} · ${bName}`, { text: x.sub ? 'Відкрити підзадачу' : 'Відкрити задачу', start: 'task_' + x.task });
          }
        }
      }
      if (g.due && n.due.timed !== 'off') {
        const before = { '15m': 15, '1h': 60, '3h': 180 }[n.due.timed];
        for (const x of items) {
          if (!x.time || x.due !== today || !before) continue;
          const target = addMin(x.time, -before);
          if (minsBetween(target, x.time) > 0 && due(target) && await once(env, `tm:${u.id}:${x.id}:${x.due}:${x.time}:${n.due.timed}`))
            await sendTo(env, u.id, `⏰ О ${x.time}: «${esc(x.title)}» · ${bName}`, { text: 'Відкрити задачу', start: 'task_' + x.task });
        }
      }
    }
  }
  await env.DB.prepare('DELETE FROM sent WHERE at<?').bind(now() - 30 * 86400e3).run();
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith('/api/')) { await init(env); return await api(req, env, url.pathname.slice(5)); }
      if (url.pathname.startsWith('/bot/') && req.method === 'POST') { await init(env); return await webhook(req, env); }
      if (url.pathname === '/setup') return await setup(req, env);
    } catch (e) {
      return json({ ok: false, error: 'server_error', detail: String(e && e.message || e) }, 500);
    }
    return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Not found', { status: 404 });
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(scheduled(env)); },
};
