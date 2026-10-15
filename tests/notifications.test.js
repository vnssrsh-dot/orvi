// Who receives which bot message, with what text, and who must not.
const { call, hook, rid, user, ok, sent, settle, tick, sleep, sharedBoard, start, APP, waitSent } = require('./lib');
const NOTIF = (o = {}) => ({ on: true, digest: { on: false, time: '09:00', days: [0, 1, 2, 3, 4, 5, 6], scope: 'today', skipEmpty: true }, due: { when: 'off', time: '09:00', timed: 'off' }, ev: { assign: true, newTask: false, changes: true, comments: true, review: true, members: true }, ...o });
module.exports = async function () {
  const O = user('Оля', 'olya'), E = user('Едік', 'edik'), V = user('Віка', 'vika'), N = user('Ніна', 'nina');
  for (const u of [O, E, V]) await start(u);
  await call(N, 'state?boot=1'); // N never pressed Start
  await settle();
  const to = (u, m) => sent().slice(m).filter(x => x.to === u.id).map(x => x.text);
  const mark = () => sent().length;
  const b = await sharedBoard(O, 'Спільна'); const [P, R, D] = b.stages.map(s => s.id);

  console.log('Notifications: invitations');
  let m = mark();
  ok((await call(O, 'invite', { board: b.id, username: '@' + E.username, role: 'editor' })).ok, 'invite by @username accepted');
  await settle();
  let g = to(E, m);
  ok(g.length === 1 && /Оля<\/b> запрошує вас приєднатися до дошки «Спільна»/.test(g[0]) && /Редактор/.test(g[0]), 'exactly one invite message with inviter, board and role');
  ok(to(O, m).length === 0, 'the inviter gets nothing');
  ok((await call(O, 'invite', { board: b.id, username: N.username, role: 'viewer' })).error === 'not_started', 'person who never started the bot: clear error');
  m = mark(); const inv = (await call(E, 'state')).invites.find(i => i.board === b.id);
  await call(E, 'invite/respond', { id: inv.id, accept: true }); await call(E, 'invite/respond', { id: inv.id, accept: true }); await settle();
  ok(to(O, m).filter(x => /Едік<\/b> приєднується до дошки «Спільна» як редактор/.test(x)).length === 1, 'owner told once that E joined');
  await call(V, 'join', { code: b.links.editor }); await settle();
  m = mark(); await call(O, 'role', { board: b.id, user: V.id, role: 'viewer' }); await settle();
  ok(to(V, m).some(x => /Ваша роль на дошці «Спільна» тепер: <b>Спостерігач/.test(x)), 'member told about a role change');
  await call(O, 'role', { board: b.id, user: V.id, role: 'editor' }); await settle();

  console.log('Notifications: tasks');
  const tid = rid('t'); const T0 = { id: tid, board: b.id, stage: P, title: 'Звіт', who: O.id, people: [], subs: [], comments: [] };
  m = mark(); await call(O, 'sync', { tasks: [{ id: tid, board: b.id, prev: null, next: T0 }] }); await settle();
  ok(sent().length === m, 'own task for yourself: nobody notified');
  m = mark(); const T1 = { ...T0, who: E.id }; await call(O, 'sync', { tasks: [{ id: tid, board: b.id, prev: T0, next: T1 }] }); await settle();
  ok(to(E, m).length === 1 && /Оля<\/b> призначає вам задачу «Звіт» · Спільна/.test(to(E, m)[0]), 'assignee gets exactly one assignment message');
  ok(to(O, m).length === 0, 'the author is not notified about their own action');
  m = mark(); const T2 = { ...T1, subs: [{ id: 's1' + tid, title: 'Цифри', who: V.id, comments: [] }] }; await call(O, 'sync', { tasks: [{ id: tid, board: b.id, prev: T1, next: T2 }] }); await settle();
  ok(to(V, m).some(x => /призначає вам підзадачу «Цифри» у задачі «Звіт»/.test(x)) && to(E, m).length === 0, 'subtask assignee notified, task assignee not spammed');
  m = mark(); const T3 = { ...T2, comments: [{ id: 'c1' + tid, u: O.id, t: 'Гляньте', ts: Date.now() }], people: [V.id] }; await call(O, 'sync', { tasks: [{ id: tid, board: b.id, prev: T2, next: T3 }] }); await settle();
  ok(to(E, m).some(x => /Гляньте/.test(x)) && to(V, m).some(x => /Гляньте/.test(x)) && to(O, m).length === 0, 'task comment: responsible + participants, not the author');
  m = mark(); const T4 = { ...T3, subs: [{ ...T3.subs[0], comments: [{ id: 'sc1' + tid, u: O.id, t: 'Додайте джерела', ts: Date.now() }] }] }; await call(O, 'sync', { tasks: [{ id: tid, board: b.id, prev: T3, next: T4 }] }); await settle();
  ok(to(V, m).some(x => /у підзадачі «Цифри» \(задача «Звіт»\): Додайте джерела/.test(x)) && to(E, m).some(x => /Додайте джерела/.test(x)), 'subtask comment: subtask assignee and task responsible notified');

  console.log('Notifications: debounced stage / due changes');
  let cur = T4; const mv = async (patch, who = O) => { const n = { ...cur, ...patch }; await call(who, 'sync', { tasks: [{ id: tid, board: b.id, prev: cur, next: n }] }); cur = n; };
  m = mark(); await mv({ stage: R }); await sleep(300); await mv({ stage: D }); await sleep(300); await mv({ stage: P });
  await settle(5000);
  ok(!to(E, m).some(x => /змінює задачу|перевірку/.test(x)), 'dragged there and back: no message at all');
  m = mark(); await mv({ stage: D }); await sleep(300); await mv({ due: '2030-05-25' });
  await waitSent(L => L.slice(m).some(x => x.to === E.id && /змінює задачу/.test(x.text)), 40000); await settle(3000);
  g = to(E, m); ok(g.length === 1 && /Етап: «Плани» → «Готово»/.test(g[0]) && /Термін: без терміну → 25\.05/.test(g[0]), 'one summary with stage and due date: ' + (g[0] || '').replace(/\n/g, ' / '));
  m = mark(); await mv({ stage: P }); await sleep(300); await mv({ stage: R });
  await waitSent(L => L.slice(m).some(x => x.to === E.id && /перевірку/.test(x.text)), 40000); await settle(3000);
  g = to(E, m); ok(g.length === 1 && /передає на перевірку задачу «Звіт»/.test(g[0]), 'hand-off to review: one review message');

  console.log('Notifications: undo is quiet');
  await call(E, 'sync', { boardPrefs: { [b.id]: { notif: NOTIF({ ev: { ...NOTIF().ev, newTask: true } }) } } });
  const t5 = rid('t'); const T5 = { id: t5, board: b.id, stage: P, title: 'Видалю', who: O.id };
  await call(O, 'sync', { tasks: [{ id: t5, board: b.id, prev: null, next: T5 }] }); await settle();
  ok(to(E, 0).some(x => /Нова задача на дошці Спільна: «Видалю»/.test(x)), 'newTask event works when enabled');
  await call(O, 'sync', { delTasks: [t5] }); m = mark(); await call(O, 'sync', { tasks: [{ id: t5, board: b.id, prev: null, next: T5 }] }); await settle();
  ok(to(E, m).length === 0, 'restoring a just-deleted task (undo) sends nothing');

  console.log('Notifications: settings are respected');
  await call(E, 'sync', { boardPrefs: { [b.id]: { notif: NOTIF({ ev: { ...NOTIF().ev, assign: false } }) } } });
  m = mark(); await mv({ who: O.id }); await mv({ who: E.id }); await settle();
  ok(!to(E, m).some(x => /призначає/.test(x)), 'assign event off: no assignment message');
  await call(E, 'sync', { boardPrefs: { [b.id]: { notif: NOTIF({ on: false }) } } });
  m = mark(); await mv({ comments: [...cur.comments, { id: 'c2' + tid, u: O.id, t: 'Ще', ts: Date.now() }] }); await settle(4000);
  ok(to(E, m).length === 0, 'board notifications off: nothing at all');
  await call(E, 'sync', { boardPrefs: { [b.id]: { notif: NOTIF() } }, prefs: { notif: { assign: false, due: true, invite: true, changes: true } } });
  m = mark(); await mv({ who: O.id }); await mv({ who: E.id }); await settle();
  ok(!to(E, m).some(x => /призначає/.test(x)), 'global assignment switch off: no assignment message');

  console.log('Notifications: blocked bot');
  await fetch(APP + '/bot/local_hook_secret', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'local_hook_secret' }, body: JSON.stringify({ my_chat_member: { from: N, new_chat_member: { status: 'kicked' } } }) });
  await hook(V); await fetch(APP + '/bot/local_hook_secret', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'local_hook_secret' }, body: JSON.stringify({ my_chat_member: { from: V, new_chat_member: { status: 'kicked' } } }) });
  ok((await call(O, 'invite', { board: rid('x'), username: V.username, role: 'viewer' })).error === 'forbidden', 'sanity: invite needs owner');
  const b2 = await sharedBoard(O, 'Друга');
  ok((await call(O, 'invite', { board: b2.id, username: V.username, role: 'viewer' })).error === 'not_started', 'someone who blocked the bot is treated as unreachable');

  console.log('Notifications: scheduled digest & reminders');
  const tz = 180; const local = new Date(Date.now() + tz * 60000);
  const hm = d => String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
  const nowHM = hm(local), today = local.toISOString().slice(0, 10), wd = local.getUTCDay(), tomorrow = new Date(local.getTime() + 86400e3).toISOString().slice(0, 10);
  const later = hm(new Date(local.getTime() + 40 * 60000)), inHourD = new Date(local.getTime() + 60 * 60000), inHour = hm(inHourD), inHourDay = inHourD.toISOString().slice(0, 10);
  const mk = (title, o) => { const id = rid('t'); return { id, board: b.id, stage: P, title, who: E.id, ...o }; };
  const tasks = [mk('Сьогоднішня', { due: today }), mk('Завтрашня', { due: tomorrow }), mk('Виконана', { due: today, stage: D }), mk('О годині', { due: inHourDay, time: inHour })];
  await call(O, 'sync', { tasks: tasks.map(t => ({ id: t.id, board: b.id, prev: null, next: t })) }); await settle();
  await call(E, 'sync', { prefs: { tz, quiet: { on: false, from: '22:00', to: '07:00' }, notif: { assign: true, due: true, invite: true, changes: true } }, boardPrefs: { [b.id]: { notif: NOTIF({ digest: { on: true, time: nowHM, days: [wd], scope: 'today', skipEmpty: true }, due: { when: 'before1', time: nowHM, timed: '1h' } }) } } });
  m = mark(); await tick(); await settle(3000); g = to(E, m);
  const dg = g.find(x => x.startsWith('☀️'));
  ok(!!dg && /Сьогоднішня/.test(dg) && !/Виконана|Завтрашня/.test(dg) && (/О годині/.test(dg) === (inHourDay === today)), 'digest at the chosen local time lists only today\'s open tasks');
  ok(g.some(x => /Нагадування: «Завтрашня», термін завтра/.test(x)), '"day before" reminder at the exact time');
  ok(!g.some(x => /«Сьогоднішня», термін/.test(x)), 'no "day before" reminder for a task due today');
  ok(g.some(x => /⏰ О .*«О годині»/.test(x)), 'timed task: reminder one hour before');
  ok(to(O, m).length === 0, 'others do not get E\'s digest');
  m = mark(); await tick(); await settle(2000); ok(to(E, m).length === 0, 'next cron run: no duplicates');
  await call(E, 'sync', { boardPrefs: { [b.id]: { notif: NOTIF({ digest: { on: true, time: later, days: [wd], scope: 'today', skipEmpty: true }, due: { when: 'before1', time: later, timed: 'off' } }) } } });
  m = mark(); await tick(); await settle(2000); ok(to(E, m).length === 0, 'changing the time after sending does not resend today');
  await call(O, 'sync', { prefs: { tz, quiet: { on: true, from: hm(new Date(local.getTime() - 3600e3)), to: later }, notif: { assign: true, due: true, invite: true, changes: true } } });
  await call(O, 'sync', { boardPrefs: { [b.id]: { notif: NOTIF({ digest: { on: true, time: nowHM, days: [wd], scope: 'all', skipEmpty: false } }) } } });
  m = mark(); await tick(); await settle(2000); ok(to(O, m).length === 0, 'digest inside quiet hours is postponed');
  await call(O, 'sync', { prefs: { tz, quiet: { on: false, from: '22:00', to: '07:00' }, notif: { assign: true, due: true, invite: true, changes: true } }, boardPrefs: { [b.id]: { notif: NOTIF({ digest: { on: true, time: nowHM, days: [(wd + 1) % 7], scope: 'all', skipEmpty: false } }) } } });
  m = mark(); await tick(); await settle(2000); ok(to(O, m).length === 0, 'no digest on a day that is not selected');
  // across midnight: pick a timezone where it is 23:40 now; a task at 00:30 tomorrow must remind at 23:30 today
  const Wn = user('Вова', 'vova'); await start(Wn); await call(Wn, 'join', { code: b.links.editor }); await settle();
  const utcMin = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
  let tzW = ((23 * 60 + 40 - utcMin) % 1440 + 1440) % 1440; if (tzW > 840) tzW -= 1440;
  const tomorrowW = new Date(Date.now() + tzW * 60000 + 86400e3).toISOString().slice(0, 10);
  const tw = mk('Нічна', { who: Wn.id, due: tomorrowW, time: '00:30' });
  await call(O, 'sync', { tasks: [{ id: tw.id, board: b.id, prev: null, next: tw }] });
  await call(Wn, 'sync', { prefs: { tz: tzW, quiet: { on: false, from: '22:00', to: '07:00' }, notif: { assign: true, due: true, invite: true, changes: true } }, boardPrefs: { [b.id]: { notif: NOTIF({ due: { when: 'off', time: '09:00', timed: '1h' } }) } } });
  await settle(); m = mark(); await tick(); await settle(3000);
  ok(to(Wn, m).some(x => /⏰ О 00:30 \(завтра\): «Нічна»/.test(x)), 'a 00:30 task reminds one hour before, at 23:30 the day before');
  const bd = (await call(O, 'state')).boards.find(x => x.id === b.id).data;
  await call(O, 'sync', { boards: [{ id: b.id, prev: bd, next: { ...bd, deletedAt: today } }] });
  await call(E, 'sync', { boardPrefs: { [b.id]: { notif: NOTIF({ digest: { on: true, time: nowHM, days: [0, 1, 2, 3, 4, 5, 6], scope: 'all', skipEmpty: false }, due: { when: 'same', time: nowHM, timed: 'off' } }) } } });
  m = mark(); await tick(); await settle(2000); ok(to(E, m).length === 0, 'nothing from a board in the trash');
};
