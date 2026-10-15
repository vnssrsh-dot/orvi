// Security, permissions, data integrity and account endpoints.
const { APP, initData, call, hook, rid, user, ok, sharedBoard, start } = require('./lib');
module.exports = async function () {
  console.log('API: security & permissions');
  ok((await fetch(APP + '/setup?secret=wrong')).status === 403, 'setup rejects a wrong secret');
  const A = user('Анна', 'anna'), B = user('Богдан', 'bohdan'), C = user('Віра', 'vira');
  const forged = initData(A).replace(/hash=[0-9a-f]+/, 'hash=' + '0'.repeat(64));
  ok((await fetch(APP + '/api/state', { headers: { 'x-init-data': forged } })).status === 401, 'forged Telegram signature is rejected');
  for (const u of [A, B, C]) await start(u);
  const b = await sharedBoard(A, 'Тест');
  ok((await call(B, 'join', { code: b.links.editor })).role === 'editor', 'join by editor link');
  ok((await call(C, 'join', { code: b.links.viewer })).role === 'viewer', 'join by viewer link');

  console.log('API: input sanitizing');
  const st = b.stages;
  await call(B, 'sync', { boards: [{ id: b.id, prev: { tint: '' }, next: { type: 'shared', name: '<img src=x onerror=alert(1)>', icon: 'x"><script>', tint: '" onmouseover="alert(1)', stages: [...st, { id: 's"bad', name: 'x', kind: '"><b>' }], deletedAt: null } }] });
  const bd = (await call(A, 'state')).boards.find(x => x.id === b.id).data;
  ok(bd.tint === '' && bd.icon === 'folder' && bd.stages.every(s => /^[A-Za-z0-9_-]+$/.test(s.id) && ['idea', 'todo', 'prog', 'rev', 'done'].includes(s.kind)), 'unsafe tint/icon/stage values from an editor are dropped');
  ok(bd.name.includes('<img'), 'plain text keeps its content (the app escapes it when showing)');
  const tid = rid('t');
  await call(A, 'sync', { tasks: [{ id: tid, board: b.id, prev: null, next: { id: tid, board: b.id, stage: st[0].id, title: 't', due: '"><x', time: '"><x', pr: '<x>', who: A.id, files: [{ n: 'a' }], evil: 1 } }] });
  const td = (await call(A, 'state')).tasks.find(t => t.id === tid).data;
  ok(td.due === null && td.time === '' && td.pr === 'med' && !('files' in td) && !('evil' in td), 'task fields are validated, unknown fields dropped');

  console.log('API: roles');
  const viewerWrite = await call(C, 'sync', { tasks: [{ id: rid('t'), board: b.id, prev: null, next: { title: 'hack', stage: st[0].id } }] });
  ok(viewerWrite.errors && viewerWrite.errors[0].error === 'forbidden', 'viewer cannot write through the API');
  ok((await call(B, 'invite', { board: b.id, username: C.username, role: 'editor' })).error === 'forbidden', 'only the owner can invite');
  ok((await call(B, 'role', { board: b.id, user: C.id, role: 'owner' })).error === 'forbidden', 'only the owner can change roles');
  ok((await call(A, 'leave', { board: b.id })).error === 'last_owner', 'the only owner cannot leave');
  ok((await call(B, 'sync', { delBoards: [b.id] })).errors[0].error === 'forbidden', 'only the owner can delete a board');

  console.log('API: concurrent edits & deletions');
  const t2 = rid('t'); const base = { id: t2, board: b.id, stage: st[0].id, title: 'Задача', desc: '', who: A.id, comments: [], subs: [] };
  await call(A, 'sync', { tasks: [{ id: t2, board: b.id, prev: null, next: base }] });
  await call(A, 'sync', { tasks: [{ id: t2, board: b.id, prev: base, next: { ...base, desc: 'Опис Анни' } }] });
  await call(B, 'sync', { tasks: [{ id: t2, board: b.id, prev: base, next: { ...base, comments: [{ id: 'c1', u: B.id, t: 'Коментар', ts: 1 }], subs: [{ id: 's1', title: 'Підзадача', who: B.id }] } }] });
  const merged = (await call(A, 'state')).tasks.find(t => t.id === t2).data;
  ok(merged.desc === 'Опис Анни' && merged.comments.length === 1 && merged.subs.length === 1, 'edits of different fields by two people are both kept');
  await call(A, 'sync', { delTasks: [t2] });
  const stale = await call(B, 'sync', { tasks: [{ id: t2, board: b.id, prev: base, next: { ...base, title: 'Стара правка' } }] });
  ok(stale.errors && stale.errors[0].error === 'gone' && !(await call(A, 'state')).tasks.some(t => t.id === t2), 'a stale edit does not resurrect a deleted task');

  console.log('API: people who left stay named');
  const t3 = rid('t');
  await call(A, 'sync', { tasks: [{ id: t3, board: b.id, prev: null, next: { id: t3, board: b.id, stage: st[0].id, title: 'x', who: B.id, comments: [{ id: 'c9', u: B.id, t: 'hi', ts: 1 }] } }] });
  await call(A, 'role', { board: b.id, user: B.id, role: 'remove' });
  ok((await call(A, 'state')).users.some(u => u.id === B.id), 'a removed member is still listed for their tasks and comments');
  ok(!(await call(B, 'state')).boards.some(x => x.id === b.id), 'the removed member loses access');

  console.log('API: links');
  ok((await call(C, 'join', { code: 'join_vi_nope' })).error === 'invalid', 'unknown link is rejected');
  ok((await call(C, 'join', { code: b.links.viewer })).already === true, 'joining again does not spend a link use');
  const fresh = await call(A, 'link/new', { board: b.id, role: 'viewer' });
  const D = user('Дана', 'dana'); await start(D);
  ok((await call(D, 'join', { code: b.links.viewer })).error === 'invalid', 'a reissued link invalidates the old one');
  ok((await call(D, 'join', { code: fresh.code })).ok, 'the new link works');

  console.log('API: presence');
  ok((await call(D, 'presence', { task: 'nope', peek: true })).error === 'forbidden', 'presence of foreign tasks is not readable');

  console.log('API: timezone & reset');
  await fetch(APP + '/api/state', { headers: { 'x-init-data': initData(D), 'x-tz': '-300' } });
  ok((await call(D, 'state')).prefs.tz === -300, 'timezone is updated from any request (travel / daylight saving)');
  const own = await sharedBoard(D, 'Моя');
  ok((await call(D, 'reset', {})).ok && (await call(D, 'state')).boards.length === 0 && (await call(A, 'state')).boards.some(x => x.id === b.id), 'reset removes own boards and leaves others intact');
  void own; void hook;
};
