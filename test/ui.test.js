// UI smoke test: loads the real UI (index.html/app.js) and exercises visible features.
// Run: node --test test/ui.test.js
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const net = require('node:net');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const mock = require('./mock-chatgpt');

let mockPort;
let serverPort;
let child;
let base;
let tmpDir;
let browser;
let page;

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

function waitForServer() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 30000;
    const tick = async () => {
      if (Date.now() > deadline) return reject(new Error('server did not start'));
      try {
        const r = await fetch(`${base}/api/status`);
        if (r.ok) return resolve();
      } catch {}
      setTimeout(tick, 500);
    };
    tick();
  });
}

before(async () => {
  mockPort = await mock.start(0);
  serverPort = await freePort();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-ui-test-'));
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
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  await waitForServer();
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(base, { waitUntil: 'networkidle' });
});

after(async () => {
  if (browser) await browser.close().catch(() => {});
  if (child && !child.killed) child.kill();
  await new Promise((r) => setTimeout(r, 500));
  fs.rmSync(tmpDir, { recursive: true, force: true });
  await mock.stop().catch(() => {});
});

test('landing: welcome shown, tabs visible', async () => {
  const welcome = await page.locator('#welcome').isVisible();
  assert.ok(welcome, 'welcome should be visible');
  const chatTab = await page.locator('#tab-chat').isVisible();
  const codeTab = await page.locator('#tab-code').isVisible();
  assert.ok(chatTab && codeTab, 'tabs should be visible');
});

test('new chat button creates a chat and focuses composer', async () => {
  await page.locator('.new-chat').click();
  await page.waitForTimeout(500);
  const composer = await page.locator('#input').isVisible();
  assert.ok(composer, 'composer should be visible');
});

test('send a message → user + assistant bubbles render (and complete)', async () => {
  await page.locator('#input').fill('ui test message');
  await page.locator('#send').click();
  await page.waitForFunction(
    () => !document.querySelector('.msg.assistant.streaming'),
    null,
    { timeout: 20000 }
  );
  const userText = await page.locator('.msg.user').first().textContent();
  assert.ok(userText.includes('ui test message'), 'user bubble should show the message');
  const assistantText = await page.locator('.msg.assistant .markdown').first().textContent();
  assert.ok(assistantText.includes('mock'), 'assistant bubble should contain the mock reply');
  const streaming = await page.locator('.msg.assistant.streaming').count();
  assert.equal(streaming, 0, 'no bubble should remain streaming after done');
});

test('code tab badge + artifact appears after a code reply', async () => {
  await page.locator('#input').fill('write a js function');
  await page.locator('#send').click();
  await page.waitForFunction(
    () => {
      const b = document.getElementById('code-tab-badge');
      return b && !b.hidden && b.textContent !== '0';
    },
    null,
    { timeout: 20000 }
  );
  const badge = await page.locator('#code-tab-badge').textContent();
  assert.equal(badge, '1', 'badge should show exactly one artifact (badge=' + badge + ')');
});

test('boot overlay hides once ready', async () => {
  await page.waitForFunction(() => document.getElementById('boot-overlay').hidden, null, { timeout: 15000 });
  assert.ok(true, 'boot overlay should hide after the app connects');
});

test('code tab shows live preview + editor', async () => {
  await page.locator('#tab-code').click();
  await page.waitForTimeout(400);
  const editor = await page.locator('#code-editor').isVisible();
  const preview = await page.locator('.code-preview-wrap').count();
  const empty = await page.locator('#code-preview-empty').isVisible();
  assert.ok(editor, 'code editor should be visible');
  assert.equal(preview, 1, 'preview wrap should exist');
  assert.ok(empty, 'empty-preview hint should show when no artifact is loaded');
});

test('settings modal opens and closes', async () => {
  await page.locator('#tab-chat').click();
  await page.locator('#settings-btn').click();
  await page.waitForTimeout(300);
  const modal = await page.locator('#settings-modal').isVisible();
  assert.ok(modal, 'settings modal should open');
  await page.locator('#settings-close').click();
  await page.waitForTimeout(200);
  const closed = await page.locator('#settings-modal').isHidden();
  assert.ok(closed, 'settings modal should close');
});

test('theme toggle switches data-theme', async () => {
  const before = await page.locator('html').getAttribute('data-theme');
  await page.locator('#theme-toggle').click();
  await page.waitForTimeout(200);
  const after = await page.locator('html').getAttribute('data-theme');
  assert.notEqual(before, after, 'theme should toggle');
});