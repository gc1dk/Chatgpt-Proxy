// Unit tests for the "unlimited context" rolling-summary auto-compaction.
// Loads server.js as a module (it only starts listening when run as main).
// Run: node --test test/compaction.test.js
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

let tmpDir;
let srv;

function msg(role, text) {
  return { role, text };
}

function bigMessages(count, perMsg = 700) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(msg('user', `user message ${i} ` + 'x'.repeat(perMsg)));
    out.push(msg('assistant', `assistant reply ${i} ` + 'y'.repeat(perMsg)));
  }
  return out;
}

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-compact-test-'));
  process.env.CONTEXT_BUDGET = '2000';
  process.env.MAX_PROMPT = '10000';
  process.env.PROFILE = path.join(tmpDir, 'profile');
  process.env.CHATS_FILE = path.join(tmpDir, 'chats.json');
  process.env.SETTINGS_FILE = path.join(tmpDir, 'settings.json');
  process.env.STATE_FILE = path.join(tmpDir, 'state.json');
  process.env.CLIENTS_FILE = path.join(tmpDir, 'clients.json');
  process.env.USERS_FILE = path.join(tmpDir, 'users.json');
  process.env.NO_BROWSER = '1';
  process.env.HOME_URL = 'http://127.0.0.1:59999/';
  srv = require('../server.js');
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('buildFeed combines summary + recent messages', () => {
  const chat = {
    summary: 'The user is building a home lab.',
    summarizedUpTo: 2,
    messages: [msg('user', 'a'), msg('assistant', 'b'), msg('user', 'c'), msg('assistant', 'd')],
  };
  const feed = srv.buildFeed(chat);
  assert.ok(feed.includes('home lab'), 'feed should contain summary');
  assert.ok(feed.includes('Recent conversation:'));
  assert.ok(feed.includes('User: c'), 'feed should contain only post-summary messages');
  assert.ok(!feed.includes('User: a'), 'feed must not repeat summarized messages');
});

test('buildAndCompactFeed summarizes overflow and returns a bounded feed', async () => {
  const chat = {
    id: 'compact-1',
    summary: 'Original summary: user likes python.',
    summarizedUpTo: 0,
    messages: bigMessages(6, 700), // ~6*2*700 = 8400 chars > 2000 budget
  };
  const fakeDriver = {
    submit: async ({ message }) => ({ text: 'Updated summary: user likes python and wants a discord bot.' }),
  };
  const feed = await srv.buildAndCompactFeed(chat, fakeDriver);
  assert.ok(chat.summary.includes('discord bot'), 'chat.summary should be updated');
  assert.ok(chat.summarizedUpTo > 0, 'summarizedUpTo should advance');
  assert.ok(chat.summarizedUpTo < chat.messages.length, 'recent tail should remain');
  assert.ok(feed.length <= srv.CONTEXT_BUDGET_CHARS + 400, `feed too long: ${feed.length}`);
  assert.ok(feed.startsWith('Recent conversation:'), 'after compaction only the tail is fed');
  assert.ok(Array.isArray(chat.hiddenPrompts) && chat.hiddenPrompts.length === 1, 'summary prompt recorded as hidden');
});

test('cleanMessages strips seed, memory feed and hidden summary prompts', () => {
  const seed = 'You are a pirate assistant.';
  const feed = 'Recent conversation:\nUser: hi\n\nAssistant: yo';
  const summaryPrompt = 'Update the summary with the following conversation.';
  const messages = [
    msg('user', seed),
    msg('assistant', 'OK'),
    msg('user', feed),
    msg('assistant', 'OK'),
    msg('user', summaryPrompt),
    msg('assistant', 'Updated summary: x.'),
    msg('user', 'hello'),
    msg('assistant', 'hi there'),
  ];
  const cleaned = srv.cleanMessages(messages, seed, feed, [summaryPrompt]);
  assert.equal(cleaned.length, 2, 'only the real user/assistant pair should remain');
  assert.equal(cleaned[0].text, 'hello');
  assert.equal(cleaned[1].text, 'hi there');
});

test('cleanMessages strips hidden prompts regardless of the assistant reply', () => {
  const feed = 'Recent conversation:\nUser: hi';
  const messages = [msg('user', feed), msg('assistant', 'sure, got it'), msg('user', 'real'), msg('assistant', 'ok')];
  const cleaned = srv.cleanMessages(messages, '', feed);
  assert.equal(cleaned.length, 2);
  assert.equal(cleaned[0].text, 'real');
});

test('buildAndCompactFeed hard-caps even when the summary fails', async () => {
  const chat = {
    id: 'compact-2',
    summary: 'Old summary',
    summarizedUpTo: 0,
    messages: bigMessages(6, 700),
  };
  const failingDriver = {
    submit: async () => {
      throw new Error('boom');
    },
  };
  const feed = await srv.buildAndCompactFeed(chat, failingDriver);
  assert.ok(feed.length <= srv.CONTEXT_BUDGET_CHARS + 400, `feed too long: ${feed.length}`);
  assert.ok(chat.summary === 'Old summary', 'summary unchanged when compaction fails');
});