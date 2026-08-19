const express = require('express');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exec, execSync } = require('child_process');
const { ChatGPTDriver, RESET_MARKER } = require('./chatgpt');

const APP_VERSION = (require('./package.json').version || '0.0.0').replace(/^v/, '');
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const HEADED = process.env.HEADED === '1';
const PROFILE = process.env.PROFILE || path.join(__dirname, 'profile');
const TIMEOUT = parseInt(process.env.TIMEOUT || '300000', 10);
const JOB_WATCHDOG_MS = Math.max(360000, TIMEOUT * 2 + 60000);
const RATE_LIMIT_RETRIES = parseInt(process.env.RATE_LIMIT_RETRIES || '3', 10);
const RATE_LIMIT_BASE_DELAY_MS = parseInt(process.env.RATE_LIMIT_BASE_DELAY_MS || '15000', 10);
const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, 'state.json');
const CHATS_FILE = process.env.CHATS_FILE || path.join(__dirname, 'chats.json');
const SETTINGS_FILE = process.env.SETTINGS_FILE || path.join(__dirname, 'settings.json');
const CLIENTS_FILE = process.env.CLIENTS_FILE || path.join(__dirname, 'clients.json');
const USERS_FILE = process.env.USERS_FILE || path.join(__dirname, 'users.json');
const AUTH_TOKEN = process.env.AUTH_TOKEN || null;
const ENCRYPT_KEY = process.env.ENCRYPT_KEY || null;
const ALLOW_SIGNUP = process.env.ALLOW_SIGNUP !== '0';
const MAX_PROMPT = parseInt(process.env.MAX_PROMPT || '500000', 10);
const CONTEXT_BUDGET_CHARS = parseInt(process.env.CONTEXT_BUDGET || '320000', 10);
const HTTPS = process.env.HTTPS === '1';
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || String(PORT + 1), 10);
const TTS_MAX_CHARS = parseInt(process.env.TTS_MAX_CHARS || '20000', 10);
const TTS_CHUNK = 1800;

const driver = new ChatGPTDriver({ headed: HEADED, profileDir: PROFILE, timeoutMs: TIMEOUT, stateFile: STATE_FILE });

// ---- optional at-rest encryption (AES-256-GCM) for chats.json / settings.json ----
const encKey = ENCRYPT_KEY ? crypto.createHash('sha256').update(String(ENCRYPT_KEY)).digest() : null;
function encryptJson(obj) {
  if (!encKey) return JSON.stringify(obj, null, 2);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: tag.toString('base64'), data: data.toString('base64') });
}
function decryptJson(raw) {
  try {
    const wrap = JSON.parse(raw);
    if (!wrap || !wrap.iv) return JSON.parse(raw);
    if (!encKey) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, Buffer.from(wrap.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(wrap.tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(wrap.data, 'base64')), decipher.final()]).toString('utf8'));
  } catch {
    return null;
  }
}
function readJson(file, fallback) {
  try {
    const parsed = decryptJson(fs.readFileSync(file, 'utf8'));
    return parsed === null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// ---- auth: master Bearer token, or per-client token (issued via /api/register) ----
const clients = readJson(CLIENTS_FILE, {});
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
function saveClients() {
  try {
    fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2));
  } catch {}
}
function clientIdOf(req) {
  return String(req.header('x-client-id') || 'legacy').slice(0, 64);
}

app.use('/api', requireAuth);
app.use('/v1', requireAuth);

// v8.0 demo mode: let a browser-based demo (e.g. on Pages.dev) call the API.
// Off by default. Enable with CORS_ALLOW=1 (any origin) or list specific
// origins in CORS_ORIGINS=comma,separated.
const CORS_ALLOW = process.env.CORS_ALLOW === '1';
const CORS_ORIGINS = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use((req, res, next) => {
  const origin = req.header('origin');
  if (origin && (CORS_ALLOW || CORS_ORIGINS.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Id, X-Client-Token, X-Session-Id');
    res.setHeader('Access-Control-Max-Age', '86400');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
  }
  next();
});

function requireAuth(req, res, next) {
  req.masterAuth = false;
  if (!AUTH_TOKEN) return next();
  const fullPath = req.baseUrl + req.path;
  if (fullPath === '/api/login' || fullPath === '/api/signup') return next();
  const bearer = String(req.header('authorization') || '');
  if (bearer === 'Bearer ' + AUTH_TOKEN) {
    req.masterAuth = true;
    return next();
  }
  const clientId = clientIdOf(req);
  const clientToken = String(req.header('x-client-token') || '');
  if (clientId && clientId !== 'legacy' && clientToken && clients[clientId] === sha256(clientToken)) {
    req.clientVerified = true;
    return next();
  }
  res.status(401).json({ error: { message: 'unauthorized — send Authorization: Bearer <master-token> or X-Client-Id + X-Client-Token', type: 'invalid_request_error' } });
}

// ---- user accounts (multi-user): login issues a per-account client token ----
const users = readJson(USERS_FILE, {});
const scryptHash = (password, salt) => crypto.scryptSync(String(password), salt, 64);
const USERNAME_RE = /^[a-z0-9_-]{3,32}$/i;
function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch {}
}
const loginAttempts = new Map();
function loginThrottled(ip) {
  const key = ip || 'unknown';
  const now = Date.now();
  const e = loginAttempts.get(key);
  if (!e || now - e.start > 60000) {
    loginAttempts.set(key, { start: now, count: 0 });
    return false;
  }
  e.count += 1;
  return e.count > 10;
}
function issueClientToken(clientId) {
  const token = crypto.randomBytes(24).toString('hex');
  clients[clientId] = sha256(token);
  saveClients();
  return token;
}

app.post('/api/signup', (req, res) => {
  if (!AUTH_TOKEN) {
    res.status(400).json({ error: 'no auth configured (AUTH_TOKEN is empty)' });
    return;
  }
  if (!ALLOW_SIGNUP) {
    res.status(403).json({ error: 'signup is disabled on this server' });
    return;
  }
  if (loginThrottled(req.socket.remoteAddress)) {
    res.status(429).json({ error: 'too many attempts, slow down' });
    return;
  }
  const username = String((req.body && req.body.username) || '').trim();
  const password = String((req.body && req.body.password) || '');
  if (!USERNAME_RE.test(username)) {
    res.status(400).json({ error: 'username must be 3-32 chars (letters, digits, _ or -)' });
    return;
  }
  if (password.length < 6 || password.length > 256) {
    res.status(400).json({ error: 'password must be 6-256 characters' });
    return;
  }
  if (users[username]) {
    res.status(409).json({ error: 'username already exists' });
    return;
  }
  const salt = crypto.randomBytes(16).toString('hex');
  users[username] = { salt, hash: scryptHash(password, salt).toString('hex') };
  saveUsers();
  const clientId = 'u-' + username;
  res.json({ ok: true, clientId, clientToken: issueClientToken(clientId) });
});

app.post('/api/login', (req, res) => {
  if (!AUTH_TOKEN) {
    res.status(400).json({ error: 'no auth configured (AUTH_TOKEN is empty)' });
    return;
  }
  if (loginThrottled(req.socket.remoteAddress)) {
    res.status(429).json({ error: 'too many attempts, slow down' });
    return;
  }
  const username = String((req.body && req.body.username) || '').trim();
  const password = String((req.body && req.body.password) || '');
  const record = users[username];
  if (!record || !record.salt || !record.hash) {
    res.status(401).json({ error: 'invalid username or password' });
    return;
  }
  const actual = Buffer.from(record.hash, 'hex');
  const expected = scryptHash(password, record.salt);
  const ok = actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  if (!ok) {
    res.status(401).json({ error: 'invalid username or password' });
    return;
  }
  const clientId = 'u-' + username;
  res.json({ ok: true, clientId, clientToken: issueClientToken(clientId) });
});

// ---- per-client rate limits + queue depth cap (matters when shared) ----
const rateBuckets = new Map();
app.use('/api', (req, res, next) => {
  const key = clientIdOf(req) + '|' + req.path;
  const now = Date.now();
  let b = rateBuckets.get(key);
  if (!b || now - b.start > 60000) {
    b = { start: now, count: 0 };
    rateBuckets.set(key, b);
    if (rateBuckets.size > 5000) rateBuckets.clear();
  }
  b.count += 1;
  const limit = req.path === '/api/chat' ? 30 : 120;
  if (b.count > limit) {
    res.status(429).json({ error: 'rate limit exceeded, slow down' });
    return;
  }
  next();
});

app.use('/v1', (req, res, next) => {
  const key = clientIdOf(req) + '|v1' + req.path;
  const now = Date.now();
  let b = rateBuckets.get(key);
  if (!b || now - b.start > 60000) {
    b = { start: now, count: 0 };
    rateBuckets.set(key, b);
  }
  b.count += 1;
  if (b.count > 60) {
    res.status(429).json({ error: { message: 'rate limit exceeded, slow down', type: 'rate_limit_error' } });
    return;
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

let jobSeq = 0;
const queue = [];
let processing = false;
let currentJobId = null;
let currentJobClient = null;
let resolveAborted = null;
let currentJob = null;

let store = { chats: [], activeChatId: null };
try {
  store = readJson(CHATS_FILE, null) || { chats: [], activeChatId: null };
  if (!Array.isArray(store.chats)) store.chats = [];
} catch {}

let settings = { systemPrompt: '' };
try {
  settings = readJson(SETTINGS_FILE, null) || { systemPrompt: '' };
} catch {}

function saveStore() {
  try {
    fs.writeFileSync(CHATS_FILE, encryptJson(store));
  } catch {}
}

function saveSettings() {
  try {
    fs.writeFileSync(SETTINGS_FILE, encryptJson(settings));
  } catch {}
}

function getChat(chatId) {
  return store.chats.find((c) => c.id === chatId) || null;
}

function ownedChats(clientId) {
  return store.chats.filter((c) => c.owner === clientId);
}

function cleanMessages(messages, seed, memoryText, extraHidden) {
  const out = messages.slice();
  const hidden = new Set();
  const seedTrim = (seed || '').trim();
  if (seedTrim) hidden.add(seedTrim);
  if (memoryText) hidden.add(String(memoryText).trim());
  if (Array.isArray(extraHidden)) {
    for (const h of extraHidden) if (h) hidden.add(String(h).trim());
  }
  if (!hidden.size) return out;
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i].role === 'user' && hidden.has(out[i].text.trim())) {
      out.splice(i, 2);
      i -= 1;
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

// ---- unlimited context: rolling-summary auto-compaction ----
// The saved transcript (chats.json) is the unlimited source of truth; what we
// feed back to the page is always bounded to CONTEXT_BUDGET_CHARS via a rolling
// summary of older messages, so a long chat can never overflow the model window.
function transcriptText(messages) {
  const MAX_PER_MSG = 20000;
  let out = '';
  for (const m of messages) {
    let t = (m.text || '').slice(0, MAX_PER_MSG);
    if ((m.text || '').length > MAX_PER_MSG) t += '\n…';
    out += (m.role === 'user' ? 'User' : 'Assistant') + ': ' + t + '\n\n';
  }
  return out.trimEnd();
}

function buildFeed(chat) {
  const start = chat.summarizedUpTo || 0;
  const recent = chat.messages.slice(start);
  const summaryPart = chat.summary
    ? `Summary of our earlier conversation (for your memory, do not mention it):\n${chat.summary}\n\n`
    : '';
  const recentPart = recent.length ? `Recent conversation:\n${transcriptText(recent)}` : '';
  return (summaryPart + recentPart).trim();
}

async function buildAndCompactFeed(chat, driver) {
  let feed = buildFeed(chat);
  if (feed.length <= CONTEXT_BUDGET_CHARS) return feed;
  const start = chat.summarizedUpTo || 0;
  const recent = chat.messages.slice(start);
  if (recent.length < 3) {
    // nothing meaningful to summarize (recent itself is just a few huge messages); hard-truncate
    feed = feed.slice(feed.length - CONTEXT_BUDGET_CHARS);
    return '…(earlier context truncated to fit the model)\n' + feed;
  }
  const recentBudget = Math.floor(CONTEXT_BUDGET_CHARS * 0.45);
  let keep = 0;
  let len = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const tlen = Math.min((recent[i].text || '').length, 20000) + 30;
    if (len + tlen > recentBudget && keep > 0) break;
    len += tlen;
    keep++;
  }
  const toSummarize = recent.slice(0, recent.length - keep);
  if (toSummarize.length) {
    const summaryInput = transcriptText(toSummarize);
    const prompt =
      (chat.summary ? `Here is the existing summary of the conversation so far:\n${chat.summary}\n\n` : '') +
      'Update the summary with the following conversation. Preserve key facts, decisions, names, important code or commands, and the user\'s goals. Be concise (a few short paragraphs). Reply with only the updated summary.\n\nConversation update:\n' +
      summaryInput;
    console.log(`[server] auto-compacting chat ${chat.id}: summarizing ${toSummarize.length} messages (${summaryInput.length} chars)`);
    try {
      const result = await driver.submit({ chatId: chat.id, message: prompt, onDelta: null });
      const newSummary = cleanText((result && result.text) || '').trim();
      if (newSummary) {
        chat.summary = newSummary;
        chat.summarizedUpTo = start + toSummarize.length;
        if (!Array.isArray(chat.hiddenPrompts)) chat.hiddenPrompts = [];
        chat.hiddenPrompts.push(prompt);
        saveStore();
        console.log(`[server] compacted chat ${chat.id}: summary is now ${newSummary.length} chars`);
      }
    } catch (e) {
      console.error('[server] compaction summary failed:', String((e && e.message) || e));
    }
  }
  // After compaction the page already holds the summary turn, so feed only the recent tail.
  const tail = chat.messages.slice(chat.summarizedUpTo || 0);
  let recentFeed = tail.length ? `Recent conversation:\n${transcriptText(tail)}` : '';
  if (recentFeed.length > CONTEXT_BUDGET_CHARS) {
    recentFeed = recentFeed.slice(recentFeed.length - CONTEXT_BUDGET_CHARS);
    recentFeed = '…(earlier context truncated to fit the model)\n' + recentFeed;
  }
  return recentFeed || feed.slice(feed.length - CONTEXT_BUDGET_CHARS);
}

function sse(res, obj) {
  try {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  } catch {}
}

const cleanText = (t) => String(t || '').replace(/^I\n/, '').replace(/\nI\n/g, '\n');
const oaiChunk = (jobId, content) =>
  JSON.stringify({
    id: 'chatcmpl-' + jobId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'chatgpt-gateway',
    choices: [{ index: 0, delta: content ? { content } : {}, finish_reason: content ? null : 'stop' }],
  });
const sseOpenAI = (res, payload) => {
  try {
    if (res.writableEnded) return;
    res.write(`data: ${payload}\n\n`);
  } catch {}
};

// v8.0 rate-limit armor: when free ChatGPT says "rate_limited", retry the same
// submit with backoff instead of failing the request. Tune with env:
// RATE_LIMIT_RETRIES (default 3) and RATE_LIMIT_BASE_DELAY_MS (default 15000).
async function submitWithArmor(job, driver, abortedPromise, onDelta) {
  let result = null;
  for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt++) {
    if (job.aborted) return null;
    result = await Promise.race([
      driver.submit({ chatId: job.chatId, message: job.message, onDelta }),
      abortedPromise.then(() => null),
    ]);
    if (!result || result.error !== 'rate_limited' || job.aborted || attempt >= RATE_LIMIT_RETRIES) break;
    const delay = RATE_LIMIT_BASE_DELAY_MS * (attempt + 1);
    console.log(`[server] rate_limited, retry ${attempt + 1}/${RATE_LIMIT_RETRIES} in ${Math.round(delay / 1000)}s (chat ${job.chatId})`);
    const note = `ChatGPT is rate limited — retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${RATE_LIMIT_RETRIES})`;
    try {
      if (job.res.writableEnded) return null;
      if (job.openai) {
        job.res.write(`: ${note}\n\n`);
      } else {
        job.res.write(`data: ${JSON.stringify({ type: 'status', text: note })}\n\n`);
      }
    } catch {}
    await new Promise((r) => setTimeout(r, delay));
    if (job.aborted) return null;
  }
  return result;
}

async function pump() {
  if (processing) return;
  processing = true;
  try {
    while (queue.length) {
      const job = queue.shift();
      currentJobId = job.id;
      currentJobClient = job.clientId || null;
      currentJob = job;
      if (job.aborted) {
        try { job.res.end(); } catch {}
        currentJobId = null;
        currentJobClient = null;
        continue;
      }
      const watchdog = setTimeout(() => {
        if (job.aborted) return;
        job.aborted = true;
        console.error('[server] job watchdog fired (took >', JOB_WATCHDOG_MS, 'ms)');
        try { driver.stop(); } catch {}
        if (job.openai) {
          sseOpenAI(job.res, oaiChunk(job.id, ''));
          sseOpenAI(job.res, '[DONE]');
        } else {
          try {
            sse(job.res, {
              type: 'error',
              code: 'timeout',
              message: 'ChatGPT did not finish in time. Try a shorter message, or try again later.',
            });
          } catch {}
        }
        try { job.res.end(); } catch {}
        if (resolveAborted) resolveAborted();
      }, JOB_WATCHDOG_MS);
      resolveAborted = null;
      const abortedPromise = new Promise((r) => { resolveAborted = r; });
      try {
        await driver.start();
        if (!job.openai) sse(job.res, { type: 'queue', position: queue.length });
        const chat = getChat(job.chatId);
        if (chat && !job.openai && settings.systemPrompt && !chat.seeded) {
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
              const memoryText = await buildAndCompactFeed(chat, driver);
              chat.lastMemoryText = memoryText;
              if (!Array.isArray(chat.hiddenPrompts)) chat.hiddenPrompts = [];
              chat.hiddenPrompts.push(memoryText);
              chat.hiddenPrompts = chat.hiddenPrompts.slice(-2);
              saveStore();
              console.log(`[server] feeding context into chat ${chat.id} (${chat.messages.length} messages saved, feed ${memoryText.length} chars)`);
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
              const cleaned = cleanMessages(messages, settings.systemPrompt, c.lastMemoryText, c.hiddenPrompts);
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
          const onDeltaFor = (d) => {
            if (job.aborted) return;
            if (job.openai) {
              if (d === RESET_MARKER) {
                streamedText = '';
              } else if (d) {
                streamedText += d;
                sseOpenAI(job.res, oaiChunk(job.id, d));
              }
              return;
            }
            if (d === RESET_MARKER) {
              streamedText = '';
              sse(job.res, { type: 'reset' });
            } else if (d) {
              streamedText += d;
              sse(job.res, { type: 'delta', text: d });
            }
          };
          let result = await submitWithArmor(job, driver, abortedPromise, onDeltaFor);
          // never-fail guard: one self-healing retry with a fresh, compacted page
          if (
            result &&
            result.error &&
            !job.aborted &&
            !job.retried &&
            (result.error === 'internal' || result.error === 'timeout' || job.message.length + streamedText.length > CONTEXT_BUDGET_CHARS)
          ) {
            job.retried = true;
            console.log(`[server] submit failed (${result.error}), self-healing with a fresh compacted page for chat ${job.chatId}`);
            try {
              await driver.closeChat(job.chatId);
            } catch {}
            const c0 = getChat(job.chatId);
            if (c0) c0.seeded = false;
            const fresh = await driver.ensureChat(job.chatId);
            job.chatId = fresh.id;
            const c1 = getChat(job.chatId);
            if (c1) {
              if (settings.systemPrompt && !c1.seeded) {
                try {
                  await driver.submit({ chatId: job.chatId, message: settings.systemPrompt, onDelta: null });
                } catch {}
                c1.seeded = true;
              }
              if (c1.messages.length) {
                const memoryText = await buildAndCompactFeed(c1, driver);
                c1.lastMemoryText = memoryText;
                if (!Array.isArray(c1.hiddenPrompts)) c1.hiddenPrompts = [];
                c1.hiddenPrompts.push(memoryText);
                c1.hiddenPrompts = c1.hiddenPrompts.slice(-2);
                saveStore();
                try {
                  await driver.submit({ chatId: job.chatId, message: memoryText, onDelta: null });
                } catch {}
              }
            }
            saveStore();
            streamedText = '';
            result = await Promise.race([
              driver.submit({
                chatId: job.chatId,
                message: job.message,
                onDelta: onDeltaFor,
              }),
              abortedPromise.then(() => null),
            ]);
          }
          const finalText = cleanText(streamedText.trim() || (result && result.text) || '');
          const c = getChat(job.chatId);
          if (c && finalText) {
            c.messages.push({ role: 'assistant', text: finalText });
            saveStore();
          }
          if (job.aborted) {
            try {
              if (job.openai) {
                sseOpenAI(job.res, '[DONE]');
              } else {
                sse(job.res, { type: 'error', code: 'cancelled', message: 'Generation stopped.' });
              }
            } catch {}
            continue;
          }
          if (result && result.error) {
            if (job.openai) {
              sseOpenAI(job.res, oaiChunk(job.id, ''));
              sseOpenAI(job.res, '[DONE]');
            } else {
              sse(job.res, { type: 'error', code: result.error, retryAfter: result.retryAfter || null, text: finalText });
            }
          } else {
            if (job.openai) {
              sseOpenAI(job.res, oaiChunk(job.id, ''));
              sseOpenAI(job.res, '[DONE]');
            } else {
              sse(job.res, { type: 'done', text: finalText });
            }
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
        resolveAborted = null;
        currentJob = null;
        if (currentJobId === job.id) currentJobId = null;
        if (currentJobClient === job.clientId) currentJobClient = null;
        const chat = getChat(job.chatId);
        if (chat) {
          try {
            const messages = await driver.getHistory(job.chatId);
            const cleaned = cleanMessages(messages, settings.systemPrompt, chat.lastMemoryText, chat.hiddenPrompts);
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
  sse(res, { type: 'chat', id: chatId });
  const job = { id: ++jobSeq, chatId, message, res, aborted: false, clientId: clientIdOf(req) };
  req.on('aborted', () => {
    job.aborted = true;
  });
  res.on('close', () => {
    if (!res.writableEnded) job.aborted = true;
  });
  queue.push(job);
  pump();
}

app.post('/api/register', (req, res) => {
  if (!AUTH_TOKEN) {
    res.status(400).json({ error: 'no auth configured (AUTH_TOKEN is empty)' });
    return;
  }
  if (!req.masterAuth) {
    res.status(403).json({ error: 'master token required' });
    return;
  }
  const clientId = String((req.body && req.body.clientId) || '').trim().slice(0, 64);
  if (!clientId || clientId === 'legacy') {
    res.status(400).json({ error: 'clientId is required' });
    return;
  }
  const token = crypto.randomBytes(24).toString('hex');
  clients[clientId] = sha256(token);
  saveClients();
  res.json({ ok: true, clientId, clientToken: token });
});

app.post('/api/chat', (req, res) => {
  const message = String((req.body && req.body.message) || '').trim();
  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }
  if (message.length > MAX_PROMPT) {
    res.status(413).json({ error: `message too long: max ${MAX_PROMPT.toLocaleString()} characters (ChatGPT's guest-mode context limit)` });
    return;
  }
  const clientId = clientIdOf(req);
  if (AUTH_TOKEN) {
    const depth =
      (currentJobClient === clientId ? 1 : 0) + queue.filter((j) => !j.aborted && j.clientId === clientId).length;
    if (depth >= 2) {
      res.status(429).json({ error: 'too many queued requests, wait for the current one to finish' });
      return;
    }
  }
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
  const clientId = clientIdOf(req);
  const isMaster = AUTH_TOKEN && req.masterAuth;
  const ownedCurrent = currentJob && currentJob.clientId === clientId;
  if (currentJob && (ownedCurrent || isMaster)) {
    currentJob.aborted = true;
    try {
      await driver.stop();
      if (resolveAborted) resolveAborted();
    } catch {}
    res.json({ ok: true });
    return;
  }
  const ownedQueued = queue.find((j) => !j.aborted && (isMaster || j.clientId === clientId));
  if (ownedQueued) {
    ownedQueued.aborted = true;
    try {
      sse(ownedQueued.res, { type: 'error', code: 'cancelled', message: 'Generation stopped.' });
    } catch {}
    try { ownedQueued.res.end(); } catch {}
    res.json({ ok: true });
    return;
  }
  res.json({ ok: false, error: 'nothing to stop' });
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
      chat.messages = cleanMessages(live, settings.systemPrompt, chat.lastMemoryText, chat.hiddenPrompts);
      saveStore();
    }
  } catch {}
  const deduped = chat.messages.filter(
    (m, i) => i === 0 || !(m.role === chat.messages[i - 1].role && m.text === chat.messages[i - 1].text)
  );
  res.json({ messages: deduped });
});

app.get('/api/export', (req, res) => {
  const clientId = clientIdOf(req);
  const chatId = String(req.query.chatId || '').trim();
  const chat = chatId ? getChat(chatId) : null;
  if (!chat || chat.owner !== clientId) {
    res.status(404).json({ error: 'chat not found' });
    return;
  }
  const format = String(req.query.format || 'md').toLowerCase();
  const title = chat.title || 'New chat';
  const safe =
    title
      .replace(/[^a-z0-9-_ ]/gi, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'chat';
  const messages = cleanMessages(chat.messages, settings.systemPrompt, chat.lastMemoryText, chat.hiddenPrompts);
  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="' + safe + '.json"');
    res.send(
      JSON.stringify(
        {
          title,
          createdAt: chat.createdAt || null,
          updatedAt: chat.updatedAt || null,
          exportedAt: Date.now(),
          messages: messages.map((m) => ({ role: m.role, text: m.text })),
        },
        null,
        2
      )
    );
    return;
  }
  const blocks = ['# ' + title, '', '_Exported ' + new Date().toLocaleString() + ' — ' + messages.length + ' messages_', ''];
  for (const m of messages) {
    if (m.role === 'user') blocks.push('## You', '', m.text || '', '');
    else if (m.role === 'assistant') blocks.push('## ChatGPT', '', m.text || '', '');
  }
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="' + safe + '.md"');
  res.send(blocks.join('\n'));
});

app.get('/api/settings', (req, res) => {
  res.json({ systemPrompt: settings.systemPrompt || '' });
});app.post('/api/settings', (req, res) => {
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
  if (AUTH_TOKEN && !req.masterAuth) {
    res.status(403).json({ error: 'master token required' });
    return;
  }
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
    https: HTTPS,
    httpsPort: HTTPS_PORT,
    maxPrompt: MAX_PROMPT,
    authRequired: !!AUTH_TOKEN,
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

// ---- voice: text-to-speech via Microsoft Edge neural voices (free, no keys) ----
function splitForTTS(text, max) {
  const out = [];
  let cur = '';
  const re = /[^.!?\n]*[.!?\n]+|[^.!?\n]+$/g;
  let m;
  while ((m = re.exec(text))) {
    if (cur && cur.length + m[0].length > max) {
      out.push(cur.trim());
      cur = '';
    }
    cur += m[0];
  }
  if (cur.trim()) out.push(cur.trim());
  if (!out.length && text.trim()) out.push(text.trim());
  return out;
}

app.get('/api/tts', async (req, res) => {
  const text = String(req.query.text || '').trim();
  if (!text) {
    res.status(400).json({ error: 'text is required' });
    return;
  }
  if (text.length > TTS_MAX_CHARS) {
    res.status(413).json({ error: `text too long for speech (max ${TTS_MAX_CHARS.toLocaleString()} characters)` });
    return;
  }
  const voice = String(req.query.voice || 'en-US-AriaNeural').slice(0, 64);
  let EdgeTTS;
  try {
    ({ EdgeTTS } = require('node-edge-tts'));
  } catch (e) {
    res.status(500).json({ error: 'TTS engine unavailable: ' + String((e && e.message) || e) });
    return;
  }
  const lang = voice.split('-').slice(0, 2).join('-');
  const tts = new EdgeTTS({ voice, lang, outputFormat: 'audio-24khz-48kbitrate-mono-mp3', timeout: 20000 });
  const chunks = splitForTTS(text, TTS_CHUNK);
  const tmpDir = path.join(os.tmpdir(), 'cg-tts-' + process.pid);
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
    for (let i = 0; i < chunks.length; i++) {
      const file = path.join(tmpDir, `chunk-${i}.mp3`);
      await tts.ttsPromise(chunks[i], file);
      res.write(fs.readFileSync(file));
      try { fs.unlinkSync(file); } catch {}
    }
    res.end();
  } catch (e) {
    console.error('[tts]', String((e && e.message) || e));
    try { res.end(); } catch {}
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

// ---- update check ----
let updateInfo = { current: APP_VERSION, latest: null, changelog: '', checkedAt: 0, error: null };
async function checkForUpdates() {
  if (process.env.UPDATE_CHECK === '0') return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch('https://api.github.com/repos/gc1dk/Chatgpt-Proxy/releases/latest', {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'chatgpt-gateway' },
    });
    clearTimeout(t);
    if (!res.ok) throw new Error('github ' + res.status);
    const rel = await res.json();
    updateInfo = {
      current: APP_VERSION,
      latest: (rel.tag_name || '').replace(/^v/, ''),
      changelog: (rel.body || '').slice(0, 5000),
      checkedAt: Date.now(),
      error: null,
    };
  } catch (e) {
    updateInfo.error = String((e && e.message) || e);
  }
}
checkForUpdates();
const updateTimer = setInterval(checkForUpdates, 3600000);
updateTimer.unref && updateTimer.unref();

app.get('/api/update-info', async (req, res) => {
  if (String(req.query.refresh || '') === '1') await checkForUpdates();
  res.json(updateInfo);
});

app.post('/api/update', (req, res) => {
  if (AUTH_TOKEN && !req.masterAuth) {
    res.status(403).json({ error: 'master token required' });
    return;
  }
  try {
    const status = execSync('git status --porcelain', { cwd: __dirname, encoding: 'utf8', timeout: 15000 });
    if (status.trim()) {
      res.json({ ok: false, error: 'working tree not clean, commit or stash your changes first', detail: status.slice(0, 300) });
      return;
    }
    execSync('git fetch --tags origin main', { cwd: __dirname, timeout: 30000, encoding: 'utf8' });
    const pull = execSync('git pull --ff-only origin main', { cwd: __dirname, timeout: 60000, encoding: 'utf8' });
    setTimeout(() => {
      try {
        execSync('npm install --silent --no-audit --no-fund', { cwd: __dirname, timeout: 600000 });
      } catch {}
    }, 200);
    res.json({ ok: true, pull: String(pull).slice(0, 500) });
  } catch (e) {
    res.json({ ok: false, error: String((e && e.message) || e).slice(0, 500) });
  }
});

app.post('/api/restart', (req, res) => {
  if (AUTH_TOKEN && !req.masterAuth) {
    res.status(403).json({ error: 'master token required' });
    return;
  }
  res.json({ ok: true });
  const cwd = __dirname;
  const cmd =
    process.platform === 'win32'
      ? `start "" /b cmd /c "timeout /t 2 /nobreak >nul & node server.js"`
      : `(sleep 2 && node server.js &)`;
  setTimeout(() => {
    try {
      exec(cmd, { cwd });
    } catch {}
  }, 300);
  setTimeout(() => process.exit(0), 700);
});

// ---- OpenAI-compatible API: POST /v1/chat/completions ----
app.post('/v1/chat/completions', async (req, res) => {
  const body = req.body || {};
  const clientId = clientIdOf(req);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...messages].reverse().find((m) => m && (m.role === 'user' || m.role === 'assistant'));
  const prompt = String((lastUser && lastUser.content) || '').trim();
  if (!prompt) {
    res.status(400).json({ error: { message: 'a user message is required', type: 'invalid_request_error' } });
    return;
  }
  if (prompt.length > MAX_PROMPT) {
    res.status(400).json({ error: { message: `message too long (max ${MAX_PROMPT.toLocaleString()} characters)`, type: 'invalid_request_error' } });
    return;
  }
  const stream = !!body.stream;
  const sessionKey = String(body.user || req.header('x-session-id') || '').trim();
  const chatId = sessionKey
    ? 'api-' + crypto.createHash('sha256').update(sessionKey).digest('hex').slice(0, 24)
    : crypto.randomUUID();
  let chat = getChat(chatId);
  if (!chat) {
    chat = {
      id: chatId,
      owner: clientId,
      title: prompt.slice(0, 40),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      api: true,
    };
    store.chats.push(chat);
  } else if (chat.owner !== clientId) {
    res.status(403).json({ error: { message: 'session belongs to another client', type: 'invalid_request_error' } });
    return;
  }
  chat.updatedAt = Date.now();
  if (!chat.title || chat.title === 'New chat') chat.title = prompt.slice(0, 40);
  store.activeChatId = chatId;
  saveStore();

  const finish = (code, message) => {
    res.status(code).json({ error: { message, type: 'server_error' } });
  };

  try {
    if (stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders && res.flushHeaders();
      const job = { id: ++jobSeq, chatId, message: prompt, res, aborted: false, clientId, openai: true };
      req.on('aborted', () => {
        job.aborted = true;
      });
      res.on('close', () => {
        if (!res.writableEnded) job.aborted = true;
      });
      queue.push(job);
      pump();
      return;
    }
    await driver.start();
    const c = getChat(chatId);
    if (c && c.messages.length) {
      try {
        const live = await driver.getHistory(chatId);
        if (live.length < c.messages.length) {
          const memoryText = await buildAndCompactFeed(c, driver);
          c.lastMemoryText = memoryText;
          if (!Array.isArray(c.hiddenPrompts)) c.hiddenPrompts = [];
          c.hiddenPrompts.push(memoryText);
          c.hiddenPrompts = c.hiddenPrompts.slice(-2);
          saveStore();
          await driver.submit({ chatId, message: memoryText, onDelta: null });
        }
      } catch {}
    }
    c.messages.push({ role: 'user', text: prompt });
    saveStore();
    const armorJob = { chatId, message: prompt, res, openai: true, aborted: false };
    const result = await submitWithArmor(armorJob, driver, new Promise(() => {}), null);
    const finalText = cleanText((result && result.text) || '');
    const cc = getChat(chatId);
    if (cc && finalText) {
      cc.messages.push({ role: 'assistant', text: finalText });
      saveStore();
    }
    if (result && result.error) {
      finish(result.error === 'rate_limited' ? 429 : 500, result.error);
      return;
    }
    res.json({
      id: 'chatcmpl-' + jobSeq,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'chatgpt-gateway',
      choices: [{ index: 0, message: { role: 'assistant', content: finalText }, finish_reason: 'stop' }],
    });
  } catch (e) {
    finish(500, String((e && e.message) || e));
  }
});

app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: [
      {
        id: 'chatgpt-gateway',
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'openai',
        permission: [],
        root: 'chatgpt-gateway',
        parent: null,
      },
    ],
  });
});

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

async function start() {
  if (HTTPS) {
    const certFile = path.join(PROFILE, 'selfsigned.crt');
    const keyFile = path.join(PROFILE, 'selfsigned.key');
    try {
      fs.mkdirSync(PROFILE, { recursive: true });
      if (!fs.existsSync(certFile) || !fs.existsSync(keyFile)) {
        const selfsigned = require('selfsigned');
        const altNames = [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          ...lanIps().map((ip) => ({ type: 7, ip })),
        ];
        const pems = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
          keySize: 2048,
          days: 3650,
          algorithm: 'sha256',
          extensions: [
            { name: 'basicConstraints', cA: false },
            { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
            { name: 'extKeyUsage', serverAuth: true },
            { name: 'subjectAltName', altNames },
          ],
        });
        fs.writeFileSync(certFile, pems.cert);
        fs.writeFileSync(keyFile, pems.private);
        console.log('[https] generated a self-signed certificate in', PROFILE);
      }
      const https = require('https');
      const server = https.createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }, app);
      server.listen(HTTPS_PORT, HOST, () => {
        console.log(`HTTPS (voice) listening on https://localhost:${HTTPS_PORT}`);
        if (HOST === '0.0.0.0') {
          console.log(`LAN: ${lanIps().map((ip) => `https://${ip}:${HTTPS_PORT}`).join('  ')}`);
        }
        console.log('[https] first visit: Advanced → Continue. On Windows the server auto-installs the cert into your user store.');
        if (process.platform === 'win32') {
          try {
            const out = execSync(`certutil -user -addstore Root "${certFile}"`, { timeout: 20000, stdio: 'pipe' });
            console.log('[https] certificate trusted in the Windows user store (certutil).');
          } catch (e) {
            const out = String((e && e.stdout) || '');
            if (/already|exists/i.test(out)) {
              console.log('[https] certificate already trusted.');
            } else {
              console.log('[https] could not auto-trust the certificate. Fix (run once, no admin needed):');
              console.log(`  certutil -user -addstore Root "${certFile}"`);
            }
          }
        }
      });
    } catch (e) {
      console.error('[https] failed to start HTTPS listener:', String((e && e.message) || e));
    }
  }
  app.listen(PORT, HOST, () => {
    const ips = lanIps();
    console.log(`ChatGPT Gateway v${APP_VERSION} listening on http://localhost:${PORT}`);
    if (HOST !== '0.0.0.0') {
      console.log(`Bound to ${HOST} only (LAN access disabled)`);
    } else {
      console.log(`LAN: ${ips.map((ip) => `http://${ip}:${PORT}`).join('  ')}`);
    }
    if (AUTH_TOKEN) console.log('AUTH_TOKEN set: all /api endpoints require the master token or a per-client token (/api/register)');
    if (ENCRYPT_KEY) console.log('ENCRYPT_KEY set: chats.json / settings.json are encrypted at rest');
    if (HTTPS) console.log(`HTTPS set: voice (mic) works on https://localhost:${HTTPS_PORT} (and the LAN https URLs)`);
    console.log(`Max prompt: ${MAX_PROMPT.toLocaleString()} characters`);
    if (HEADED) console.log('HEADED mode: a visible browser window will open (solve any captcha once, cookies persist in ./profile)');
    const openUrl = HTTPS
      ? `https://${(ips[0] || 'localhost')}:${HTTPS_PORT}`
      : `http://${(ips[0] || 'localhost')}:${PORT}`;
    openBrowser(openUrl);
  });
}

if (require.main === module) {
  start();
} else {
  module.exports = {
    cleanMessages,
    buildFeed,
    buildAndCompactFeed,
    transcriptText,
    CONTEXT_BUDGET_CHARS,
    MAX_PROMPT,
    settings,
    getChat,
    saveStore,
  };
}
