// End-to-end server test: boots the real server against the mock ChatGPT page.
// Covers: status, new-chat, chat (SSE stream), history, rename, delete, settings, stop.
// Run: node --test test/server.test.js
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const mock = require('./mock-chatgpt');

let mockPort;
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

function jsonReq(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      {
        host: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...headers,
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(buf); } catch {}
          resolve({ status: res.statusCode, body: parsed, raw: buf });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Reads a full SSE response: returns array of parsed events.
function sseReq(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      {
        host: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...headers,
        },
      },
      (res) => {
        let buf = '';
        const events = [];
        res.on('data', (c) => {
          buf += c;
          let idx;
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const block = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 2);
            if (block.startsWith('data: ')) {
              try { events.push(JSON.parse(block.slice(6))); } catch {}
            }
          }
        });
        res.on('end', () => resolve({ status: res.statusCode, events }));
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

before(async () => {
  mockPort = await mock.start(0);
  serverPort = await freePort();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-server-test-'));
  base = `http://127.0.0.1:${serverPort}`;
  child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      HOME_URL: `http://127.0.0.1:${mockPort}/`,
      PORT: String(serverPort),
      NO_BROWSER: '1',
      TIMEOUT: '20000',
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
  // wait for listening
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const r = await jsonReq('GET', `${base}/api/status`);
      if (r.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start. output:\n' + out);
});

after(async () => {
  if (child && !child.killed) child.kill();
  await new Promise((r) => setTimeout(r, 500));
  fs.rmSync(tmpDir, { recursive: true, force: true });
  await mock.stop().catch(() => {});
});

const cid = () => 'x-client-' + Math.random().toString(36).slice(2, 10);

test('GET /api/status returns server info', async () => {
  const r = await jsonReq('GET', `${base}/api/status`);
  assert.equal(r.status, 200);
  assert.equal(typeof r.body.ready, 'boolean');
  assert.ok(r.body.port === serverPort);
  assert.equal(typeof r.body.chatCount, 'number');
});

test('POST /api/new-chat creates a chat', async () => {
  const r = await jsonReq('POST', `${base}/api/new-chat`, {}, { 'X-Client-Id': cid() });
  assert.equal(r.status, 200);
  assert.ok(r.body.id);
});

test('POST /api/chat streams a reply end-to-end (SSE)', async () => {
  const client = cid();
  const created = await jsonReq('POST', `${base}/api/new-chat`, {}, { 'X-Client-Id': client });
  const chatId = created.body.id;
  const r = await sseReq('POST', `${base}/api/chat`, { message: 'hello server', chatId }, { 'X-Client-Id': client });
  assert.equal(r.status, 200);
  const types = r.events.map((e) => e.type);
  assert.ok(types.includes('delta'), 'expected delta: ' + JSON.stringify(r.events));
  assert.ok(types.includes('done'), 'expected done: ' + JSON.stringify(r.events));
  const done = r.events.find((e) => e.type === 'done');
  assert.ok(done.text.includes('mock'), 'done text: ' + done.text);
});

test('GET /api/history returns persisted messages', async () => {
  const client = cid();
  const created = await jsonReq('POST', `${base}/api/new-chat`, {}, { 'X-Client-Id': client });
  const chatId = created.body.id;
  await sseReq('POST', `${base}/api/chat`, { message: 'remember this', chatId }, { 'X-Client-Id': client });
  const r = await jsonReq('GET', `${base}/api/history?chatId=${chatId}`, undefined, { 'X-Client-Id': client });
  assert.equal(r.status, 200);
  const texts = (r.body.messages || []).map((m) => m.text);
  assert.ok(texts.includes('remember this'), 'history missing user msg: ' + JSON.stringify(r.body));
  assert.ok(r.body.messages.some((m) => m.role === 'assistant'));
});

test('POST /api/chat-rename updates the title', async () => {
  const client = cid();
  const created = await jsonReq('POST', `${base}/api/new-chat`, {}, { 'X-Client-Id': client });
  const chatId = created.body.id;
  const r = await jsonReq('POST', `${base}/api/chat-rename`, { chatId, title: 'Renamed Chat' }, { 'X-Client-Id': client });
  assert.equal(r.status, 200);
  const list = await jsonReq('GET', `${base}/api/chats`, undefined, { 'X-Client-Id': client });
  const renamed = list.body.chats.find((c) => c.id === chatId);
  assert.equal(renamed.title, 'Renamed Chat');
});

test('POST /api/chat-delete removes the chat', async () => {
  const client = cid();
  const created = await jsonReq('POST', `${base}/api/new-chat`, {}, { 'X-Client-Id': client });
  const chatId = created.body.id;
  const r = await jsonReq('POST', `${base}/api/chat-delete`, { chatId }, { 'X-Client-Id': client });
  assert.equal(r.status, 200);
  const list = await jsonReq('GET', `${base}/api/chats`, undefined, { 'X-Client-Id': client });
  assert.ok(!list.body.chats.some((c) => c.id === chatId));
});

test('chats are isolated per client (privacy)', async () => {
  const a = cid();
  const b = cid();
  const created = await jsonReq('POST', `${base}/api/new-chat`, {}, { 'X-Client-Id': a });
  const r = await jsonReq('GET', `${base}/api/chats`, undefined, { 'X-Client-Id': b });
  assert.ok(!r.body.chats.some((c) => c.id === created.body.id));
});

test('POST /api/settings saves the system prompt', async () => {
  const r = await jsonReq('POST', `${base}/api/settings`, { systemPrompt: 'You are a helpful test assistant.' });
  assert.equal(r.status, 200);
  const s = await jsonReq('GET', `${base}/api/settings`);
  assert.equal(s.body.systemPrompt, 'You are a helpful test assistant.');
});

test('POST /api/stop returns ok', async () => {
  const r = await jsonReq('POST', `${base}/api/stop`, {});
  assert.equal(r.status, 200);
});

test('POST /api/chat rejects empty messages', async () => {
  const r = await jsonReq('POST', `${base}/api/chat`, { message: '   ', chatId: null }, { 'X-Client-Id': cid() });
  assert.equal(r.status, 400);
});

test('delete of another client chat returns 404', async () => {
  const a = cid();
  const created = await jsonReq('POST', `${base}/api/new-chat`, {}, { 'X-Client-Id': a });
  const r = await jsonReq('POST', `${base}/api/chat-delete`, { chatId: created.body.id }, { 'X-Client-Id': cid() });
  assert.equal(r.status, 404);
});

test('GET /api/export returns markdown of the chat', async () => {
  const client = cid();
  const created = await jsonReq('POST', `${base}/api/new-chat`, {}, { 'X-Client-Id': client });
  const chatId = created.body.id;
  await sseReq('POST', `${base}/api/chat`, { message: 'export me', chatId }, { 'X-Client-Id': client });
  const r = await jsonReq('GET', `${base}/api/export?chatId=${chatId}`, undefined, { 'X-Client-Id': client });
  assert.equal(r.status, 200);
  assert.ok(r.raw.includes('# export me'), 'md title: ' + r.raw.slice(0, 120));
  assert.ok(r.raw.includes('export me'), 'md should include the message');
  assert.ok(r.raw.includes('## ChatGPT'), 'md should include assistant heading');
});

test('GET /api/export rejects another client chat with 404', async () => {
  const a = cid();
  const created = await jsonReq('POST', `${base}/api/new-chat`, {}, { 'X-Client-Id': a });
  const r = await jsonReq('GET', `${base}/api/export?chatId=${created.body.id}`, undefined, { 'X-Client-Id': cid() });
  assert.equal(r.status, 404);
});