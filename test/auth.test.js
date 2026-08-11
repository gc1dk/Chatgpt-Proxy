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

function rawReq(path, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: serverPort, path, headers, method }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve({ status: res.statusCode, raw: buf }));
    });
    req.on('error', reject);
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

test('API with token query param returns 200', async () => {
  const r = await rawReq('/api/status?token=' + TOKEN);
  assert.equal(r.status, 200);
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