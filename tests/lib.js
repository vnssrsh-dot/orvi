// Shared helpers: signed Telegram initData, API calls, bot webhook, captured bot messages, cron trigger.
const crypto = require('crypto'); const fs = require('fs');
const TOKEN = '123456:TEST_TOKEN_FOR_LOCAL_DEV', SECRET = 'local_hook_secret';
const APP = process.env.APP || 'http://127.0.0.1:8799';
const LOG = process.env.TGLOG;

function initData(u, extra = {}) {
  const f = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(u), ...extra };
  const dcs = Object.keys(f).sort().map(k => k + '=' + f[k]).join('\n');
  const key = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  f.hash = crypto.createHmac('sha256', key).update(dcs).digest('hex');
  return new URLSearchParams(f).toString();
}
const call = (u, p, b) => fetch(APP + '/api/' + p, { method: b ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-init-data': initData(u) }, body: b ? JSON.stringify(b) : undefined }).then(r => r.json());
const hook = (u, text = '/start') => fetch(APP + '/bot/' + SECRET, { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': SECRET }, body: JSON.stringify({ message: { chat: { type: 'private', id: u.id }, from: u, text } }) });
const log = () => fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
const sent = () => log().filter(x => x.m === 'sendMessage' && x.ok).map(x => ({ to: x.b.chat_id, text: x.b.text, btn: x.b.reply_markup && x.b.reply_markup.inline_keyboard[0][0], t: x.t }));
const tick = async () => { await fetch(APP + '/__scheduled?cron=*/5+*+*+*+*'); await sleep(1500); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rid = p => p + Math.random().toString(36).slice(2, 10);
let base = 100000 + Math.floor(Math.random() * 800) * 1000;
const user = (name, uname, suffix) => { base += 1; const id = suffix ? Number(String(base) + suffix) : base * 10; return { id, first_name: name, username: (uname + id).slice(0, 30) }; };
// wait until predicate over sent() is true (queue delivery is asynchronous)
async function waitSent(pred, ms = 20000) { const end = Date.now() + ms; while (Date.now() < end) { if (pred(sent())) return true; await sleep(300); } return false; }

const results = { pass: 0, fail: 0, failures: [] };
function ok(cond, msg) { if (cond) { results.pass++; console.log('  ✓ ' + msg); } else { results.fail++; results.failures.push(msg); console.log('  ✗ ' + msg); } }

async function sharedBoard(owner, name = 'Спільна', stages) {
  const id = rid('b');
  const st = stages || [{ id: id + '_0', name: 'Плани', kind: 'todo' }, { id: id + '_1', name: 'Перевірка', kind: 'rev' }, { id: id + '_2', name: 'Готово', kind: 'done' }];
  await call(owner, 'sync', { boards: [{ id, prev: null, next: { type: 'shared', name, icon: 'folder', tint: '', desc: '', team: '', stages: st, deletedAt: null } }] });
  const links = (await call(owner, 'state')).boards.find(b => b.id === id).links;
  return { id, stages: st, links };
}
async function start(u) { await hook(u); await call(u, 'state?boot=1'); }

module.exports = { APP, initData, call, hook, sent, log, tick, sleep, rid, user, ok, results, waitSent, sharedBoard, start };
// wait until no new bot messages arrive for `quiet` ms (queue + debounced summaries are asynchronous)
module.exports.settle = async function settle(quiet = 2500, max = 30000) {
  const { sleep, log } = module.exports; const end = Date.now() + max; let n = log().length, since = Date.now();
  while (Date.now() < end) { await sleep(300); const m = log().length; if (m !== n) { n = m; since = Date.now(); } else if (Date.now() - since >= quiet) return; }
};
