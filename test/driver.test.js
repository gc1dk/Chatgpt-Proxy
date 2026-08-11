// Offline driver tests against a mock ChatGPT page (no real network needed).
// Run: node --test test/driver.test.js
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const mock = require('./mock-chatgpt');

const { ChatGPTDriver, RESET_MARKER } = require('../chatgpt');

let port;
let driver;
let profileDir;

before(async () => {
  port = await mock.start(0);
  process.env.HOME_URL = `http://127.0.0.1:${port}/`;
  profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-driver-test-'));
});

after(async () => {
  if (driver) await driver.dispose().catch(() => {});
  delete process.env.HOME_URL;
  fs.rmSync(profileDir, { recursive: true, force: true });
  await mock.stop().catch(() => {});
});

async function makeDriver(overrides = {}) {
  if (driver) await driver.dispose().catch(() => {});
  driver = new ChatGPTDriver({
    headed: false,
    profileDir,
    timeoutMs: 20000,
    ...overrides,
  });
  await driver.start();
  return driver;
}

test('start(): page reaches composer', async () => {
  await makeDriver();
  assert.equal(driver.ready, true);
  const s = await driver.status();
  assert.equal(s.composerReady, true);
  assert.equal(s.gated, false);
});

test('submit(): returns mock reply text', async () => {
  await makeDriver();
  const result = await driver.submit({ chatId: 'c1', message: 'hello' });
  assert.equal(result.error, null);
  assert.ok(result.text.includes("I'm the mock reply"), `got: ${result.text}`);
});

test('submit(): streams deltas via onDelta', async () => {
  await makeDriver();
  const deltas = [];
  const result = await driver.submit({
    chatId: 'c2',
    message: 'stream me',
    onDelta: (d) => deltas.push(d),
  });
  assert.equal(result.error, null);
  assert.ok(deltas.length >= 3, `expected >=3 deltas, got ${deltas.length}`);
  assert.ok(deltas.includes(RESET_MARKER) === false);
  const joined = deltas.join('');
  assert.ok(joined.includes('mock'), `deltas: ${joined}`);
});

test('getHistory(): captures user + assistant messages', async () => {
  await makeDriver();
  await driver.submit({ chatId: 'c3', message: 'history please' });
  const history = await driver.getHistory('c3');
  assert.ok(history.length >= 2, `history: ${JSON.stringify(history)}`);
  const roles = history.map((m) => m.role);
  assert.ok(roles.includes('user') && roles.includes('assistant'));
  assert.ok(history.some((m) => m.role === 'user' && m.text.includes('history please')));
});

test('submit(): throws cleanly for oversized messages', async () => {
  await makeDriver();
  const big = 'x'.repeat(5000001);
  await assert.rejects(
    () => driver.submit({ chatId: 'c4', message: big }),
    /too large/
  );
});

test('submit(): handles a large story (~1 MB)', async () => {
  await makeDriver();
  const story =
    'Once upon a time, there was a very long story. '.repeat(20000); // ~1 MB
  const result = await driver.submit({ chatId: 'c4b', message: story });
  assert.equal(result.error, null, 'large story should get a reply, got: ' + JSON.stringify(result));
  const history = await driver.getHistory('c4b');
  const userMsgs = history.filter((m) => m.role === 'user');
  assert.ok(userMsgs.length > 0);
  assert.equal(userMsgs[userMsgs.length - 1].text.length, story.trim().length, 'full story should be present');
});

test('submit(): same chat accumulates turns (baseline grows)', async () => {
  await makeDriver();
  await driver.submit({ chatId: 'c5', message: 'turn one' });
  const r2 = await driver.submit({ chatId: 'c5', message: 'turn two' });
  assert.equal(r2.error, null);
  const history = await driver.getHistory('c5');
  const userTexts = history.filter((m) => m.role === 'user').map((m) => m.text);
  assert.ok(userTexts.includes('turn one') && userTexts.includes('turn two'));
});

test('two chats get independent pages', async () => {
  await makeDriver();
  await driver.submit({ chatId: 'c6a', message: 'first chat' });
  await driver.submit({ chatId: 'c6b', message: 'second chat' });
  const a = await driver.getHistory('c6a');
  const b = await driver.getHistory('c6b');
  const aUsers = a.filter((m) => m.role === 'user').map((m) => m.text);
  const bUsers = b.filter((m) => m.role === 'user').map((m) => m.text);
  assert.ok(aUsers.includes('first chat') && !aUsers.includes('second chat'));
  assert.ok(bUsers.includes('second chat') && !bUsers.includes('first chat'));
});
