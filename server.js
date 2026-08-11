const express = require('express');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');
const { ChatGPTDriver, RESET_MARKER } = require('./chatgpt');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HEADED = process.env.HEADED === '1';
const PROFILE = process.env.PROFILE || path.join(__dirname, 'profile');
const TIMEOUT = parseInt(process.env.TIMEOUT || '180000', 10);
const JOB_WATCHDOG_MS = Math.max(360000, TIMEOUT * 2 + 60000);
const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, 'state.json');
const CHATS_FILE = process.env.CHATS_FILE || path.join(__dirname, 'chats.json');
const SETTINGS_FILE = process.env.SETTINGS_FILE || path.join(__dirname, 'settings.json');

const driver = new ChatGPTDriver({ headed: HEADED, profileDir: PROFILE, timeoutMs: TIMEOUT, stateFile: STATE_FILE });

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

let jobSeq = 0;
const queue = [];
let processing = false;

let store = { chats: [], activeChatId: null };
try {
  store = JSON.parse(fs.readFileSync(CHATS_FILE, 'utf8'));
  if (!Array.isArray(store.chats)) store.chats = [];
} catch {}

let settings = { systemPrompt: '' };
try {
  settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
} catch {}

function saveStore() {
  try {
    fs.writeFileSync(CHATS_FILE, JSON.stringify(store, null, 2));
  } catch {}
}

function saveSettings() {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch {}
}

function getChat(chatId) {
  return store.chats.find((c) => c.id === chatId) || null;
}

function clientIdOf(req) {
  return String(req.header('x-client-id') || 'legacy').slice(0, 64);
}

function ownedChats(clientId) {
  return store.chats.filter((c) => c.owner === clientId);
}

function cleanMessages(messages, seed, memoryText) {
  const out = messages.slice();
  const seedTrim = (seed || '').trim();
  const memTrim = (memoryText || '').trim();
  if (seedTrim && out[0] && out[0].role === 'user' && out[0].text.trim() === seedTrim) {
    out.splice(0, 2);
  }
  if (memTrim) {
    for (let i = 0; i < out.length - 1; i++) {
      if (
        out[i].role === 'user' &&
        out[i].text.trim() === memTrim &&
        out[i + 1].role === 'assistant' &&
        out[i + 1].text.trim() === 'OK'
      ) {
        out.splice(i, 2);
        i -= 1;
      }
    }
  }
  return out;
}

function buildMemoryMessage(messages) {
  const MAX_PER_MSG = 20000;
  const MAX_TOTAL = 200000;
  const lines = [
    'This is the full history of our ongoing chat. Remember ALL of it — every detail, every topic, every instruction — as context for this chat. Do not treat this as a question and do not reply with a summary. Just remember it all.',
    '',
    'Chat history:',
    '',
  ];
  let total = 0;
  let skipped = false;
  for (const m of messages) {
    let t = m.text || '';
    let note = '';
    if (t.length > MAX_PER_MSG) {
      t = t.slice(0, MAX_PER_MSG);
      note = '\n…(previous part too long to include)';
    }
    if (total + t.length > MAX_TOTAL) {
      skipped = true;
      break;
    }
    total += t.length;
    lines.push((m.role === 'user' ? 'user' : 'assistant') + ': ' + t + note);
  }
  if (skipped) lines.push('…(older history omitted to save space)');
  lines.push('');
  lines.push('You have remembered the entire history above. Acknowledge with exactly: OK');
  return lines.join('\n');
}

function sse(res, obj) {
  try {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  } catch {}
}

async function pump() {
  if (processing) return;
  processing = true;
  try {
    while (queue.length) {
      const job = queue.shift();
      if (job.aborted) {
        try { job.res.end(); } catch {}
        continue;
      }
      const watchdog = setTimeout(() => {
        if (job.aborted) return;
        job.aborted = true;
        console.error('[server] job watchdog fired (took >', JOB_WATCHDOG_MS, 'ms)');
        try { driver.stop(); } catch {}
        try {
          sse(job.res, {
            type: 'error',
            code: 'timeout',
            message: 'ChatGPT did not finish in time. Try a shorter message, or try again later.',
          });
        } catch {}
        try { job.res.end(); } catch {}
      }, JOB_WATCHDOG_MS);
      try {
        await driver.start();
        sse(job.res, { type: 'queue', position: queue.length });
        const chat = getChat(job.chatId);
        if (chat && settings.systemPrompt && !chat.seeded) {
          console.log('[server] seeding system prompt into chat', chat.id);
          try {
            await driver.submit({ chatId: job.chatId, message: settings.systemPrompt, onDelta: null });
          } catch {}
          chat.seeded = true;
          saveStore();
        }
        if (chat && chat.messages.length) {
          try {
            const live = await driver.getHistory(job.chatId);
            if (live.length < chat.messages.length) {
              const memoryText = buildMemoryMessage(chat.messages);
              chat.lastMemoryText = memoryText;
              saveStore();
              console.log(`[server] feeding full context into chat ${chat.id} (${chat.messages.length} messages)`);
              await driver.submit({ chatId: job.chatId, message: memoryText, onDelta: null });
            }
          } catch {}
        }
        const saveTimer = setInterval(() => {
          const c = getChat(job.chatId);
          if (!c) return;
          driver
            .getHistory(job.chatId)
            .then((messages) => {
              const cleaned = cleanMessages(messages, settings.systemPrompt, c.lastMemoryText);
              if (cleaned.length > c.messages.length) {
                c.messages = cleaned;
                saveStore();
              }
            })
            .catch(() => {});
        }, 4000);
        try {
          const chat = getChat(job.chatId);
          if (chat) {
            chat.messages.push({ role: 'user', text: job.message });
            saveStore();
          }
          let streamedText = '';
          const result = await driver.submit({
            chatId: job.chatId,
            message: job.message,
            onDelta: (d) => {
              if (job.aborted) return;
              if (d === RESET_MARKER) {
                streamedText = '';
                sse(job.res, { type: 'reset' });
              } else if (d) {
                streamedText += d;
                sse(job.res, { type: 'delta', text: d });
              }
            },
          });
          const cleanText = (t) => t.replace(/^I\n/, '').replace(/\nI\n/g, '\n');
          const finalText = cleanText(streamedText.trim() || (result.text || ''));
          const c = getChat(job.chatId);
          if (c && finalText) {
            c.messages.push({ role: 'assistant', text: finalText });
            saveStore();
          }
          if (job.aborted) continue;
          if (result.error) {
            sse(job.res, { type: 'error', code: result.error, retryAfter: result.retryAfter || null, text: finalText });
          } else {
            sse(job.res, { type: 'done', text: finalText });
          }
        } finally {
          clearInterval(saveTimer);
          clearTimeout(watchdog);
        }
      } catch (e) {
        clearTimeout(watchdog);
        console.error('[job error]', e);
        if (!job.aborted) sse(job.res, { type: 'error', code: 'internal', message: String((e && e.message) || e) });
      } finally {
        clearTimeout(watchdog);
        try { job.res.end(); } catch {}
        const chat = getChat(job.chatId);
        if (chat) {
          try {
            const messages = await driver.getHistory(job.chatId);
            const cleaned = cleanMessages(messages, settings.systemPrompt, chat.lastMemoryText);
            if (cleaned.length > chat.messages.length) chat.messages = cleaned;
            saveStore();
          } catch {}
        }
      }
    }
  } finally {
    processing = false;
  }
}

function startChatStream(req, res, chatId, message) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders && res.flushHeaders();
  const job = { id: ++jobSeq, chatId, message, res, aborted: false };
  req.on('aborted', () => {
    job.aborted = true;
  });
  res.on('close', () => {
    if (!res.writableEnded) job.aborted = true;
  });
  queue.push(job);
  pump();
}

app.post('/api/chat', (req, res) => {
  const message = String((req.body && req.body.message) || '').trim();
  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }
  const clientId = clientIdOf(req);
  let chatId = String((req.body && req.body.chatId) || '').trim();
  let chat = chatId ? getChat(chatId) : null;
  if (chatId && (!chat || chat.owner !== clientId)) {
    res.status(404).json({ error: 'chat not found' });
    return;
  }
  if (!chat) {
    chatId = crypto.randomUUID();
    chat = { id: chatId, owner: clientId, title: message.slice(0, 40), createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
    store.chats.push(chat);
  }
  chat.updatedAt = Date.now();
  if (!chat.title || chat.title === 'New chat') chat.title = message.slice(0, 40);
  store.activeChatId = chatId;
  saveStore();
  startChatStream(req, res, chatId, message);
});

app.get('/api/chat', (req, res) => {
  const message = String(req.query.prompt || '').trim();
  if (!message) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }
  const clientId = clientIdOf(req);
  const chatId = crypto.randomUUID();
  const chat = { id: chatId, owner: clientId, title: message.slice(0, 40), createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
  store.chats.push(chat);
  store.activeChatId = chatId;
  saveStore();
  startChatStream(req, res, chatId, message);
});

app.post('/api/new-chat', async (req, res) => {
  const clientId = clientIdOf(req);
  const chatId = crypto.randomUUID();
  const chat = { id: chatId, owner: clientId, title: 'New chat', createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
  store.chats.push(chat);
  store.activeChatId = chatId;
  saveStore();
  try {
    await driver.ensureChat(chatId);
    res.json({ ok: true, id: chatId });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
});

app.post('/api/stop', async (req, res) => {
  try {
    await driver.stop();
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

app.post('/api/chat-delete', async (req, res) => {
  const clientId = clientIdOf(req);
  const chatId = String((req.body && req.body.chatId) || '').trim();
  const chat = getChat(chatId);
  if (!chat || chat.owner !== clientId) {
    res.status(404).json({ error: 'chat not found' });
    return;
  }
  store.chats = store.chats.filter((c) => c.id !== chatId);
  if (store.activeChatId === chatId) store.activeChatId = null;
  saveStore();
  await driver.closeChat(chatId).catch(() => {});
  res.json({ ok: true });
});

app.post('/api/chat-rename', (req, res) => {
  const clientId = clientIdOf(req);
  const chatId = String((req.body && req.body.chatId) || '').trim();
  const title = String((req.body && req.body.title) || '').trim().slice(0, 60);
  if (!title) {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  const chat = getChat(chatId);
  if (!chat || chat.owner !== clientId) {
    res.status(404).json({ error: 'chat not found' });
    return;
  }
  chat.title = title;
  saveStore();
  res.json({ ok: true });
});

app.get('/api/history', async (req, res) => {
  const clientId = clientIdOf(req);
  const chatId = String(req.query.chatId || '').trim();
  const chat = chatId ? getChat(chatId) : null;
  if (!chat || chat.owner !== clientId) {
    res.json({ messages: [] });
    return;
  }
  try {
    const live = await driver.getHistory(chatId);
    if (live.length > chat.messages.length) {
      chat.messages = cleanMessages(live, settings.systemPrompt, chat.lastMemoryText);
      saveStore();
    }
  } catch {}
  const deduped = chat.messages.filter(
    (m, i) => i === 0 || !(m.role === chat.messages[i - 1].role && m.text === chat.messages[i - 1].text)
  );
  res.json({ messages: deduped });
});

app.get('/api/settings', (req, res) => {
  res.json({ systemPrompt: settings.systemPrompt || '' });
});

app.post('/api/settings', (req, res) => {
  const systemPrompt = String((req.body && req.body.systemPrompt) || '').trim();
  settings.systemPrompt = systemPrompt;
  saveSettings();
  res.json({ ok: true, systemPrompt });
});

app.get('/api/chats', (req, res) => {
  const clientId = clientIdOf(req);
  let claimed = false;
  for (const c of store.chats) {
    if (!c.owner) {
      c.owner = clientId;
      claimed = true;
    }
  }
  if (claimed) saveStore();
  const list = ownedChats(clientId)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map((c) => ({
      id: c.id,
      title: c.title || 'New chat',
      updatedAt: c.updatedAt || c.createdAt || 0,
      messageCount: (c.messages || []).length,
    }));
  const active = store.activeChatId && getChat(store.activeChatId) && getChat(store.activeChatId).owner === clientId ? store.activeChatId : (list[0] && list[0].id) || null;
  res.json({ chats: list, activeChatId: active });
});

app.post('/api/reset-session', async (req, res) => {
  try {
    await driver.resetSession();
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: String((e && e.message) || e) });
  }
});

app.get('/api/status', async (req, res) => {
  const st = await driver.status().catch(() => ({}));
  res.json({
    ready: driver.ready,
    busy: driver.busy,
    queueLength: queue.length,
    processing,
    ...st,
    lanIps: lanIps(),
    port: PORT,
    activeChatId: store.activeChatId,
    chatCount: store.chats.length,
  });
});

function lanIps() {
  const out = [];
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const i of infos || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  return out;
}

function openBrowser(url) {
  if (process.env.NO_BROWSER === '1') return;
  const cmd =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  setTimeout(() => {
    exec(cmd, () => {});
    console.log(`[server] opened browser: ${url}`);
  }, 1500);
}

app.listen(PORT, '0.0.0.0', () => {
  const ips = lanIps();
  console.log(`ChatGPT Gateway listening on http://localhost:${PORT}`);
  console.log(`LAN: ${ips.map((ip) => `http://${ip}:${PORT}`).join('  ')}`);
  if (HEADED) console.log('HEADED mode: a visible browser window will open (solve any captcha once, cookies persist in ./profile)');
  openBrowser(`http://${(ips[0] || 'localhost')}:${PORT}`);
});
