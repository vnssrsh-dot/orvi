// Fake Telegram Bot API: records every call; chats whose id ends with 91/92/93 misbehave
// on their first sendMessage (429 / 502 / 403) so retry logic can be tested.
const http = require('http'); const fs = require('fs');
const [port, log] = [Number(process.argv[2]), process.argv[3]];
const seen = {};
http.createServer((q, r) => {
  let b = ''; q.on('data', c => b += c); q.on('end', () => {
    const body = JSON.parse(b || '{}'); const m = q.url.split('/').pop(); const id = String(body.chat_id || '');
    let resp = { ok: true, result: true };
    if (m === 'sendMessage') {
      seen[id] = (seen[id] || 0) + 1;
      if (id.endsWith('91') && seen[id] === 1) resp = { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 2 } };
      if (id.endsWith('92') && seen[id] === 1) { r.statusCode = 502; resp = { ok: false, error_code: 502, description: 'Bad Gateway' }; }
      if (id.endsWith('93')) resp = { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' };
    }
    fs.appendFileSync(log, JSON.stringify({ m, t: Date.now(), b: body, ok: resp.ok, code: resp.error_code }) + '\n');
    r.setHeader('content-type', 'application/json'); r.end(JSON.stringify(resp));
  });
}).listen(port, () => console.log('telegram stub on', port));
