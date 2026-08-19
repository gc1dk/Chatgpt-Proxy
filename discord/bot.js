// ChatGPT Gateway Discord Bot — free, self-hosted, fully editable.
// Talks to your gateway (default http://localhost:3000/v1) — no OpenAI API keys needed.
//
// Features
//   • /ask, /chat, /reset, /history, /summarize, /persona, /setprompt, /models, /ping, /about, /help
//   • /export — download your conversation (.md or .json), /status — gateway health, /source — the code
//   • Voice: join a voice channel and talk — speech-to-text (local Vosk) → ChatGPT → replies out loud (Edge TTS)
//   • /auto-mod: ChatGPT moderates your server channels (warn / delete / timeout) with a custom policy
//   • /verify: custom one-time-code verification, gates the bot behind a role if you want
//   • Prefix commands mirror the slash commands (!ask, !chat, ...)
//
// Config: copy config.example.json → config.json and fill in the token.
//   npm install   →   npm start
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');

process.env.FFMPEG_PATH = (() => {
  try {
    return require('ffmpeg-static');
  } catch {
    return 'ffmpeg';
  }
})();

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  Events,
} = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  EndBehaviorType,
  getVoiceConnection,
  entersState,
  VoiceConnectionStatus,
  StreamType,
} = require('@discordjs/voice');
let EdgeTTS = null;
try {
  ({ EdgeTTS } = require('node-edge-tts'));
} catch {}

const DATA_FILE = path.join(__dirname, 'data.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const EXAMPLE_FILE = path.join(__dirname, 'config.example.json');

// ---------------------------------------------------------------- config ----

let config = {};
function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    const example = fs.readFileSync(EXAMPLE_FILE, 'utf8');
    fs.writeFileSync(CONFIG_FILE, example);
    console.error('Created config.json — open it and paste your bot token, then run again.');
    process.exit(1);
  }
  config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  if (!config.token || config.token.startsWith('PASTE_')) {
    console.error('config.json: "token" is empty. Set your bot token first (https://discord.com/developers/applications).');
    process.exit(1);
  }
}
loadConfig();

// --------------------------------------------------------------- state ------

let state = { sessions: {}, prompts: {}, mods: {}, pendingVerify: {} };
function loadState() {
  try {
    state = { sessions: {}, prompts: {}, mods: {}, pendingVerify: {}, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
  } catch {}
}
function saveState() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state));
  } catch {}
}
loadState();

const personas = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'personas.json'), 'utf8'));
  } catch {
    return [{ name: 'default', description: 'Helpful assistant', prompt: '' }];
  }
})();

// ----------------------------------------------------------- gateway ------

const GATEWAY = String(config.gatewayUrl || 'http://localhost:3000/v1').replace(/\/+$/, '');
const sessionKeyFor = (userId) => {
  if (config.perUserSessions === false) return 'discord-shared';
  if (!state.sessions[userId]) {
    state.sessions[userId] = 'discord-' + userId + '-' + crypto.randomBytes(4).toString('hex');
    saveState();
  }
  return state.sessions[userId];
};
const systemPromptFor = (userId) => {
  if (state.prompts[userId] && state.prompts[userId].trim()) return state.prompts[userId].trim();
  const persona = personas.find((p) => p.name === state.personas[userId]);
  if (persona && persona.prompt) return persona.prompt.trim();
  return String(config.systemPrompt || '').trim();
};
const buildPrompt = (userId, message) => {
  const sys = systemPromptFor(userId);
  return sys ? `${sys}\n\nUser message: ${message}` : message;
};

let gatewayInflight = 0;
const gatewayQueue = [];
function gatewayChat(sessionKey, prompt, { system = null, images = null } = {}) {
  return new Promise((resolve, reject) => {
    gatewayQueue.push({ sessionKey, prompt, system, images, resolve, reject, attempts: 0 });
    pumpGateway();
  });
}
function retryLimited(job, reject) {
  const attempts = (job.attempts || 0) + 1;
  if (attempts <= 3) {
    job.attempts = attempts;
    const delay = 15000 * attempts;
    console.log(`[bot] rate limited — retry ${attempts}/3 in ${Math.round(delay / 1000)}s`);
    setTimeout(() => {
      gatewayQueue.push(job);
      gatewayInflight--;
      pumpGateway();
    }, delay);
    return;
  }
  gatewayInflight--;
  reject(new Error('ChatGPT is rate-limited right now. Try again in a few minutes.'));
  pumpGateway();
}
function pumpGateway() {
  if (gatewayInflight >= 2 || !gatewayQueue.length) return;
  gatewayInflight++;
  const job = gatewayQueue.shift();
  const { sessionKey, prompt, system, images, resolve, reject } = job;
  const u = new URL(GATEWAY + '/chat/completions');
  const mod = u.protocol === 'https:' ? https : http;
  const userContent =
    images && images.length
      ? [{ type: 'text', text: prompt }, ...images.map((im) => ({ type: 'image_url', image_url: { url: im.dataUrl, name: im.name } }))]
      : prompt;
  const messages = system ? [{ role: 'system', content: system }, { role: 'user', content: userContent }] : [{ role: 'user', content: userContent }];
  const body = JSON.stringify({ model: config.model || 'chatgpt', stream: false, user: sessionKey, messages });
  const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
  if (config.masterToken) headers.Authorization = 'Bearer ' + config.masterToken;
  const req = mod.request(u, { method: 'POST', headers }, (res) => {
    let buf = '';
    res.on('data', (c) => (buf += c));
    res.on('end', () => {
      if (res.statusCode === 429 || /rate_limited|rate limit/i.test(buf)) {
        retryLimited(job, reject);
        return;
      }
      gatewayInflight--;
      try {
        const j = JSON.parse(buf);
        if (j && j.error) {
          reject(new Error((j.error && j.error.message) || 'gateway error'));
        } else if (j && j.choices && j.choices[0] && j.choices[0].message && typeof j.choices[0].message.content === 'string') {
          resolve(j.choices[0].message.content);
        } else {
          reject(new Error('unexpected gateway response'));
        }
      } catch (e) {
        reject(e);
      }
      pumpGateway();
    });
  });
  req.on('error', (e) => {
    gatewayInflight--;
    reject(e);
    pumpGateway();
  });
  req.setTimeout(120000, () => req.destroy(new Error('gateway timeout')));
  req.write(body);
  req.end();
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const MAX_BOT_IMAGES = 4;
const MAX_BOT_IMAGE_BYTES = 6 * 1024 * 1024;

// Download a Discord attachment into { name, mime, dataUrl }. Returns null on
// non-images, oversized files or download failures.
function attachmentToImage(att) {
  return new Promise((resolve) => {
    if (!att || !att.url) return resolve(null);
    if (!/^image\//.test(String(att.contentType || ''))) return resolve(null);
    if (att.size && att.size > MAX_BOT_IMAGE_BYTES) return resolve(null);
    const mod = /^https:/.test(att.url) ? https : http;
    mod
      .get(att.url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return attachmentToImage({ ...att, url: res.headers.location }).then(resolve);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        const chunks = [];
        let total = 0;
        res.on('data', (c) => {
          total += c.length;
          if (total > MAX_BOT_IMAGE_BYTES) {
            res.destroy();
            return resolve(null);
          }
          chunks.push(c);
        });
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          if (!buf.length) return resolve(null);
          const mime = String(res.headers['content-type'] || att.contentType || 'image/png').split(';')[0].toLowerCase();
          if (!/^image\//.test(mime)) return resolve(null);
          resolve({ name: att.name || ('image.' + (mime.split('/')[1] || 'png')), mime, dataUrl: 'data:' + mime + ';base64,' + buf.toString('base64') });
        });
        res.on('error', () => resolve(null));
      })
      .on('error', () => resolve(null))
      .setTimeout(20000, () => {
        try { mod.get; } catch {}
        resolve(null);
      });
  });
}

async function imagesOf(attachments) {
  if (!attachments) return [];
  const list = Array.isArray(attachments) ? attachments : Array.from(attachments.values ? attachments.values() : []);
  const out = [];
  for (const att of list) {
    if (out.length >= MAX_BOT_IMAGES) break;
    const im = await attachmentToImage(att);
    if (im) out.push(im);
  }
  return out;
}

function gatewayBase() {
  return GATEWAY.replace(/\/+$/, '').replace(/\/v1$/, '');
}
function chatIdFor(sessionKey) {
  return 'api-' + crypto.createHash('sha256').update(sessionKey).digest('hex').slice(0, 24);
}
function gatewayGet(pathname, { timeout = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(pathname, gatewayBase());
    const mod = u.protocol === 'https:' ? https : http;
    const headers = {};
    if (config.masterToken) headers.Authorization = 'Bearer ' + config.masterToken;
    const req = mod.get(u, { headers }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => req.destroy(new Error('gateway timeout')));
  });
}

// ------------------------------------------------------------ verification --

function memberHas(member, names) {
  if (!member || !Array.isArray(names) || !names.length) return false;
  return member.roles.cache.some((r) => names.includes(r.id) || names.includes(r.name));
}
function isVerified(member) {
  if (!config.requireVerification) return true;
  return memberHas(member, [config.verifiedRoleName]);
}
function hasAllowedRole(member) {
  if (!config.allowedRoles || !config.allowedRoles.length) return true;
  return memberHas(member, config.allowedRoles);
}
function grantVerifiedRole(guild, member) {
  const role =
    guild.roles.cache.find((r) => r.name === config.verifiedRoleName) || guild.roles.cache.get(config.verifiedRoleName);
  if (!role) return Promise.reject(new Error(`role "${config.verifiedRoleName}" not found in this server`));
  return member.roles.add(role);
}
async function doVerify(interactionOrMsg, code) {
  const user = interactionOrMsg.user || interactionOrMsg.author;
  const guild = interactionOrMsg.guild;
  const member = interactionOrMsg.member || (guild && guild.members.cache.get(user.id));
  const reply = (content) => (interactionOrMsg.deferred || interactionOrMsg.replied ? interactionOrMsg.editReply(content) : interactionOrMsg.reply(content));

  if (!guild || !member) return reply({ content: 'Run /verify inside your server.', ephemeral: true });

  if (!code) {
    const pending = state.pendingVerify[user.id];
    if (pending && Date.now() - pending.ts < 60000) {
      return reply({ content: 'A code was already sent recently. Reply with /verify <code>.', ephemeral: true });
    }
    const newCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    state.pendingVerify[user.id] = { code: newCode, ts: Date.now() };
    saveState();
    try {
      await user.send(`Your verification code for **${guild.name}** is: **${newCode}**\nUse /verify ${newCode} to finish.`);
      return reply({ content: `Sent you a DM with your code. (Fallback if no DM: ${newCode})`, ephemeral: true });
    } catch {
      return reply({ content: `Could not DM you (DMs may be closed). Your code: **${newCode}** — reply with /verify ${newCode}.`, ephemeral: true });
    }
  }

  const pending = state.pendingVerify[user.id];
  if (!pending || pending.code !== code.toUpperCase().trim() || Date.now() - pending.ts > 10 * 60000) {
    return reply({ content: 'That code is invalid or expired. Run /verify for a new one.', ephemeral: true });
  }
  delete state.pendingVerify[user.id];
  saveState();
  try {
    await grantVerifiedRole(guild, member);
  } catch (e) {
    return reply({ content: `Could not grant the role: ${e.message}`, ephemeral: true });
  }
  return reply({ content: `Verified. You now have the **${config.verifiedRoleName}** role.`, ephemeral: true });
}

// ---------------------------------------------------------------- voice ----

const vosk = require('vosk');
vosk.setLogLevel(-1);
const speechQueues = new Map(); // guildId -> [text chunks]
const speechBusy = new Map(); // guildId -> bool
const listeners = new Map(); // guildId -> { userIds: Set, transcribing: Set }
let voskModel = null;
let modelError = null;
let modelPromise = null;

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http;
    const file = fs.createWriteStream(dest);
    const req = mod.get(url, (res) => {
      if (res.statusCode >= 400) {
        reject(new Error('download failed: HTTP ' + res.statusCode));
        res.resume();
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    });
    req.on('error', reject);
    file.on('error', reject);
  });
}

function ensureVoskModel() {
  if (voskModel) return Promise.resolve(voskModel);
  if (modelPromise) return modelPromise;
  if (modelError) return Promise.reject(modelError);
  const dir = path.resolve(__dirname, config.voice && config.voice.modelDir ? config.voice.modelDir : './models/vosk');
  modelPromise = (async () => {
    fs.mkdirSync(dir, { recursive: true });
    const find = () => fs.existsSync(dir) && fs.readdirSync(dir).find((n) => n.startsWith('vosk-model'));
    if (find()) {
      voskModel = new vosk.Model(path.join(dir, find()));
      return voskModel;
    }
    const url = config.voice.modelUrl || 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip';
    const zip = path.join(dir, 'vosk-model.zip');
    console.log('[bot] downloading speech model (~40 MB) — one time…');
    await downloadFile(url, zip);
    console.log('[bot] extracting speech model…');
    const unzipper = require('unzipper');
    await new Promise((res, rej) => {
      fs.createReadStream(zip)
        .pipe(unzipper.Extract({ path: dir }))
        .on('close', res)
        .on('error', rej);
    });
    fs.rmSync(zip, { force: true });
    if (!find()) throw new Error('model extraction failed');
    voskModel = new vosk.Model(path.join(dir, find()));
    console.log('[bot] speech model ready.');
    return voskModel;
  })();
  modelPromise.catch((e) => {
    modelError = e;
    console.error('[bot] voice disabled:', String((e && e.message) || e));
  });
  return modelPromise;
}

function stripForSpeech(text) {
  return String(text)
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/[*_~#|>]/g, '')
    .replace(/<a?:\w+:\d+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function splitForSpeech(text, max) {
  const out = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('. ', max);
    if (cut < max / 2) cut = rest.lastIndexOf('\n', max);
    if (cut < max / 2) cut = max;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}
function enqueueSpeech(guildId, text) {
  const conn = getVoiceConnection(guildId);
  if (!conn || !text) return;
  const queue = speechQueues.get(guildId) || [];
  for (const chunk of splitForSpeech(stripForSpeech(text), 1400)) queue.push(chunk);
  speechQueues.set(guildId, queue);
  pumpSpeech(guildId);
}
async function pumpSpeech(guildId) {
  const conn = getVoiceConnection(guildId);
  if (!conn) {
    speechQueues.delete(guildId);
    return;
  }
  if (speechBusy.get(guildId)) return;
  const queue = speechQueues.get(guildId) || [];
  if (!queue.length) return;
  speechBusy.set(guildId, true);
  const text = queue.shift();
  const player = conn.state.subscription ? conn.state.subscription.player : null;
  try {
    if (!EdgeTTS) throw new Error('node-edge-tts not installed');
    const voiceName = config.voice.ttsVoice || 'en-US-AriaNeural';
    const file = path.join(__dirname, 'tts-' + crypto.randomBytes(4).toString('hex') + '.mp3');
    const tts = new EdgeTTS({
      voice: voiceName,
      lang: voiceName.split('-').slice(0, 2).join('-'),
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
      timeout: 20000,
    });
    await tts.ttsPromise(text, file);
    const resource = createAudioResource(file, { inputType: StreamType.Arbitrary });
    resource.playStream.on('close', () => {
      try { fs.rmSync(file, { force: true }); } catch {}
    });
    if (player && player.state.status === AudioPlayerStatus.Playing) {
      await new Promise((r) => player.once(AudioPlayerStatus.Idle, r));
    }
    if (player) player.play(resource);
    await new Promise((r) => {
      const t = setTimeout(r, 60000);
      resource.playStream.on('close', () => {
        clearTimeout(t);
        r();
      });
    });
  } catch (e) {
    console.error('[bot] tts failed:', String((e && e.message) || e));
  }
  speechBusy.delete(guildId);
  if (queue.length) setTimeout(() => pumpSpeech(guildId), 300);
  else speechQueues.delete(guildId);
}

function ensureListening(connection, guildId) {
  const entry = listeners.get(guildId) || { userIds: new Set(), transcribing: new Set() };
  listeners.set(guildId, entry);
  const channel = connection.joinConfig.channelId;
  for (const [, member] of connection.channel ? connection.channel.members : []) {
    if (!member.user.bot && member.id !== client.user.id && !entry.userIds.has(member.id)) {
      entry.userIds.add(member.id);
      startListening(guildId, connection, member.id);
    }
  }
  void channel;
}
function startListening(guildId, connection, userId) {
  if (config.voice.enabled === false) return;
  const entry = listeners.get(guildId);
  if (!entry || entry.transcribing.has(userId)) return;
  entry.transcribing.add(userId);
  let stream;
  try {
    stream = connection.receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 600 },
    });
  } catch (e) {
    entry.transcribing.delete(userId);
    return;
  }
  const transcription = transcribe(stream);
  const capTimer = setTimeout(() => {
    try { stream.destroy(); } catch {}
  }, 60000);
  transcription
    .then((text) => {
      if (!text) return;
      console.log(`[bot] heard from ${userId}: ${text.slice(0, 120)}`);
      return gatewayChat(sessionKeyFor(userId), buildPrompt(userId, text))
        .then((reply) => {
          const clean = String(reply || '').trim();
          if (!clean) return;
          const chan = connection.channel;
          if (chan && chan.send) chan.send(`<@${userId}> said: **${text.slice(0, 500)}**`).catch(() => {});
          if (config.voice.speakReplies !== false) enqueueSpeech(guildId, clean);
        })
        .catch((e) => {
          enqueueSpeech(guildId, `Sorry, I could not reach the gateway: ${String((e && e.message) || e)}`);
        });
    })
    .catch((e) => console.error('[bot] stt failed:', String((e && e.message) || e)))
    .finally(() => {
      clearTimeout(capTimer);
      try { stream.destroy(); } catch {}
      const entry2 = listeners.get(guildId);
      if (entry2) entry2.transcribing.delete(userId);
    });
}

function transcribe(stream) {
  return ensureVoskModel().then((model) => {
    const recognizer = new vosk.Recognizer({ model, sampleRate: 16000 });
    const ffmpegPath = process.env.FFMPEG_PATH;
    const ff = spawn(ffmpegPath, ['-loglevel', 'error', '-i', 'pipe:0', '-ar', '16000', '-ac', '1', '-f', 's16le', 'pipe:1']);
    let parts = [];
    ff.stdout.on('data', (b) => {
      try {
        if (recognizer.acceptWaveform(b)) {
          const t = (recognizer.result().text || '').trim();
          if (t) parts.push(t);
        }
      } catch {}
    });
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (err) => {
        if (settled) return;
        settled = true;
        try { ff.stdin.end(); } catch {}
        let tail = '';
        try { tail = (recognizer.finalResult().text || '').trim(); } catch {}
        try { recognizer.free(); } catch {}
        if (tail) parts.push(tail);
        if (err) reject(err);
        else resolve(parts.join(' ').trim());
      };
      stream.pipe(ff.stdin);
      stream.on('error', (e) => done(e));
      ff.on('error', (e) => done(e));
      ff.on('close', () => done());
      stream.on('end', () => {
        setTimeout(() => done(), 500);
      });
      const fallback = setTimeout(() => done(), 5000);
      fallback.unref();
    });
  });
}

// ---------------------------------------------------------------- auto-mod --

function modState(guildId) {
  if (!state.mods[guildId]) {
    const defaults = config.autoMod || {};
    state.mods[guildId] = {
      enabled: !!defaults.enabledByDefault,
      channels: Array.isArray(defaults.channels) ? defaults.channels : [],
      ignoreRoles: Array.isArray(defaults.ignoreRoles) ? defaults.ignoreRoles : [],
      action: defaults.action || 'warn',
      deleteOnViolation: defaults.deleteOnViolation !== false,
      timeoutMs: defaults.timeoutMs || 600000,
      reportChannel: defaults.reportChannel || '',
      policy: defaults.policy || '',
      checks: 0,
      actions: 0,
    };
    saveState();
  }
  return state.mods[guildId];
}
const modRate = new Map();
function scheduleModCheck(message) {
  const g = modState(message.guild.id);
  if (!g.enabled) return;
  const now = Date.now();
  const last = modRate.get(message.guild.id) || 0;
  if (now - last < 1500) return;
  modRate.set(message.guild.id, now);
  runModCheck(message).catch((e) => console.error('[bot] auto-mod error:', String((e && e.message) || e)));
}
async function runModCheck(message) {
  const g = modState(message.guild.id);
  if (!g.enabled) return;
  const content = String(message.content || '').trim();
  if (content.length < 2 || content.length > 3000) return;
  if (message.author && message.author.bot) return;
  if (g.channels.length && !g.channels.includes(message.channel.id)) return;
  const member = message.member;
  if (member) {
    if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
    if (g.ignoreRoles.length && member.roles.cache.some((r) => g.ignoreRoles.includes(r.id) || g.ignoreRoles.includes(r.name))) return;
  }
  g.checks++;
  const policy = g.policy || (config.autoMod && config.autoMod.policy) || '';
  const prompt =
    `You are an auto-moderator for the Discord server "${message.guild.name}".\n` +
    `Policy:\n${policy}\n\n` +
    `Judge this message from user "${message.author.tag}":\n"${content.slice(0, 1500)}"\n\n` +
    `Reply with ONLY a JSON object, no other text:\n` +
    `{"violation": true or false, "severity": 1-5, "reason": "short reason", "action": "warn" or "delete" or "timeout"}`;
  const raw = await gatewayChat('automod-' + message.guild.id, prompt, { system: 'You are a strict but fair Discord auto-moderator. You reply with JSON only.' });
  const verdict = parseVerdict(raw);
  if (!verdict || !verdict.violation || (verdict.severity || 0) < 2) {
    saveState();
    return;
  }
  const reason = String(verdict.reason || '').slice(0, 300);
  let taken = 'none';
  const canDelete = message.deletable && g.deleteOnViolation && (verdict.action === 'delete' || verdict.severity >= 3);
  const canTimeout = member && g.timeoutMs > 0 && (verdict.action === 'timeout' || verdict.severity >= 4);
  if (canDelete) {
    await message.delete().catch(() => {});
    taken = 'deleted';
  } else if (canTimeout) {
    await member.timeout(g.timeoutMs, 'Auto-mod: ' + reason).catch(() => {});
    taken = 'timed out';
  } else {
    taken = 'warned';
  }
  g.actions++;
  saveState();
  if (message.author && message.author.send) {
    message.author.send(`Your message in ${message.guild.name} was flagged by auto-mod (${taken}): ${reason}\n\`${content.slice(0, 300)}\``).catch(() => {});
  }
  const report = g.reportChannel || (config.autoMod && config.autoMod.reportChannel) || '';
  if (report) {
    const channel =
      message.guild.channels.cache.get(report) || message.guild.channels.cache.find((c) => c.name === report);
    if (channel) {
      channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xe74c3c)
              .setTitle('Auto-mod action')
              .setDescription(`**User:** ${message.author}\n**Channel:** ${message.channel}\n**Action:** ${taken}\n**Severity:** ${verdict.severity}/5\n**Reason:** ${reason}\n**Message:** ${content.slice(0, 1000)}`),
          ],
        })
        .catch(() => {});
    }
  }
}
function parseVerdict(raw) {
  const text = String(raw || '').trim();
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]);
      if (typeof j.violation === 'boolean') return j;
    }
  } catch {}
  const violation = /"violation"\s*:\s*(true)/i.test(text);
  const severity = parseInt((text.match(/"severity"\s*:\s*(\d)/i) || [])[1] || '2', 10);
  const action = (text.match(/"action"\s*:\s*"(\w+)"/i) || [])[1] || 'warn';
  const reason = (text.match(/"reason"\s*:\s*"([^"]+)"/i) || [])[1] || 'flagged by auto-mod';
  return { violation, severity, action, reason };
}

// ---------------------------------------------------------------- replies ---

const mention = (m) => `<@${m.author ? m.author.id : m.user.id}>`;
function chunkReply(text, max = 1900) {
  const out = [];
  let rest = String(text || '');
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max / 2) cut = rest.lastIndexOf('. ', max);
    if (cut < max / 2) cut = max;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}
async function replyText(target, text) {
  const chunks = chunkReply(text);
  for (const c of chunks) {
    if (target.deferred || target.replied) await target.editReply(c);
    else await target.reply(c);
    target.deferred = true;
  }
}
async function speakIfInVoice(guildId, userId, text) {
  if (config.voice.speakReplies === false) return;
  const conn = getVoiceConnection(guildId);
  if (!conn) return;
  const member = conn.channel && conn.channel.members.get(userId);
  if (member) enqueueSpeech(guildId, text);
}

async function runChat(target, user, message, { stateless = false, images = null } = {}) {
  const key = stateless ? 'discord-' + crypto.randomBytes(4).toString('hex') : sessionKeyFor(user.id);
  const prompt = buildPrompt(user.id, String(message || '').slice(0, 20000));
  if (typeof target.deferReply === 'function' && !target.deferred && !target.replied) {
    await target.deferReply({ ephemeral: false }).catch(() => {});
  }
  try {
    const reply = await gatewayChat(key, prompt, { images });
    const text = reply.trim() || '_empty reply_';
    await replyText(target, text);
    if (!stateless) speakIfInVoice(target.guild && target.guild.id, user.id, text);
  } catch (e) {
    await replyText(target, `Gateway error: ${String((e && e.message) || e)}`);
  }
}

// -------------------------------------------------------------- commands ---

const cmdDefs = [
  new SlashCommandBuilder().setName('ask').setDescription('One-shot question (no conversation memory)').addStringOption((o) => o.setName('prompt').setDescription('Your question').setRequired(true)).addAttachmentOption((o) => o.setName('image').setDescription('Optional image to attach').setRequired(false)),
  new SlashCommandBuilder().setName('chat').setDescription('Chat with the bot (keeps your conversation)').addStringOption((o) => o.setName('message').setDescription('Your message').setRequired(true)).addAttachmentOption((o) => o.setName('image').setDescription('Optional image to attach').setRequired(false)),
  new SlashCommandBuilder().setName('reset').setDescription('Forget your conversation and start fresh'),
  new SlashCommandBuilder().setName('history').setDescription('Show the last messages of your conversation').addIntegerOption((o) => o.setName('limit').setDescription('How many messages (default 10)').setMinValue(1).setMaxValue(40)),
  new SlashCommandBuilder().setName('summarize').setDescription('Ask ChatGPT to summarize your conversation so far'),
  new SlashCommandBuilder().setName('persona').setDescription('List or switch persona').addStringOption((o) => o.setName('name').setDescription('Persona name (empty to list)')),
  new SlashCommandBuilder().setName('setprompt').setDescription('Set a custom system prompt for yourself (use "clear" to reset)').addStringOption((o) => o.setName('text').setDescription('The system prompt, or "clear"')),
  new SlashCommandBuilder().setName('models').setDescription('List models served by the gateway'),
  new SlashCommandBuilder().setName('ping').setDescription('Check latency'),
  new SlashCommandBuilder().setName('export').setDescription('Download your conversation as a Markdown file').addStringOption((o) => o.setName('format').setDescription('md (default) or json').addChoices({ name: 'Markdown', value: 'md' }, { name: 'JSON', value: 'json' })),
  new SlashCommandBuilder().setName('status').setDescription('Gateway health, latency and queue'),
  new SlashCommandBuilder().setName('source').setDescription('Get the source code on GitHub'),
  new SlashCommandBuilder().setName('verify').setDescription('Verify yourself to unlock the bot').addStringOption((o) => o.setName('code').setDescription('The code you received in DM')),
  new SlashCommandBuilder().setName('voice').setDescription('Voice chat controls').addStringOption((o) => o.setName('action').setDescription('join / leave / status').setRequired(true)),
  new SlashCommandBuilder().setName('auto-mod').setDescription('Toggle ChatGPT auto-moderation for this server').addStringOption((o) => o.setName('mode').setDescription('on / off / status / all channels').setRequired(true).addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' }, { name: 'status', value: 'status' }, { name: 'all channels', value: 'all' })).addStringOption((o) => o.setName('policy').setDescription('Set a custom moderation policy (or "keep")')).addStringOption((o) => o.setName('action').setDescription('Default action: warn / delete / timeout')).addChannelOption((o) => o.setName('channel').setDescription('Only moderate this channel')),
  new SlashCommandBuilder().setName('about').setDescription('About this bot'),
  new SlashCommandBuilder().setName('help').setDescription('List all commands'),
];

async function handleAutoMod(target, member, guild, opts) {
  const m = modState(guild.id);
  const reply = (content) => (target.deferred ? target.editReply(content) : target.reply(content));
  if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return reply({ content: 'You need **Manage Messages** permission to change auto-mod.', ephemeral: true });
  }
  if (opts.mode === 'status') {
    return reply({
      embeds: [
        new EmbedBuilder()
          .setColor(m.enabled ? 0x2ecc71 : 0x95a5a6)
          .setTitle('Auto-mod: ' + (m.enabled ? 'ON' : 'OFF'))
          .setDescription(
            `**Channels:** ${m.channels.length ? m.channels.map((c) => `<#${c}>`).join(', ') : 'all text channels'}\n` +
              `**Default action:** ${m.action}\n**Delete messages:** ${m.deleteOnViolation}\n**Timeout:** ${m.timeoutMs ? Math.round(m.timeoutMs / 60000) + ' min' : 'off'}\n` +
              `**Checks run:** ${m.checks}\n**Actions taken:** ${m.actions}\n\n**Policy:**\n${m.policy || '(default)'}`
          ),
      ],
    });
  }
  if (opts.mode === 'on') m.enabled = true;
  if (opts.mode === 'off') m.enabled = false;
  if (opts.mode === 'all') m.channels = [];
  if (opts.policy && opts.policy.toLowerCase() !== 'keep') m.policy = opts.policy.slice(0, 2000);
  if (opts.action && ['warn', 'delete', 'timeout'].includes(opts.action)) m.action = opts.action;
  if (opts.channel === 'all') m.channels = [];
  else if (opts.channel && opts.channel.id) m.channels = [opts.channel.id];
  saveState();
  return reply({ content: `Auto-mod is now **${m.enabled ? 'ON' : 'OFF'}** for this server.` });
}

// ------------------------------------------------------------- the client --

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`[bot] logged in as ${c.user.tag} (${c.user.id})`);
  console.log(`[bot] gateway: ${GATEWAY}`);
  if (config.botName && config.botName !== 'ChatGPT Bot') c.user.setUsername(config.botName).catch(() => {});
  c.user.setActivity('/help', { type: 3 }).catch(() => {});
  const cmds = cmdDefs.map((d) => d.toJSON());
  try {
    if (config.guildId) {
      const guild = c.guilds.cache.get(config.guildId);
      if (guild) await guild.commands.set(cmds);
    } else {
      await c.application.commands.set(cmds);
    }
    console.log('[bot] slash commands registered.');
  } catch (e) {
    console.error('[bot] could not register slash commands:', String((e && e.message) || e));
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, user, guild, member } = interaction;
  const opts = {};
  for (const o of interaction.options.data) {
    if (o.name === 'channel' && o.channel) opts.channel = o.channel;
    else opts[o.name] = o.value;
  }
  if (!isVerified(member) || !hasAllowedRole(member)) {
    const msg = isVerified(member)
      ? 'This bot is restricted to specific roles in this server.'
      : `You need the **${config.verifiedRoleName}** role to use this bot. Run /verify to get it.`;
    return interaction.reply({ content: msg, ephemeral: true });
  }
  try {
    switch (commandName) {
      case 'ask': {
        const imgs = await imagesOf(opts.image ? [opts.image] : null);
        return runChat(interaction, user, opts.prompt, { stateless: true, images: imgs });
      }
      case 'chat': {
        const imgs = await imagesOf(opts.image ? [opts.image] : null);
        return runChat(interaction, user, opts.message, { images: imgs });
      }
      case 'reset': {
        state.sessions[user.id] = 'discord-' + user.id + '-' + crypto.randomBytes(4).toString('hex');
        saveState();
        return interaction.reply({ content: 'Conversation reset. Starting fresh.', ephemeral: false });
      }
      case 'history': {
        if (!config.perUserSessions) return interaction.reply({ content: 'Sessions are shared in this bot\'s config (perUserSessions=false).', ephemeral: true });
        const limit = opts.limit || 10;
        const sessionKey = sessionKeyFor(user.id);
        const sys = systemPromptFor(user.id);
        let prompt = `List the last ${limit} messages of this conversation (user/assistant). If there are none, say "No history yet." Keep them verbatim.`;
        const reply = await gatewayChat(sessionKey, sys ? `${sys}\n\n${prompt}` : prompt);
        return replyText(interaction, reply.trim() || '_empty_');
      }
      case 'summarize':
        return runChat(interaction, user, 'Summarize our entire conversation so far in a few clear paragraphs. List the main topics, decisions and open questions.');
      case 'persona': {
        if (!opts.name) {
          const list = personas.map((p) => `**${p.name}** — ${p.description}`).join('\n');
          return interaction.reply({ content: `Personas:\n${list}`, ephemeral: true });
        }
        const p = personas.find((x) => x.name.toLowerCase() === opts.name.toLowerCase());
        if (!p) return interaction.reply({ content: `Unknown persona "${opts.name}".`, ephemeral: true });
        state.personas = state.personas || {};
        state.personas[user.id] = p.name;
        delete state.prompts[user.id];
        saveState();
        return interaction.reply({ content: `Persona switched to **${p.name}**. (Reset with /reset to drop history.)` });
      }
      case 'setprompt': {
        const text = String(opts.text || '').trim();
        if (text.toLowerCase() === 'clear') {
          delete state.prompts[user.id];
          saveState();
          return interaction.reply({ content: 'Custom prompt cleared.', ephemeral: true });
        }
        state.prompts[user.id] = text.slice(0, 4000);
        saveState();
        return interaction.reply({ content: 'Custom system prompt set. It applies from your next message.', ephemeral: true });
      }
      case 'models': {
        const u = new URL(GATEWAY + '/models');
        const mod = u.protocol === 'https:' ? https : http;
        const headers = {};
        if (config.masterToken) headers.Authorization = 'Bearer ' + config.masterToken;
        mod.get(u, { headers }, (res) => {
          let buf = '';
          res.on('data', (c) => (buf += c));
          res.on('end', () => {
            try {
              const j = JSON.parse(buf);
              const names = (j.data || []).map((m) => `**${m.id}**`).join('\n') || '(none)';
              interaction.reply({ content: `Models served by the gateway:\n${names}`, ephemeral: true }).catch(() => {});
            } catch {
              interaction.reply({ content: 'Could not reach the gateway.', ephemeral: true }).catch(() => {});
            }
          });
        }).on('error', () => interaction.reply({ content: 'Could not reach the gateway.', ephemeral: true }).catch(() => {}));
        return;
      }
      case 'ping': {
        const t0 = Date.now();
        await gatewayChat('ping-' + user.id, 'Reply with the single word: pong');
        return interaction.reply({ content: `Pong — gateway round-trip **${Date.now() - t0} ms**.` });
      }
      case 'export': {
        const format = opts.format === 'json' ? 'json' : 'md';
        const chatId = chatIdFor(sessionKeyFor(user.id));
        const { status, body } = await gatewayGet('/api/export?chatId=' + encodeURIComponent(chatId) + '&format=' + format);
        if (status !== 200) {
          const j = safeParse(body);
          return interaction.reply({ content: 'Could not export — ' + ((j && j.error) || ('gateway returned ' + status)) + '. Chat with me first (/chat).', ephemeral: true });
        }
        return interaction.reply({ content: 'Here is your conversation:', files: [{ attachment: Buffer.from(body), name: 'conversation.' + format }] });
      }
      case 'status': {
        const t0 = Date.now();
        const { status, body } = await gatewayGet('/v1/models');
        const latency = Date.now() - t0;
        const j = safeParse(body);
        const models = j && Array.isArray(j.models) ? j.models : [];
        const up = process.uptime();
        const h = Math.floor(up / 3600), m = Math.floor((up % 3600) / 60);
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(status === 200 ? 0x2ecc71 : 0xe74c3c)
              .setTitle('Gateway status')
              .setDescription(
                `**Endpoint:** \`${gatewayBase()}\`\n` +
                  `**HTTP:** ${status} · **Latency:** ${latency} ms\n` +
                  `**Models:** ${models.length ? models.map((x) => x.id || x).join(', ') : '(none — is the gateway running?)'}\n` +
                  `**Bot uptime:** ${h}h ${m}m\n\n` +
                  (status !== 200 ? 'Gateway unreachable — start it with run.bat, then check the tunnel.' : '')
              ),
          ],
        });
      }
      case 'source':
        return interaction.reply({ content: '**Source code:** https://github.com/gc1dk/Chatgpt-Proxy\nEverything is self-hosted, free, and fully editable. Give it a ⭐ if you like it!' });
      case 'verify':
        return doVerify(interaction, opts.code);
      case 'voice': {
        const action = String(opts.action || '').toLowerCase();
        if (action === 'leave') {
          const conn = getVoiceConnection(guild.id);
          if (conn) {
            conn.destroy();
            listeners.delete(guild.id);
            speechQueues.delete(guild.id);
          }
          return interaction.reply({ content: 'Left the voice channel.', ephemeral: true });
        }
        if (action === 'status') {
          const conn = getVoiceConnection(guild.id);
          const vc = conn ? (conn.channel ? conn.channel.name : 'connected') : 'not in voice';
          const entry = listeners.get(guild.id);
          const model = voskModel || (modelPromise ? 'downloading…' : 'not loaded yet');
          return interaction.reply({ content: `**Voice:** ${vc}\n**Listening to:** ${entry ? [...entry.transcribing].length : 0} speaker(s)\n**Speech model:** ${model}\n**TTS voice:** ${config.voice.ttsVoice || 'en-US-AriaNeural'}`, ephemeral: true });
        }
        if (action === 'join') {
          if (config.voice.enabled === false) return interaction.reply({ content: 'Voice is disabled in config (voice.enabled=false).', ephemeral: true });
          const channel = (config.voice.channelId && guild.channels.cache.get(config.voice.channelId)) || member.voice.channel;
          if (!channel) return interaction.reply({ content: 'Join a voice channel first (or set voice.channelId in config).', ephemeral: true });
          const existing = getVoiceConnection(guild.id);
          if (existing) {
            if (existing.joinConfig.channelId !== channel.id) existing.destroy();
            else return interaction.reply({ content: `Already in **${channel.name}**.`, ephemeral: true });
          }
          const conn = joinVoiceChannel({ channelId: channel.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: false, selfMute: false });
          try {
            await entersState(conn, VoiceConnectionStatus.Ready, 20000);
          } catch {
            conn.destroy();
            return interaction.reply({ content: 'Could not join the voice channel (network issue?).', ephemeral: true });
          }
          const player = createAudioPlayer();
          conn.subscribe(player);
          ensureListening(conn, guild.id);
          console.log('[bot] voice listening in', channel.name);
          return interaction.reply({ content: `Joined **${channel.name}**. Speak — I will answer out loud. The speech model may download on first use (~40 MB).`, ephemeral: true });
        }
        return interaction.reply({ content: 'Use /voice join | leave | status', ephemeral: true });
      }
      case 'auto-mod':
        return handleAutoMod(interaction, member, guild, opts);
      case 'about': {
        const embed = new EmbedBuilder()
          .setColor(0x10a37f)
          .setTitle(config.botName || 'ChatGPT Bot')
          .setDescription(
            `Free Discord bot powered by the self-hosted **ChatGPT Gateway** (${GATEWAY}) — no API keys.\n\n` +
              `**Text:** /chat, /ask, /persona, /setprompt, /summarize, /history\n` +
              `**Voice:** /voice join — talk, it answers out loud\n` +
              `**Moderation:** /auto-mod on — ChatGPT moderates channels\n` +
              `**Verification:** /verify — one-time-code role gate\n` +
              `**Tools:** /export your chat, /status gateway health, /source the code\n` +
              `Prefix commands also work: ${config.prefix || '!'}chat, ${config.prefix || '!'}ask, …`
          );
        return interaction.reply({ embeds: [embed] });
      }
      case 'help':
        return interaction.reply({
          embeds: [
            new EmbedBuilder().setColor(0x10a37f).setTitle('Commands').setDescription(
              cmdDefs.map((d) => `**/${d.name}** — ${d.description}`).join('\n')
            ),
          ],
          ephemeral: false,
        });
    }
  } catch (e) {
    console.error('[bot] interaction error:', String((e && e.message) || e));
    if (!interaction.replied && !interaction.deferred) interaction.reply({ content: 'Something went wrong: ' + String((e && e.message) || e), ephemeral: true }).catch(() => {});
  }
});

// prefix commands
const PREFIX = config.prefix || '!';
const prefixAliases = {
  ask: 'ask', chat: 'chat', reset: 'reset', history: 'history', summarize: 'summarize',
  persona: 'persona', setprompt: 'setprompt', models: 'models', ping: 'ping', verify: 'verify',
  about: 'about', help: 'help', 'auto-mod': 'auto-mod', voice: 'voice',
  export: 'export', status: 'status', source: 'source',
};
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || message.guild === null) return;
  if (message.content.startsWith(PREFIX)) {
    const parts = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const name = prefixAliases[parts[0].toLowerCase()];
    if (!name) return;
    const rest = message.content.slice(PREFIX.length + parts[0].length).trim();
    const fake = {
      user: message.author,
      member: message.member,
      guild: message.guild,
      channel: message.channel,
      deferred: false,
      replied: false,
      reply: (o) => message.reply(typeof o === 'string' ? o : (o.content || o.embeds ? { content: o.content, embeds: o.embeds, allowedMentions: { repliedUser: false } } : o)),
      editReply: (o) => message.channel.send(typeof o === 'string' ? o : o.content || o.embeds ? { content: o.content, embeds: o.embeds } : o),
      options: { data: [] },
    };
    if (!isVerified(message.member) || !hasAllowedRole(message.member)) {
      return message.reply(isVerified(message.member) ? 'This bot is restricted to specific roles in this server.' : `You need the **${config.verifiedRoleName}** role. Run /verify to get it.`);
    }
    const opts = {};
    switch (name) {
      case 'ask': {
        const imgs = await imagesOf(message.attachments);
        return runChat(fake, message.author, rest, { stateless: true, images: imgs });
      }
      case 'chat': {
        const imgs = await imagesOf(message.attachments);
        return runChat(fake, message.author, rest, { images: imgs });
      }
      case 'reset': {
        state.sessions[message.author.id] = 'discord-' + message.author.id + '-' + crypto.randomBytes(4).toString('hex');
        saveState();
        return message.reply('Conversation reset.');
      }
      case 'history': {
        const limit = parseInt(rest.split(/\s+/)[0], 10) || 10;
        opts.limit = limit;
        const reply = await gatewayChat(sessionKeyFor(message.author.id), buildPrompt(message.author.id, `List the last ${limit} messages of this conversation (user/assistant). If there are none, say "No history yet." Keep them verbatim.`));
        return replyText(fake, reply.trim() || '_empty_');
      }
      case 'summarize': return runChat(fake, message.author, 'Summarize our entire conversation so far in a few clear paragraphs. List the main topics, decisions and open questions.');
      case 'persona': {
        const name = rest.trim();
        if (!name) return message.reply(`Personas:\n` + personas.map((p) => `**${p.name}** — ${p.description}`).join('\n'));
        const p = personas.find((x) => x.name.toLowerCase() === name.toLowerCase());
        if (!p) return message.reply(`Unknown persona "${name}".`);
        state.personas = state.personas || {};
        state.personas[message.author.id] = p.name;
        delete state.prompts[message.author.id];
        saveState();
        return message.reply(`Persona switched to **${p.name}**.`);
      }
      case 'setprompt': {
        const text = rest.slice(0, 4000);
        if (text.toLowerCase() === 'clear') { delete state.prompts[message.author.id]; saveState(); return message.reply('Custom prompt cleared.'); }
        state.prompts[message.author.id] = text;
        saveState();
        return message.reply('Custom system prompt set.');
      }
      case 'models': {
        const u = new URL(GATEWAY + '/models');
        const mod = u.protocol === 'https:' ? https : http;
        const headers = {};
        if (config.masterToken) headers.Authorization = 'Bearer ' + config.masterToken;
        mod.get(u, { headers }, (res) => {
          let buf = '';
          res.on('data', (c) => (buf += c));
          res.on('end', () => {
            try {
              const j = JSON.parse(buf);
              message.reply(`Models: ${(j.data || []).map((m) => `**${m.id}**`).join(', ') || '(none)'}`);
            } catch { message.reply('Could not reach the gateway.'); }
          });
        }).on('error', () => message.reply('Could not reach the gateway.'));
        return;
      }
      case 'ping': {
        const t0 = Date.now();
        await gatewayChat('ping-' + message.author.id, 'Reply with the single word: pong');
        return message.reply(`Pong — gateway round-trip **${Date.now() - t0} ms**.`);
      }
      case 'export': {
        const format = rest.trim().toLowerCase() === 'json' ? 'json' : 'md';
        const chatId = chatIdFor(sessionKeyFor(message.author.id));
        const { status, body } = await gatewayGet('/api/export?chatId=' + encodeURIComponent(chatId) + '&format=' + format);
        if (status !== 200) {
          const j = safeParse(body);
          return message.reply('Could not export — ' + ((j && j.error) || ('gateway returned ' + status)) + '. Chat with me first.');
        }
        return message.reply({ content: 'Here is your conversation:', files: [{ attachment: Buffer.from(body), name: 'conversation.' + format }] });
      }
      case 'status': {
        const t0 = Date.now();
        const { status, body } = await gatewayGet('/v1/models');
        const latency = Date.now() - t0;
        const j = safeParse(body);
        const models = j && Array.isArray(j.models) ? j.models : [];
        const up = process.uptime();
        const h = Math.floor(up / 3600), m = Math.floor((up % 3600) / 60);
        return message.reply(
          `**Gateway status**\n**Endpoint:** \`${gatewayBase()}\`\n**HTTP:** ${status} · **Latency:** ${latency} ms\n` +
            `**Models:** ${models.length ? models.map((x) => x.id || x).join(', ') : '(none — is the gateway running?)'}\n` +
            `**Bot uptime:** ${h}h ${m}m\n\n` +
            (status !== 200 ? 'Gateway unreachable — start it with run.bat, then check the tunnel.' : '')
        );
      }
      case 'source':
        return message.reply('**Source code:** https://github.com/gc1dk/Chatgpt-Proxy\nEverything is self-hosted, free, and fully editable. Give it a ⭐ if you like it!');
      case 'verify': return doVerify(fake, rest.trim());
      case 'voice': {
        const action = rest.trim().toLowerCase();
        if (action === 'leave') {
          const conn = getVoiceConnection(message.guild.id);
          if (conn) { conn.destroy(); listeners.delete(message.guild.id); }
          return message.reply('Left the voice channel.');
        }
        if (action === 'join') {
          if (config.voice.enabled === false) return message.reply('Voice is disabled in config.');
          const channel = (config.voice.channelId && message.guild.channels.cache.get(config.voice.channelId)) || message.member.voice.channel;
          if (!channel) return message.reply('Join a voice channel first (or set voice.channelId in config).');
          const existing = getVoiceConnection(message.guild.id);
          if (existing && existing.joinConfig.channelId === channel.id) return message.reply(`Already in **${channel.name}**.`);
          if (existing) existing.destroy();
          const conn = joinVoiceChannel({ channelId: channel.id, guildId: message.guild.id, adapterCreator: message.guild.voiceAdapterCreator, selfDeaf: false, selfMute: false });
          try { await entersState(conn, VoiceConnectionStatus.Ready, 20000); } catch { conn.destroy(); return message.reply('Could not join voice.'); }
          const player = createAudioPlayer();
          conn.subscribe(player);
          ensureListening(conn, message.guild.id);
          return message.reply(`Joined **${channel.name}** — speak, and I will answer out loud.`);
        }
        return message.reply('Usage: !voice join | leave');
      }
      case 'auto-mod': {
        const parts2 = rest.trim().split(/\s+/);
        const mode = parts2[0] || 'status';
        if (message.member && !message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
          return message.reply('You need **Manage Messages** permission for that.');
        }
        const o = { mode };
        if (mode === 'status') return handleAutoMod(fake, message.member, message.guild, o);
        o.mode = mode;
        const extra = rest.slice((parts2[0] || '').length).trim();
        if (/^policy\s/i.test(extra)) o.policy = extra.replace(/^policy\s*/i, '').trim();
        else if (/^channel\s/i.test(extra)) o.channel = { id: extra.replace(/^channel\s*/i, '').trim().replace(/[<#>]/g, '') };
        else if (/^action\s/i.test(extra)) o.action = extra.replace(/^action\s*/i, '').trim();
        else if (/^all$/i.test(extra)) o.channel = 'all';
        return handleAutoMod(fake, message.member, message.guild, o);
      }
      case 'about':
        return message.reply(`**${config.botName || 'ChatGPT Bot'}** — free Discord bot powered by the self-hosted ChatGPT Gateway (${GATEWAY}). No API keys. Commands: !ask, !chat, !persona, !voice, !auto-mod, !verify…`);
      case 'help':
        return message.reply('Commands: ' + Object.keys(prefixAliases).map((n) => `${PREFIX}${n}`).join(', '));
    }
    return;
  }
  const g = modState(message.guild.id);
  if (g.enabled) scheduleModCheck(message);
});

// listen for people joining the bot's voice channel
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  if (newState.member && newState.member.user && newState.member.user.bot) return;
  const conn = getVoiceConnection((newState.guild && newState.guild.id) || (oldState.guild && oldState.guild.id) || '');
  if (!conn) return;
  if (newState.channelId === conn.joinConfig.channelId && newState.member) {
    ensureListening(conn, newState.guild.id);
  }
  const entry = listeners.get((oldState.guild && oldState.guild.id) || '');
  if (entry && oldState.channelId === conn.joinConfig.channelId && oldState.member && oldState.member.id !== client.user.id) {
    entry.userIds.delete(oldState.member.id);
  }
});

client.login(config.token).catch((e) => {
  console.error('[bot] login failed:', String((e && e.message) || e));
  process.exit(1);
});
