// Auth token tests: boots the server with AUTH_TOKEN set and verifies 401/200 behavior.
// Run: node --test test/auth.test.js
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const TOKEN = 'secret-test-token';
let serverPort;
let child;
let base;
let tmpDir;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function rawReq(path, headers = {}, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const h = Object.assign({ 'Content-Length': body ? Buffer.byteLength(body) : 0 }, headers);
    const req = http.request({ host: '127.0.0.1', port: serverPort, path, headers: h, method }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve({ status: res.statusCode, raw: buf }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

before(async () => {
  serverPort = await freePort();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-auth-test-'));
  base = `http://127.0.0.1:${serverPort}`;
  child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      AUTH_TOKEN: TOKEN,
      NO_BROWSER: '1',
      PORT: String(serverPort),
      PROFILE: path.join(tmpDir, 'profile'),
      CHATS_FILE: path.join(tmpDir, 'chats.json'),
      SETTINGS_FILE: path.join(tmpDir, 'settings.json'),
      STATE_FILE: path.join(tmpDir, 'state.json'),
      CLIENTS_FILE: path.join(tmpDir, 'clients.json'),
      USERS_FILE: path.join(tmpDir, 'users.json'),
      SELECTORS_FILE: path.join(tmpDir, 'selectors.json'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (c) => (out += c));
  child.stderr.on('data', (c) => (out += c));
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const r = await rawReq('/api/status');
      if (r.status === 401 || r.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start. output:\n' + out);
});

after(async () => {
  if (child && !child.killed) child.kill();
  await new Promise((r) => setTimeout(r, 500));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('API without token returns 401', async () => {
  const r = await rawReq('/api/status');
  assert.equal(r.status, 401);
});

test('API with Bearer token returns 200', async () => {
  const r = await rawReq('/api/status', { Authorization: 'Bearer ' + TOKEN });
  assert.equal(r.status, 200);
  assert.ok(r.raw.includes('ready'));
});

test('API with wrong token returns 401', async () => {
  const r = await rawReq('/api/status', { Authorization: 'Bearer wrong' });
  assert.equal(r.status, 401);
});

test('token query param is no longer accepted (security)', async () => {
  const r = await rawReq('/api/status?token=' + TOKEN);
  assert.equal(r.status, 401);
});

test('per-client register + token flow', async () => {
  const reg = await rawReq(
    '/api/register',
    { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    'POST',
    JSON.stringify({ clientId: 'test-client-1' })
  );
  assert.equal(reg.status, 200);
  const body = JSON.parse(reg.raw);
  assert.ok(body.clientToken);
  const withClient = await rawReq('/api/status', {
    'X-Client-Id': 'test-client-1',
    'X-Client-Token': body.clientToken,
  });
  assert.equal(withClient.status, 200);
  const withoutToken = await rawReq('/api/status', { 'X-Client-Id': 'test-client-1' });
  assert.equal(withoutToken.status, 401);
});

test('register without master token returns 401', async () => {
  const r = await rawReq(
    '/api/register',
    { 'Content-Type': 'application/json' },
    'POST',
    JSON.stringify({ clientId: 'test-client-2' })
  );
  assert.equal(r.status, 401);
});

test('signup creates an account and returns a client token', async () => {
  const user = 'alice' + Date.now().toString().slice(-6);
  const r = await rawReq(
    '/api/signup',
    { 'Content-Type': 'application/json' },
    'POST',
    JSON.stringify({ username: user, password: 'hunter2-secret' })
  );
  assert.equal(r.status, 200);
  const body = JSON.parse(r.raw);
  assert.equal(body.clientId, 'u-' + user);
  assert.ok(body.clientToken);
  const withToken = await rawReq('/api/status', {
    'X-Client-Id': body.clientId,
    'X-Client-Token': body.clientToken,
  });
  assert.equal(withToken.status, 200);
});

test('duplicate signup returns 409', async () => {
  const user = 'bob' + Date.now().toString().slice(-6);
  const mk = () =>
    rawReq(
      '/api/signup',
      { 'Content-Type': 'application/json' },
      'POST',
      JSON.stringify({ username: user, password: 'hunter2-secret' })
    );
  assert.equal((await mk()).status, 200);
  assert.equal((await mk()).status, 409);
});

test('login with wrong password returns 401', async () => {
  const user = 'carol' + Date.now().toString().slice(-6);
  await rawReq(
    '/api/signup',
    { 'Content-Type': 'application/json' },
    'POST',
    JSON.stringify({ username: user, password: 'hunter2-secret' })
  );
  const bad = await rawReq(
    '/api/login',
    { 'Content-Type': 'application/json' },
    'POST',
    JSON.stringify({ username: user, password: 'wrong-password' })
  );
  assert.equal(bad.status, 401);
});

test('login issues a fresh token; accounts isolate chats', async () => {
  const userA = 'dave' + Date.now().toString().slice(-6);
  const userB = 'erin' + Date.now().toString().slice(-6);
  for (const u of [userA, userB]) {
    await rawReq(
      '/api/signup',
      { 'Content-Type': 'application/json' },
      'POST',
      JSON.stringify({ username: u, password: 'hunter2-secret' })
    );
  }
  const loginA = await rawReq(
    '/api/login',
    { 'Content-Type': 'application/json' },
    'POST',
    JSON.stringify({ username: userA, password: 'hunter2-secret' })
  );
  assert.equal(loginA.status, 200);
  const a = JSON.parse(loginA.raw);
  const created = await rawReq(
    '/api/new-chat',
    { 'X-Client-Id': a.clientId, 'X-Client-Token': a.clientToken, 'Content-Type': 'application/json' },
    'POST',
    JSON.stringify({})
  );
  assert.equal(created.status, 200);
  const loginB = await rawReq(
    '/api/login',
    { 'Content-Type': 'application/json' },
    'POST',
    JSON.stringify({ username: userB, password: 'hunter2-secret' })
  );
  const b = JSON.parse(loginB.raw);
  const listB = await rawReq('/api/chats', { 'X-Client-Id': b.clientId, 'X-Client-Token': b.clientToken });
  const chatsB = JSON.parse(listB.raw).chats || [];
  assert.ok(!chatsB.some((c) => c.id === JSON.parse(created.raw).id), 'account B must not see account A chats');
});

test('static UI page is served without token', async () => {
  const r = await rawReq('/');
  assert.equal(r.status, 200);
  assert.ok(r.raw.includes('<html') || r.raw.includes('<!doctype'));
});

test('POST endpoints also require the token', async () => {
  const no = await rawReq('/api/new-chat', { 'Content-Type': 'application/json' }, 'POST');
  assert.equal(no.status, 401);
  const yes = await rawReq('/api/new-chat', { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, 'POST');
  assert.equal(yes.status, 200);
});