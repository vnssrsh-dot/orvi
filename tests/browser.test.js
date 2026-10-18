// The Mini App in a real browser, several people at once.
const { chromium } = require('playwright-core');
const { APP, initData, call, rid, user, ok, sleep, settle, sent, sharedBoard, start } = require('./lib');
module.exports = async function () {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = [];
  const open = async (u, query = '') => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } }); const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(u.first_name + ': ' + e.message));
    await p.route('https://telegram.org/js/telegram-web-app.js', r => r.fulfill({ contentType: 'application/javascript', body: `window.Telegram={WebApp:{initData:${JSON.stringify(initData(u))},initDataUnsafe:{user:${JSON.stringify(u)}},colorScheme:'light',ready(){},expand(){},disableVerticalSwipes(){},setHeaderColor(){},setBackgroundColor(){},close(){window.__closed=1}}}` }));
    await p.goto(APP + '/' + query); await p.waitForSelector('html.orvi-ready'); await sleep(400); return p;
  };
  const click = async (p, s) => { await p.click(s, { timeout: 5000 }); await sleep(150); };
  try {
    const A = user('Анна', 'annab'), B = user('Богдан', 'bohdanb');
    for (const u of [A, B]) await start(u);

    console.log('App: first launch & privacy consent');
    let pa = await open(A);
    ok(await pa.evaluate(() => !!document.querySelector('.consent .consent-card')), 'first launch shows the privacy consent dialog');
    await click(pa, '[data-a=consentRead]');
    ok(await pa.evaluate(() => document.querySelector('.consent.full') && /Які дані ми отримуємо/.test(document.querySelector('.consent.full').innerText)), 'the policy can be read from the dialog');
    await click(pa, '.consent.full [data-a=consentBack]');
    ok(await pa.evaluate(() => !!document.querySelector('.consent-card')), 'and closed back to the dialog');
    await click(pa, '[data-a=acceptPrivacy]'); await sleep(1500);
    ok(await pa.evaluate(() => !document.querySelector('.consent') && !!document.querySelector('.onb') && document.querySelector('.hello h1').textContent === 'Привіт, Анна!'), 'after accepting: empty account with onboarding and the Telegram name');
    pa = await open(A);
    ok(await pa.evaluate(() => !document.querySelector('.consent')), 'consent is remembered on the next launch');
    await click(pa, '[data-a=push][data-v=settings]'); await click(pa, '[data-a=push][data-v=privacy]');
    ok(await pa.evaluate(() => /Політика конфіденційності/.test(document.querySelector('.h1').textContent)), 'settings → privacy policy opens');
    await click(pa, '.scroll [data-a=back]'); ok(await pa.evaluate(() => /Налаштування/.test(document.querySelector('.h1').textContent)), 'and the back button returns to settings');
    const pb0 = await open(B); await click(pb0, '[data-a=declinePrivacy]'); await sleep(2200);
    ok(await pb0.evaluate(() => window.__closed === 1 && !!document.querySelector('.consent .err')), 'declining explains why and closes the app');
    await pb0.close();

    console.log('App: board, stage, task, invite');
    await click(pa, '[data-a=tab][data-t=shared]'); await click(pa, '[data-a=tab][data-t=shared]');
    await click(pa, '.empty-st .btn'); await pa.fill('#nb-name', 'Команда'); await click(pa, '[data-a=createBoard]');
    await click(pa, '.empty-st .btn'); await click(pa, '[data-a=stageSuggest][data-n=Плани]'); await click(pa, '[data-a=createStage]');
    await pa.fill('input[id^=add-]', 'Підготувати звіт'); await pa.press('input[id^=add-]', 'Enter'); await sleep(1500);
    ok(await pa.evaluate(() => T.some(t => t.title === 'Підготувати звіт') && document.activeElement.id.startsWith('add-')), 'Enter in the add field adds a task and keeps the field focused');
    ok(await pa.evaluate(() => getComputedStyle(document.querySelector('.add-row .add-go')).display === 'none'), 'the add arrow is hidden while the field is empty');
    await pa.fill('input[id^=add-]', 'Чернетка'); await click(pa, '.add-row .add-go'); await sleep(300);
    ok(await pa.evaluate(() => T.some(t => t.title === 'Чернетка') && document.activeElement.id.startsWith('add-')), 'the add arrow button adds a task too');
    await pa.evaluate(() => { const i = T.findIndex(t => t.title === 'Чернетка'); T.splice(i, 1); render(); }); await sleep(1500);
    await click(pa, '[data-a=sheet][data-s=members]'); await pa.fill('#inv-u', B.username); await click(pa, 'form[data-f=inviteUser] .btn'); await sleep(800);
    ok(await pa.$eval('.sheet-body', x => /Очікує відповіді · роль: редактор/.test(x.innerText)), 'invite by @username shows as pending with the role');
    await settle();
    const inv = sent().find(m => m.to === B.id && /запрошує/.test(m.text));
    ok(!!inv && !!inv.btn.web_app, 'the bot sent B an invite with an open button');
    await click(pa, '[data-a=close]');

    console.log('App: accepting from the bot button');
    const pb = await open(B, '?startapp=' + new URL(inv.btn.web_app.url).searchParams.get('startapp'));
    await click(pb, '[data-a=acceptPrivacy]'); await sleep(800);
    ok(await pb.evaluate(() => S.sheet && S.sheet.type === 'invite'), 'the invitation opens right after accepting the policy');
    await click(pb, '.sheet [data-a=acceptInv]'); await sleep(1000);
    ok(await pb.evaluate(() => topE() && topE().v === 'board' && T.some(t => t.title === 'Підготувати звіт')), 'B joined and sees the board and task');
    ok(await pb.$eval('.my-role', x => /Редактор/.test(x.innerText)), 'B sees their role');

    console.log('App: someone is editing');
    const tid = await pa.evaluate(() => T[0].id);
    await pa.evaluate(id => { S.tab = 'home'; S.stacks.home = [{ v: 'task', id }]; render(); }, tid);
    await pb.evaluate(id => { S.tab = 'home'; S.stacks.home = [{ v: 'task', id }]; render(); }, tid); await sleep(400);
    await pb.click('.desc'); await pb.keyboard.type('Правка Богдана', { delay: 15 });
    await pa.waitForFunction(() => /Богдан зараз редагує опис/.test(document.querySelector('.presence').innerText), null, { timeout: 12000 }).catch(() => {});
    ok(/Богдан зараз редагує опис/.test(await pa.$eval('.presence', x => x.innerText)), 'A sees that B is editing the description');
    await pa.click('.desc'); await sleep(300);
    ok(await pa.$eval('.pres', x => x.classList.contains('warn')), 'editing the same field shows a warning');
    await pa.evaluate(() => document.activeElement.blur()); await sleep(2500);
    ok((await call(A, 'state')).tasks.find(t => t.id === tid).data.desc.includes('Правка Богдана'), 'typed text is saved shortly after typing stops');
    const typed = await pb.$eval('.desc', x => x.value); await sleep(16500);
    ok((await pb.$eval('.desc', x => x.value)) === typed, 'background refresh never replaces text while typing');

    console.log('App: removed member, HTML text, reset');
    await pa.evaluate(() => { B[0].name = '<img src=x onerror="window.__xss=1">'; render(); }); await sleep(1500);
    const pb2 = await open(B); ok(await pb2.evaluate(() => window.__xss === undefined), 'HTML in names is shown as text, never executed');
    const bid = await pa.evaluate(() => B[0].id);
    await pa.evaluate(id => { T[0].who = Object.keys(U).find(k => U[k].f === 'Богдан'); render(); }, bid); await sleep(1500);
    await call(A, 'role', { board: bid, user: B.id, role: 'remove' });
    const pa2 = await open(A, '?startapp=task_' + tid);
    ok(await pa2.evaluate(() => !!document.querySelector('.t-title')), 'a task assigned to a removed member still opens');
    await pa2.evaluate(() => { S.sheet = null; S.tab = 'home'; S.stacks.home = [{ v: 'settings' }]; render(); });
    await click(pa2, '[data-a=sheet][data-s=resetData]'); await click(pa2, '.sheet [data-a=resetData]'); await sleep(1500);
    ok(await pa2.evaluate(() => B.length === 0 && !!document.querySelector('.onb')), '"Почати спочатку" clears the account');
    ok(errors.length === 0, 'no JavaScript errors in the app' + (errors.length ? ': ' + errors.join(' | ') : ''));
    void rid; void sharedBoard;
  } finally { await browser.close(); }
};
