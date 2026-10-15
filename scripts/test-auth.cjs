const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextRequest } = require('next/server');
if (!globalThis.crypto) globalThis.crypto = require('node:crypto').webcrypto;

function loadTS(file) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', compiled)(require, exports);
  return exports;
}

test('Both access codes ignore case and edge spaces, and issued cookies unlock the protected app', async () => {
  const saved = Object.fromEntries(['AUTH_PASSWORD', 'AUTH_PASSWORD_SECONDARY', 'AUTH_SECRET'].map((name) => [name, process.env[name]]));
  Object.assign(process.env, { AUTH_PASSWORD: ' OriginalPass ', AUTH_PASSWORD_SECONDARY: 'NewPass', AUTH_SECRET: 'test-only-secret' });
  const api = loadTS('app/api/auth/route.ts');
  const { middleware } = loadTS('middleware.ts');
  const req = (body) => new Request('https://data.f3bedrock.com/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  try {
    for (const password of ['originalpass', 'ORIGINALPASS', '  oRiGiNaLpAsS  ', 'newpass', 'NEWPASS', '  NeWpAsS  ']) {
      const response = await api.POST(req(JSON.stringify({ password })));
      assert.equal(response.status, 200);
      const cookie = response.headers.get('set-cookie');
      assert.ok(cookie.includes('HttpOnly'));
      const unlocked = await middleware(new NextRequest('https://data.f3bedrock.com/', { headers: { cookie: cookie.split(';')[0] } }));
      assert.equal(unlocked.status, 200);
      assert.equal(unlocked.headers.get('x-middleware-next'), '1');
    }
    for (const body of [{ password: 'wrong' }, { password: '' }, { password: '   ' }, { password: 123 }, {}, null]) assert.equal((await api.POST(req(JSON.stringify(body)))).status, 401);
    assert.equal((await api.POST(req('{'))).status, 400);
    assert.equal((await middleware(new NextRequest('https://data.f3bedrock.com/'))).status, 307);
    delete process.env.AUTH_SECRET;
    assert.equal((await api.POST(req(JSON.stringify({ password: 'newpass' })))).status, 500);
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
