// One command for everything: starts a fake Telegram and the Worker locally (D1 + queue simulated),
// runs every suite, stops the servers and exits non-zero if anything failed.
const { spawn } = require('child_process'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..'), TMP = path.join(__dirname, '.tmp');
const APP_PORT = 8799, TG_PORT = 9912;
process.env.APP = `http://127.0.0.1:${APP_PORT}`; process.env.TGLOG = path.join(TMP, 'telegram.log');
const lib = require('./lib');

fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
const cfg = fs.readFileSync(path.join(ROOT, 'server/wrangler.toml'), 'utf8')
  .replace('main = "src/index.js"', `main = "${path.join(ROOT, 'server/src/index.js')}"`)
  .replace('directory = "../docs"', `directory = "${path.join(ROOT, 'docs')}"`);
fs.writeFileSync(path.join(TMP, 'wrangler.toml'), cfg);
fs.writeFileSync(path.join(TMP, '.dev.vars'), `BOT_TOKEN="123456:TEST_TOKEN_FOR_LOCAL_DEV"\nWEBHOOK_SECRET="local_hook_secret"\nTG_API="http://127.0.0.1:${TG_PORT}"\nCHANGE_DELAY="3"\n`);

const procs = [];
const run = (cmd, args, logName) => { const out = fs.openSync(path.join(TMP, logName), 'a'); const p = spawn(cmd, args, { cwd: TMP, stdio: ['ignore', out, out], detached: true }); procs.push(p); return p; };
const stop = () => procs.forEach(p => { try { process.kill(-p.pid, 'SIGTERM'); } catch (e) {} });
process.on('exit', stop); process.on('SIGINT', () => process.exit(130));

(async () => {
  run(process.execPath, [path.join(__dirname, 'tg-stub.js'), String(TG_PORT), process.env.TGLOG], 'stub.out');
  run(path.join(__dirname, 'node_modules/.bin/wrangler'), ['dev', '--config', path.join(TMP, 'wrangler.toml'), '--local', '--port', String(APP_PORT), '--persist-to', path.join(TMP, 'state'), '--test-scheduled'], 'worker.out');
  let up = false;
  for (let i = 0; i < 90 && !up; i++) { await lib.sleep(1000); up = await fetch(process.env.APP + '/').then(r => r.ok).catch(() => false); }
  if (!up) { console.log('Worker did not start:\n' + fs.readFileSync(path.join(TMP, 'worker.out'), 'utf8').slice(-3000)); process.exit(1); }
  const setup = await fetch(process.env.APP + '/setup?secret=local_hook_secret'); lib.ok(setup.ok, 'setup endpoint connects the bot');

  const only = process.argv[2];
  for (const name of ['api', 'notifications', 'queue', 'browser']) {
    if (only && only !== name) continue;
    try { await require('./' + name + '.test.js')(); }
    catch (e) { lib.ok(false, `${name} suite crashed: ${e && e.stack || e}`); }
  }
  const { pass, fail, failures } = lib.results;
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('Failed:\n - ' + failures.join('\n - ')); console.log('\nWorker log tail:\n' + fs.readFileSync(path.join(TMP, 'worker.out'), 'utf8').slice(-2000)); }
  stop(); process.exit(fail ? 1 : 0);
})();
