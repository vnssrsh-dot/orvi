// Message queue: Telegram rate limits, retries and blocked chats.
const { call, rid, user, ok, log, settle, sleep, sharedBoard, start, waitSent } = require('./lib');
module.exports = async function () {
  console.log('Queue: rate limits & retries');
  const O = user('Оля', 'olyaq'), E = user('Едік', 'edikq');
  const R429 = user('Рита', 'rita', '91'), R502 = user('Ромко', 'romko', '92'), R403 = user('Роксі', 'roksi', '93');
  await start(O); await start(E);
  for (const u of [R429, R502, R403]) { await call(u, 'state?boot=1'); await call(u, 'chatok', {}); } // their first bot message is the one under test
  await settle();
  const b = await sharedBoard(O, 'Черга');
  for (const u of [E, R429, R502, R403]) await call(u, 'join', { code: b.links.editor });
  await settle();
  const mark = log().length; const t0 = Date.now(); const tid = rid('t');
  const subs = [1, 2, 3, 4, 5, 6].map(i => ({ id: 's' + i + tid, title: 'Підзадача ' + i, who: E.id }));
  await call(O, 'sync', { tasks: [{ id: tid, board: b.id, prev: null, next: { id: tid, board: b.id, stage: b.stages[0].id, title: 'Велика', who: E.id, subs: [...subs, { id: 'a' + tid, title: 'Р', who: R429.id }, { id: 'b' + tid, title: 'Р', who: R502.id }, { id: 'c' + tid, title: 'Р', who: R403.id }] } }] });
  ok(Date.now() - t0 < 3000, 'saving does not wait for Telegram (' + (Date.now() - t0) + ' ms)');
  await waitSent(S => S.filter(x => x.to === R502.id).length >= 1 && S.filter(x => x.to === R429.id).length >= 1 && S.filter(x => x.to === E.id).length >= 7, 60000); await settle(3000);
  const L = log().slice(mark).filter(x => x.m === 'sendMessage');
  const e = L.filter(x => x.b.chat_id === E.id && x.ok);
  ok(e.length === 7, 'all 7 messages to one person delivered (' + e.length + ')');
  const gaps = e.slice(1).map((x, i) => x.t - e[i].t);
  ok(gaps.every(g => g >= 1000), 'at least 1 s between messages to one person (min ' + Math.min(...gaps) + ' ms)');
  const ts = L.map(x => x.t); ok(Math.max(...ts.map(t => ts.filter(u => u >= t && u < t + 1000).length)) <= 30, 'never more than 30 sends per second overall');
  const a = L.filter(x => x.b.chat_id === R429.id);
  ok(a.length === 2 && a[0].code === 429 && a[1].ok && a[1].t - a[0].t >= 2000, '"Too Many Requests": retried after retry_after and delivered');
  const c = L.filter(x => x.b.chat_id === R502.id);
  ok(c.length === 2 && c[0].code === 502 && c[1].ok, 'Telegram outage: retried with backoff and delivered');
  const d = L.filter(x => x.b.chat_id === R403.id);
  ok(d.length === 1 && d[0].code === 403, 'blocked bot: no retries');
  const m2 = log().length; const t2 = rid('t');
  await call(O, 'sync', { tasks: [{ id: t2, board: b.id, prev: null, next: { id: t2, board: b.id, stage: b.stages[0].id, title: 'Ще', who: R403.id } }] }); await settle(3000);
  ok(!log().slice(m2).some(x => x.b && x.b.chat_id === R403.id), 'nothing more is queued for someone who blocked the bot');
};
