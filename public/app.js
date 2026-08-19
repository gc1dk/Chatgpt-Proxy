(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const messagesEl = $('#messages');
  const input = $('#input');
  const composer = $('#composer');
  const sendBtn = $('#send');
  const queueInfo = $('#queue-info');
  const welcome = $('#welcome');
  const sidebarBody = $('.sidebar-body');

  const BLOSSOM_SVG =
    '<svg class="blossom" viewBox="0 0 2406 2406" xmlns="http://www.w3.org/2000/svg"><path d="M1 578.4C1 259.5 259.5 1 578.4 1h1249.1c319 0 577.5 258.5 577.5 577.4V2406H578.4C259.5 2406 1 2147.5 1 1828.6V578.4z" fill="#74aa9c"/><path id="blossom-a" d="M1107.3 299.1c-197.999 0-373.9 127.3-435.2 315.3L650 743.5v427.9c0 21.4 11 40.4 29.4 51.4l344.5 198.515V833.3h.1v-27.9L1372.7 604c33.715-19.52 70.44-32.857 108.47-39.828L1447.6 450.3C1361 353.5 1237.1 298.5 1107.3 299.1zm0 117.5-.6.6c79.699 0 156.3 27.5 217.6 78.4-2.5 1.2-7.4 4.3-11 6.1L952.8 709.3c-18.4 10.4-29.4 30-29.4 51.4V1248l-155.1-89.4V755.8c-.1-187.099 151.601-338.9 339-339.2z" fill="#fff"/><use href="#blossom-a" transform="rotate(60 1203 1203)"/><use href="#blossom-a" transform="rotate(120 1203 1203)"/><use href="#blossom-a" transform="rotate(180 1203 1203)"/><use href="#blossom-a" transform="rotate(240 1203 1203)"/><use href="#blossom-a" transform="rotate(300 1203 1203)"/></svg>';
  const COPY_SVG = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.25 2.25C5.46 2.25 4 3.71 4 5.5v8.25a.75.75 0 0 0 1.5 0V5.5c0-.97.78-1.75 1.75-1.75h5.25a.75.75 0 0 0 0-1.5H7.25ZM11 5.25c-1.8 0-3.25 1.46-3.25 3.25v7c0 1.8 1.46 3.25 3.25 3.25h4c1.8 0 3.25-1.46 3.25-3.25v-7c0-1.8-1.46-3.25-3.25-3.25h-4Zm-1.75 3.25c0-.97.78-1.75 1.75-1.75h4c.97 0 1.75.78 1.75 1.75v7c0 .97-.78 1.75-1.75 1.75h-4a1.75 1.75 0 0 1-1.75-1.75v-7Z"/></svg>';
  const STOP_SVG = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.0834 3.91797C14.7392 3.91797 16.0812 5.26023 16.0814 6.91602V13.083C16.0814 14.7389 14.7393 16.0811 13.0834 16.0811H6.91638C5.2606 16.0809 3.91833 14.7388 3.91833 13.083V6.91602C3.91851 5.26034 5.26071 3.91814 6.91638 3.91797H13.0834Z"/></svg>';
  const RETRY_SVG = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M15.3124 4.93317C14.9966 4.6002 14.4677 4.58616 14.1347 4.90195L13.1228 5.85386C11.6567 4.45304 9.59095 3.90002 7.62612 4.45499C4.79601 5.24742 3.01804 8.15454 3.81047 10.9846C4.6029 13.8148 7.51003 15.5927 10.3401 14.8003C12.4387 14.2097 13.8927 12.4036 14.1268 10.3756C14.171 10.0132 14.4821 9.74396 14.8445 9.78816C15.2069 9.83236 15.4761 10.1435 15.4319 10.5059C15.1392 12.9968 13.3474 15.2161 10.7168 15.9591C7.12435 16.9657 3.42812 14.7472 2.42148 11.1548C1.41485 7.56235 3.63332 3.86611 7.22579 2.85948C9.66003 2.16786 12.1808 2.79148 13.9662 4.48231L14.9966 3.51339C15.3296 3.1976 15.8585 3.21164 16.1743 3.54461C16.4901 3.87758 16.4761 4.40648 16.1431 4.72227L15.3124 4.93317ZM10 5.25a.75.75 0 0 1 .75.75v4.25l2.5 1.5a.75.75 0 1 1-.75 1.3l-2.94-1.76a.75.75 0 0 1-.31-.61V6a.75.75 0 0 1 .75-.75Z"/></svg>';
  const DOWNLOAD_SVG = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 1.75a.75.75 0 0 1 .75.75v8.19l2.72-2.72a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 1 1 1.06-1.06l2.72 2.72V2.5A.75.75 0 0 1 10 1.75ZM3.25 16a.75.75 0 0 1 .75-.75h12a.75.75 0 0 1 0 1.5H4a.75.75 0 0 1-.75-.75Z"/></svg>';
  const SPEAK_SVG = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10.9216 2.81809C11.1455 3.00054 11.1797 3.31516 10.9973 3.53906L5.93316 9.75H3.5C3.22386 9.75 3 9.97386 3 10.25V12.75C3 13.0261 3.22386 13.25 3.5 13.25H5.93316L10.9973 19.4609C11.1797 19.6848 11.1455 19.9995 10.9216 20.1819C10.6977 20.3644 10.3831 20.3302 10.2006 20.1063L5.03567 13.75H3.5C2.67157 13.75 2 13.0784 2 12.25V10.75C2 9.92157 2.67157 9.25 3.5 9.25H5.03567L10.2006 2.8937C10.3831 2.6698 10.6977 2.63562 10.9216 2.81809ZM12.4697 5.53033C12.7626 5.23744 13.2374 5.23744 13.5303 5.53033C15.4908 7.49077 15.4908 10.5092 13.5303 12.4697C13.2374 12.7626 12.7626 12.7626 12.4697 12.4697C12.1768 12.1768 12.1768 11.7019 12.4697 11.409C13.8435 10.0352 13.8435 7.96478 12.4697 6.59099C12.1768 6.2981 12.1768 5.82323 12.4697 5.53033ZM15.25 3.75C15.5429 3.45711 16.0178 3.45711 16.3107 3.75C19.2298 6.66909 19.2298 11.3309 16.3107 14.25C16.0178 14.5429 15.5429 14.5429 15.25 14.25C14.9571 13.9571 14.9571 13.4822 15.25 13.1893C17.5833 10.856 17.5833 7.14399 15.25 4.81066C14.9571 4.51777 14.9571 4.04289 15.25 3.75Z"/></svg>';

  const RENAME_SVG = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.4265 3.10381C14.3857 2.15908 15.9276 2.16466 16.8796 3.11651C17.8339 4.07106 17.8372 5.61827 16.8865 6.57647L11.7244 11.7786C11.3005 12.2058 10.7622 12.5027 10.1746 12.6321L7.78784 13.1565C7.20661 13.2842 6.6889 12.766 6.81714 12.1849L7.34253 9.80498C7.47294 9.21426 7.77197 8.67391 8.20288 8.24932L13.4265 3.10381ZM15.9392 4.05694C15.5038 3.62172 14.7988 3.61907 14.3601 4.05108L9.13647 9.19659C8.88861 9.44077 8.71644 9.75138 8.64136 10.0911L8.28979 11.6849L9.88843 11.3333C10.2265 11.2588 10.5362 11.0878 10.78 10.8421L15.9421 5.63897C16.3769 5.20075 16.3756 4.49352 15.9392 4.05694Z"/></svg>';
  const TRASH_SVG = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M8.5 2.75a.75.75 0 0 0-.75.75v.5H4.5a.75.75 0 0 0 0 1.5h.44l.75 9.36a2.25 2.25 0 0 0 2.24 2.14h4.14a2.25 2.25 0 0 0 2.24-2.14l.75-9.36h.44a.75.75 0 0 0 0-1.5h-3.25v-.5a.75.75 0 0 0-.75-.75h-3Zm3 .5v.5h-3v-.5h3Zm-4.34 3.4h5.68l-.7 8.72a.75.75 0 0 1-.75.71H8.61a.75.75 0 0 1-.75-.71l-.7-8.72Z"/></svg>';

  const state = {
    busy: false,
    lastPrompt: '',
    currentChatId: null,
    loadedChatId: null,
  };

  // ---- image attachments (composer -> /api/chat) ----
  const pendingImages = [];
  const MAX_IMAGES = 4;
  const MAX_IMG_BYTES = 6 * 1024 * 1024;

  function imageDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  function renderAttachStrip() {
    const strip = $('#attach-strip');
    if (!strip) return;
    strip.hidden = pendingImages.length === 0;
    strip.innerHTML = '';
    pendingImages.forEach((im, i) => {
      const t = document.createElement('div');
      t.className = 'attach-thumb';
      t.title = im.name + ' · ' + Math.round(im.dataUrl.length * 0.75 / 1024) + ' KB';
      const img = document.createElement('img');
      img.src = im.dataUrl;
      img.alt = im.name;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'attach-remove';
      rm.title = 'Remove image';
      rm.innerHTML = '&times;';
      rm.addEventListener('click', () => {
        pendingImages.splice(i, 1);
        renderAttachStrip();
        updateControls();
      });
      t.appendChild(img);
      t.appendChild(rm);
      strip.appendChild(t);
    });
    updateControls();
  }

  async function addPendingImages(files) {
    const list = Array.from(files || []);
    for (const f of list) {
      if (pendingImages.length >= MAX_IMAGES) break;
      if (!f || !/^image\//.test(f.type || '')) continue;
      if (f.size > MAX_IMG_BYTES) continue;
      try {
        const dataUrl = await imageDataUrl(f);
        pendingImages.push({ name: f.name || 'image.png', mime: f.type, dataUrl });
      } catch (e) {}
    }
    renderAttachStrip();
  }

  // ---- voice: spoken replies (server TTS) ----
  let voiceEnabled = false;
  let voiceName = 'en-US-AriaNeural';
  let audioEl = null;
  let serverMaxPrompt = null;
  try {
    voiceEnabled = localStorage.getItem('cgpt-speak') === '1';
    const v = localStorage.getItem('cgpt-voice');
    if (v) voiceName = v;
  } catch (e) {}
  function stopSpeech() {
    if (audioEl) {
      try {
        audioEl.pause();
        audioEl.removeAttribute('src');
      } catch (e) {}
    }
    document.querySelectorAll('.speaking').forEach((b) => b.classList.remove('speaking'));
  }
  async function speak(text, btn) {
    const t = String(text || '').trim();
    if (!t) return;
    stopSpeech();
    if (!audioEl) {
      audioEl = document.createElement('audio');
      document.body.appendChild(audioEl);
    }
    if (btn) btn.classList.add('speaking');
    try {
      const res = await api('/api/tts?text=' + encodeURIComponent(t.slice(0, 20000)) + '&voice=' + encodeURIComponent(voiceName));
      if (!res.ok) throw new Error('tts ' + res.status);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioEl.src = url;
      audioEl.onended = () => {
        if (btn) btn.classList.remove('speaking');
        URL.revokeObjectURL(url);
      };
      await audioEl.play();
    } catch (e) {
      if (btn) btn.classList.remove('speaking');
      console.error('tts', e);
    }
  }

  const CLIENT_ID = (() => {
    try {
      let id = localStorage.getItem('cg-client-id');
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem('cg-client-id', id);
      }
      return id;
    } catch (e) {
      return 'legacy';
    }
  })();

  // Account session: when logged in, the account id ('u-<username>') becomes the
  // chat owner, so chats follow the account across browsers and devices.
  let session = null;
  try {
    const raw = localStorage.getItem('cgpt-session');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.clientId && parsed.clientToken && parsed.username) session = parsed;
    }
  } catch (e) {}

  const activeClientId = () => (session ? session.clientId : CLIENT_ID);

  let loginResolve = null;
  let loginMode = 'login';

  function openLogin() {
    boot(50, 'Log in to continue');
    $('#login-modal').hidden = false;
    $('#login-title').textContent = loginMode === 'signup' ? 'Create an account' : 'Log in';
    $('#login-submit').textContent = loginMode === 'signup' ? 'Create account' : 'Log in';
    $('#login-error').textContent = '';
    $('#login-username').focus();
    return new Promise((resolve) => {
      loginResolve = resolve;
    });
  }

  function closeLogin(ok) {
    $('#login-modal').hidden = true;
    if (loginResolve) {
      loginResolve(ok);
      loginResolve = null;
    }
  }

  async function submitLogin() {
    const username = $('#login-username').value.trim();
    const password = $('#login-password').value;
    if (!username || !password) {
      $('#login-error').textContent = 'Enter a username and password.';
      return;
    }
    const btn = $('#login-submit');
    btn.disabled = true;
    $('#login-error').textContent = '';
    try {
      const res = await fetch('/api/' + (loginMode === 'signup' ? 'signup' : 'login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.clientToken) {
        session = { username: data.clientId.replace(/^u-/, ''), clientId: data.clientId, clientToken: data.clientToken };
        try {
          localStorage.setItem('cgpt-session', JSON.stringify(session));
        } catch (e) {}
        $('#login-password').value = '';
        closeLogin(true);
      } else {
        $('#login-error').textContent = data.error || 'Login failed (' + res.status + ')';
        if (data.error === 'username already exists') {
          loginMode = 'login';
          $('#login-title').textContent = 'Log in';
          $('#login-submit').textContent = 'Log in';
        }
      }
    } catch (e) {
      $('#login-error').textContent = 'Server unreachable.';
    }
    btn.disabled = false;
  }

  function api(path, opts) {
    opts = opts || {};
    let token = '';
    try {
      token = localStorage.getItem('cgpt-token') || '';
    } catch (e) {}
    const clientToken = session ? session.clientToken : '';
    const headers = Object.assign(
      { 'X-Client-Id': activeClientId() },
      clientToken ? { 'X-Client-Token': clientToken } : {},
      token ? { Authorization: 'Bearer ' + token } : {},
      opts.headers || {}
    );
    const attempt = (h) => fetch(path, Object.assign({}, opts, { headers: Object.assign({}, headers, h) }));

    function needMaster() {
      if (window.__cgAuthAsked) return null;
      window.__cgAuthAsked = true;
      const tok = window.prompt('This server requires a master token. Enter it (or use a user account below):');
      window.__cgAuthAsked = false;
      if (tok && tok.trim()) {
        try {
          localStorage.setItem('cgpt-token', tok.trim());
        } catch (e) {}
        return tok.trim();
      }
      return null;
    }

    function registerClient(master) {
      return fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Client-Id': activeClientId(), Authorization: 'Bearer ' + master },
        body: JSON.stringify({ clientId: activeClientId() }),
      })
        .then((r) => r.json())
        .then((res) => {
          if (res.clientToken) {
            session = { username: null, clientId: activeClientId(), clientToken: res.clientToken };
            try {
              localStorage.setItem('cgpt-session', JSON.stringify(session));
            } catch (e) {}
            return res.clientToken;
          }
          return null;
        });
    }

    return attempt({}).then(async (res) => {
      if (res.status !== 401) return res;
      if (token && !clientToken) {
        const ct = await registerClient(token).catch(() => null);
        if (ct) {
          const retry = await attempt({ 'X-Client-Token': ct });
          if (retry.status !== 401) return retry;
        }
      }
      if (session && session.clientToken) {
        session = null;
        try {
          localStorage.removeItem('cgpt-session');
        } catch (e) {}
      }
      if (window.__cgLoginAsked) return res;
      window.__cgLoginAsked = true;
      const ok = await openLogin();
      window.__cgLoginAsked = false;
      if (!ok) return res;
      const retry = await attempt({ 'X-Client-Token': session.clientToken });
      return retry;
    });
  }

  $('#login-submit').addEventListener('click', () => submitLogin());
  $('#login-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitLogin();
  });
  $('#login-signup-toggle').addEventListener('click', () => {
    loginMode = loginMode === 'signup' ? 'login' : 'signup';
    $('#login-title').textContent = loginMode === 'signup' ? 'Create an account' : 'Log in';
    $('#login-submit').textContent = loginMode === 'signup' ? 'Create account' : 'Log in';
  });
  $('#login-token-toggle').addEventListener('click', () => {
    closeLogin(true);
    needMasterPrompt();
  });
  function needMasterPrompt() {
    const master = needMaster();
    if (master) location.reload();
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
    return Promise.resolve();
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  const CODE_LANGS = {
    html: { label: 'HTML', filename: 'index.html', preview: true },
    svg: { label: 'SVG', filename: 'image.svg', preview: true },
    js: { label: 'JavaScript', filename: 'script.js', preview: true },
    javascript: { label: 'JavaScript', filename: 'script.js', preview: true },
    jsx: { label: 'JSX', filename: 'App.jsx', preview: true },
    css: { label: 'CSS', filename: 'style.css', preview: true },
    ts: { label: 'TypeScript', filename: 'script.ts' },
    tsx: { label: 'TSX', filename: 'App.tsx' },
    json: { label: 'JSON', filename: 'data.json' },
    py: { label: 'Python', filename: 'script.py' },
    python: { label: 'Python', filename: 'script.py' },
    sh: { label: 'Shell', filename: 'script.sh' },
    bash: { label: 'Bash', filename: 'script.sh' },
    shell: { label: 'Shell', filename: 'script.sh' },
    powershell: { label: 'PowerShell', filename: 'script.ps1' },
    md: { label: 'Markdown', filename: 'README.md' },
    markdown: { label: 'Markdown', filename: 'README.md' },
    txt: { label: 'Text', filename: 'notes.txt' },
    sql: { label: 'SQL', filename: 'query.sql' },
    java: { label: 'Java', filename: 'Main.java' },
    c: { label: 'C', filename: 'main.c' },
    cpp: { label: 'C++', filename: 'main.cpp' },
    cs: { label: 'C#', filename: 'Program.cs' },
    go: { label: 'Go', filename: 'main.go' },
    rust: { label: 'Rust', filename: 'main.rs' },
    rs: { label: 'Rust', filename: 'main.rs' },
    rb: { label: 'Ruby', filename: 'script.rb' },
    php: { label: 'PHP', filename: 'script.php' },
    kt: { label: 'Kotlin', filename: 'Main.kt' },
    swift: { label: 'Swift', filename: 'main.swift' },
    yaml: { label: 'YAML', filename: 'config.yml' },
    yml: { label: 'YAML', filename: 'config.yml' },
    xml: { label: 'XML', filename: 'data.xml' },
    dockerfile: { label: 'Dockerfile', filename: 'Dockerfile' },
    diff: { label: 'Diff', filename: 'changes.diff' },
  };
  const CODE_DEFAULT = { label: 'Code', filename: 'code.txt' };

  function codeInfoFor(block) {
    const cls = block.className || '';
    const m = cls.match(/language-([\w+-]+)/i);
    if (m) {
      const info = CODE_LANGS[m[1].toLowerCase()];
      if (info) return info;
    }
    return CODE_DEFAULT;
  }

  // Sniff the real file type from content when the model tags a block with an
  // unknown/weird language (e.g. "php-template" for plain HTML).
  function sniffLang(lang, code) {
    const c = String(code || '').trim().slice(0, 2000);
    if (/^<!doctype\s+html|<html[\s>]|<body[\s>]/i.test(c)) return 'html';
    if (/^<svg[\s>]/i.test(c)) return 'svg';
    if (/^<style[\s>]/i.test(c)) return 'css';
    if (/^<script[\s>]/i.test(c)) return 'js';
    return lang;
  }

  function buildPreviewHtml(lang, code) {
    if (lang === 'html') return code;
    if (lang === 'svg') {
      return code.trim().indexOf('<svg') === 0 ? code : '<div style="padding:16px">' + code + '</div>';
    }
    if (lang === 'css') {
      return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>CSS preview</title><style>' + code + '</style></head><body></body></html>';
    }
    if (lang === 'js' || lang === 'javascript' || lang === 'jsx') {
      const safe = code.replace(/<\/script/gi, '<\\/script');
      return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>JavaScript preview</title><style>body{font:14px/1.5 system-ui,-apple-system,sans-serif;padding:16px;margin:0}</style></head><body><script>' + safe + '</scr' + 'ipt></body></html>';
    }
    return null;
  }

  const artifacts = [];
  let activeTab = 'chat';
  let activeArtifactId = null;
  let autoLatest = true;
  let turnIndex = 0;

  function previewableLang(lang) {
    return lang === 'html' || lang === 'svg' || lang === 'css' || lang === 'js' || lang === 'javascript' || lang === 'jsx';
  }

  function kindOf(lang) {
    if (previewableLang(lang)) return 'code';
    return 'doc';
  }

  function addArtifact(art) {
    art.id = 'art-' + artifacts.length + '-' + Math.random().toString(36).slice(2, 7);
    artifacts.push(art);
    return art;
  }

  function harvestMessage(markdownEl, msgIndex) {
    let pushed = false;
    markdownEl.querySelectorAll('.code-block').forEach((b, i) => {
      let lang = b._langId;
      if (!CODE_LANGS[lang]) lang = sniffLang(lang, b._rawCode);
      if (!CODE_LANGS[lang]) lang = 'txt';
      const kind = previewableLang(lang) ? 'code' : (lang === 'md' || lang === 'markdown') ? 'doc' : 'code';
      const info = CODE_LANGS[lang] || CODE_DEFAULT;
      addArtifact({ msgIndex, n: i, kind, lang, title: info.filename, content: b._rawCode });
      b.dataset.artId = artifacts[artifacts.length - 1].id;
      pushed = true;
    });
    return pushed;
  }

  function rebuildVersions() {
    const sel = $('#code-versions');
    if (!sel) return;
    sel.innerHTML = '';
    const latest = document.createElement('option');
    latest.value = 'latest';
    latest.textContent = 'Latest (auto)';
    sel.appendChild(latest);
    for (let i = artifacts.length - 1; i >= 0; i--) {
      const a = artifacts[i];
      const opt = document.createElement('option');
      opt.value = a.id;
      const kindLabel = a.kind === 'code' ? (a.lang || 'code').toUpperCase() : 'DOC';
      opt.textContent = kindLabel + ' · ' + a.title + ' — turn ' + (a.msgIndex + 1);
      sel.appendChild(opt);
    }
    if (autoLatest) {
      sel.value = 'latest';
    } else if (activeArtifactId && artifacts.some((a) => a.id === activeArtifactId)) {
      sel.value = activeArtifactId;
    } else {
      autoLatest = true;
      sel.value = 'latest';
    }
    $('#auto-badge').hidden = !autoLatest;
    $('#code-tab-badge').hidden = artifacts.length === 0;
    $('#code-tab-badge').textContent = String(artifacts.length);
  }

  let previewBlobUrl = null;
  function updatePreview(art) {
    const iframe = $('#code-preview');
    const empty = $('#code-preview-empty');
    if (!iframe) return;
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      previewBlobUrl = null;
    }
    if (!art || !previewableLang(art.lang)) {
      iframe.removeAttribute('src');
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    const html = buildPreviewHtml(art.lang, art.content);
    previewBlobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    iframe.src = previewBlobUrl;
  }

  function loadArtifact(art) {
    const chip = $('#code-file-chip');
    const fn = $('#code-filename');
    if (!art) {
      $('#code-editor').value = '';
      $('#code-kind').textContent = '';
      chip.hidden = true;
      fn.textContent = '';
      autoLatest = true;
      updatePreview(null);
      return;
    }
    activeArtifactId = art.id;
    $('#code-editor').value = art.content;
    $('#code-kind').textContent = art.kind === 'code' ? (art.lang || 'code').toUpperCase() : 'MARKDOWN';
    chip.hidden = false;
    fn.textContent = art.title;
    if (chip) chip.classList.remove('edited');
    updatePreview(art);
  }

  function switchTab(which) {
    activeTab = which;
    const chat = $('#panel-chat');
    const code = $('#panel-code');
    chat.hidden = which !== 'chat';
    code.hidden = which !== 'code';
    $('#tab-chat').classList.toggle('active', which === 'chat');
    $('#tab-code').classList.toggle('active', which === 'code');
    if (which === 'code' && autoLatest) {
      const latest = artifacts[artifacts.length - 1];
      loadArtifact(latest || null);
    }
    if (which === 'code') $('#code-editor').focus();
  }

  function openInNewTab(htmlOrText, htmlMode) {
    const blob = new Blob([htmlOrText], { type: (htmlMode ? 'text/html' : 'text/plain') + ';charset=utf-8' });
    window.open(URL.createObjectURL(blob), '_blank');
  }

  function openInNewTab(htmlOrText, htmlMode) {
    const blob = new Blob([htmlOrText], { type: (htmlMode ? 'text/html' : 'text/plain') + ';charset=utf-8' });
    window.open(URL.createObjectURL(blob), '_blank');
  }

  const PLAIN_THRESHOLD = 400000;

  function renderMarkdown(text) {
    if (text && text.length > PLAIN_THRESHOLD) {
      const container = document.createElement('div');
      const pre = document.createElement('pre');
      pre.className = 'plain-reply';
      pre.textContent = text;
      container.appendChild(pre);
      return container;
    }
    const raw = window.marked.parse(text || '', { async: false });
    const clean = window.DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
    const container = document.createElement('div');
    container.innerHTML = clean;
    container.querySelectorAll('pre code').forEach((block) => {
      if (window.hljs) {
        try { window.hljs.highlightElement(block); } catch (e) {}
      }
      const pre = block.closest('pre');
      if (!pre) return;
      const langToken = (block.className || '').match(/language-([\w+-]+)/i);
      const langId = langToken ? langToken[1].toLowerCase() : 'txt';
      const info = codeInfoFor(block);
      const rawCode = block.innerText;
      const wrap = document.createElement('div');
      wrap.className = 'code-block';
      pre.parentNode.replaceChild(wrap, pre);
      wrap.appendChild(pre);
      const head = document.createElement('div');
      head.className = 'code-head';
      const lang = document.createElement('span');
      lang.className = 'code-lang';
      lang.textContent = info.label;
      head.appendChild(lang);
      const actions = document.createElement('div');
      actions.className = 'code-actions';
      const run = document.createElement('button');
      run.className = 'code-btn';
      run.textContent = 'Run';
      run.addEventListener('click', () => {
        const art = artifacts.find((a) => a.id === wrap.dataset.artId);
        if (art) {
          loadArtifact(art);
          switchTab('code');
          return;
        }
        openInNewTab(buildPreviewHtml(langId, rawCode) || rawCode, !!(CODE_LANGS[langId] || {}).preview);
      });
      actions.appendChild(run);
      const dl = document.createElement('button');
      dl.className = 'code-btn';
      dl.textContent = 'Download';
      dl.addEventListener('click', () => downloadText(rawCode, info.filename));
      actions.appendChild(dl);
      const cp = document.createElement('button');
      cp.className = 'code-btn';
      cp.textContent = 'Copy';
      cp.addEventListener('click', () => {
        copyText(rawCode).then(() => {
          cp.textContent = 'Copied';
          setTimeout(() => { cp.textContent = 'Copy'; }, 1500);
        });
      });
      actions.appendChild(cp);
      head.appendChild(actions);
      wrap.insertBefore(head, pre);
      wrap._langId = langId;
      wrap._rawCode = rawCode;
    });
    return container;
  }

  function isAtBottom() {
    return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 140;
  }

  function scrollToBottom(force) {
    if (force || isAtBottom()) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  function addUserMessage(text, images) {
    const msg = document.createElement('div');
    msg.className = 'msg user';
    const bubble = document.createElement('div');
    bubble.className = 'user-bubble';
    if (images && images.length) {
      const row = document.createElement('div');
      row.className = 'user-imgs';
      for (const im of images) {
        const img = document.createElement('img');
        img.src = im.dataUrl || im.src;
        img.alt = im.name || 'image';
        row.appendChild(img);
      }
      bubble.appendChild(row);
    }
    if (text) {
      const p = document.createElement('div');
      p.textContent = text;
      bubble.appendChild(p);
    }
    msg.appendChild(bubble);
    messagesEl.appendChild(msg);
    scrollToBottom(true);
    return msg;
  }

  function addAssistantMessage() {
    const msg = document.createElement('div');
    msg.className = 'msg assistant';
    const myTurn = turnIndex;
    turnIndex += 1;
    const avatar = document.createElement('div');
    avatar.className = 'assistant-avatar';
    avatar.innerHTML = BLOSSOM_SVG;
    const body = document.createElement('div');
    body.className = 'assistant-body';
    const name = document.createElement('div');
    name.className = 'assistant-name';
    name.innerHTML = '<span>ChatGPT</span><span class="gpt-badge">GPT-5.6 Luna</span>';
    const markdown = document.createElement('div');
    markdown.className = 'markdown';
    body.appendChild(name);
    body.appendChild(markdown);
    msg.appendChild(avatar);
    msg.appendChild(body);
    messagesEl.appendChild(msg);
    scrollToBottom(true);
    return { msg, markdown, msgIndex: myTurn };
  }

  function addActions(msgEl, text) {
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'msg-action';
    copyBtn.innerHTML = COPY_SVG + '<span>Copy</span>';
    copyBtn.addEventListener('click', () => {
      copyText(text).then(() => {
        const span = copyBtn.querySelector('span');
        span.textContent = 'Copied!';
        setTimeout(() => { span.textContent = 'Copy'; }, 1500);
      });
    });
    actions.appendChild(copyBtn);
    const speakBtn = document.createElement('button');
    speakBtn.className = 'msg-action';
    speakBtn.innerHTML = SPEAK_SVG + '<span>Play</span>';
    speakBtn.addEventListener('click', () => speak(text, speakBtn));
    actions.appendChild(speakBtn);
    msgEl.appendChild(actions);
  }

  function makeStreamingBubble() {
    const { msg, markdown, msgIndex } = addAssistantMessage();
    msg.classList.add('streaming');
    const obj = {
      msg,
      markdown,
      msgIndex,
      buf: '',
      ready: false,
      failed: false,
      rafPending: false,
      plain: false,
      plainEl: null,
      setThinking() {
        if (this.failed) return;
        markdown.innerHTML = '<div class="thinking-dots"><span></span><span></span><span></span></div>';
      },
      render() {
        if (this.ready && !this.buf.trim()) return;
        if (!this.buf.trim()) {
          this.setThinking();
          return;
        }
        msg.classList.add('has-text');
        if (!this.plain && this.buf.length > 120000) {
          this.plain = true;
        }
        if (this.plain) {
          if (!this.plainEl) {
            this.plainEl = document.createElement('pre');
            this.plainEl.className = 'plain-reply';
            markdown.replaceChildren(this.plainEl);
          }
          this.plainEl.textContent = this.buf;
        } else {
          markdown.replaceChildren(renderMarkdown(this.buf));
        }
        scrollToBottom(false);
      },
      renderSoon() {
        if (this.rafPending) return;
        this.rafPending = true;
        const fire = () => {
          this.rafPending = false;
          this.render();
        };
        // Huge buffers make full markdown re-renders expensive — throttle them.
        if (this.buf.length > 60000) setTimeout(fire, 400);
        else requestAnimationFrame(fire);
      },
      append(t) {
        if (t && !this.failed) {
          this.buf += t;
          this.renderSoon();
        }
      },
      reset() {
        if (this.failed) return;
        this.buf = '';
        this.rafPending = false;
        this.plain = false;
        this.plainEl = null;
        msg.classList.remove('has-text');
        this.render();
      },
      finish(text) {
        this.ready = true;
        this.buf = text || this.buf;
        msg.classList.remove('streaming');
        if (this.buf.trim()) {
          markdown.replaceChildren(renderMarkdown(this.buf));
          if (harvestMessage(markdown, this.msgIndex)) {
            rebuildVersions();
            if (activeTab === 'code' && autoLatest) {
              loadArtifact(artifacts[artifacts.length - 1] || null);
            }
          }
        } else {
          markdown.innerHTML = '';
        }
        scrollToBottom(true);
      },
      error(ev) {
        if (ev.code === 'cancelled') {
          this.ready = true;
          msg.classList.remove('streaming');
          if (this.buf.trim()) this.render();
          const note = document.createElement('div');
          note.className = 'cancel-note';
          note.textContent = 'Stopped.';
          msg.appendChild(note);
          return;
        }
        this.ready = true;
        this.failed = true;
        msg.classList.remove('streaming');
        markdown.innerHTML = '';
        const box = document.createElement('div');
        box.className = 'error-box';
        let text = 'Something went wrong.';
        if (ev.code === 'rate_limited') {
          text = 'ChatGPT rate-limited this session (sessions are capped).';
          if (ev.retryAfter) text += ' Retry available around ' + new Date(ev.retryAfter).toLocaleTimeString() + '.';
        } else if (ev.code === 'timeout') {
          text = 'Timed out waiting for a response.';
          if (ev.text) text += ' Partial response received.';
        } else if (ev.message) {
          text = ev.message;
        }
        const p = document.createElement('span');
        p.textContent = text;
        box.appendChild(p);
        if (state.lastPrompt) {
          const retryBtn = document.createElement('button');
          retryBtn.className = 'msg-action';
          retryBtn.innerHTML = RETRY_SVG + '<span>Retry</span>';
          retryBtn.addEventListener('click', () => {
            msgEl.remove();
            sendMessage(state.lastPrompt);
          });
          box.appendChild(retryBtn);
        }
        markdown.appendChild(box);
        scrollToBottom(true);
      },
    };
    obj.setThinking();
    return obj;
  }

  async function sendMessage(text) {
    if (state.busy) return;
    state.busy = true;
    const imgs = pendingImages.splice(0, MAX_IMAGES);
    renderAttachStrip();
    state.lastPrompt = text;
    updateControls();
    stopSpeech();
    welcome.hidden = true;
    addUserMessage(text, imgs);
    const bubble = makeStreamingBubble();
    if (serverMaxPrompt && text.length > serverMaxPrompt) {
      bubble.error({
        code: 'internal',
        message:
          'Message too long: ' +
          text.length.toLocaleString() +
          ' characters — ChatGPT caps a single message at ' +
          serverMaxPrompt.toLocaleString() +
          '. Split it into smaller messages.',
      });
      refreshChatList();
      state.busy = false;
      updateControls();
      return;
    }

    const stopBtn = document.createElement('button');
    stopBtn.className = 'msg-action';
    stopBtn.innerHTML = STOP_SVG + '<span>Stop</span>';
    stopBtn.addEventListener('click', () => {
      api('/api/stop', { method: 'POST' }).catch(() => {});
      stopBtn.disabled = true;
      stopBtn.querySelector('span').textContent = 'Stopping…';
    });
    const stopRow = document.createElement('div');
    stopRow.className = 'msg-actions';
    stopRow.appendChild(stopBtn);
    bubble.msg.appendChild(stopRow);

    let lastEventAt = Date.now();
    let reader = null;
    const watchdog = setInterval(() => {
      if (bubble.ready) {
        clearInterval(watchdog);
        return;
      }
      const idle = Date.now() - lastEventAt;
      if (idle > 300000) {
        clearInterval(watchdog);
        bubble.error({
          code: 'timeout',
          message: 'No response from ChatGPT for 5 minutes — it may be stuck. Try again.',
        });
        if (reader) reader.cancel().catch(() => {});
      }
    }, 5000);

    try {
      const res = await api('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, chatId: state.currentChatId, images: imgs }),
      });
      if (!res.ok || !res.body) {
        let errText = 'Bad response from server (' + res.status + ')';
        try { errText = (await res.json()).error || errText; } catch (e) {}
        throw new Error(errText);
      }
      reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        lastEventAt = Date.now();
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          handleEvent(block, bubble);
        }
      }
      clearInterval(watchdog);
      if (buf.trim()) handleEvent(buf, bubble);
      if (!bubble.ready) {
        bubble.finish();
      }
      stopRow.remove();
      if (bubble.buf.trim() && !bubble.failed) {
        addActions(bubble.msg, bubble.buf);
      }
      refreshChatList();
    } catch (e) {
      clearInterval(watchdog);
      stopRow.remove();
      if (!bubble.ready) bubble.error({ code: 'internal', message: String((e && e.message) || e) });
    } finally {
      state.busy = false;
      updateControls();
    }
  }

  function handleEvent(block, bubble) {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      let ev;
      try {
        ev = JSON.parse(line.slice(6));
      } catch (e) {
        continue;
      }
      if (!ev || !ev.type) continue;
      if (ev.type === 'delta') {
        bubble.append(ev.text || '');
      } else if (ev.type === 'chat') {
        if (ev.id && ev.id !== state.currentChatId) {
          state.currentChatId = ev.id;
          state.loadedChatId = ev.id;
          refreshChatList();
        }
      } else if (ev.type === 'reset') {
        bubble.reset();
      } else if (ev.type === 'queue') {
        queueInfo.textContent = ev.position > 0 ? 'Waiting for your turn in the queue…' : '';
      } else if (ev.type === 'status') {
        showStatus(ev.text || '');
      } else if (ev.type === 'done') {
        bubble.finish(ev.text || '');
        if (voiceEnabled && (ev.text || bubble.buf)) speak(ev.text || bubble.buf);
      } else if (ev.type === 'error') {
        bubble.error(ev);
      }
    }
  }

  let statusTimer = null;
  function showStatus(text) {
    const rs = $('#rate-status');
    if (!rs) return;
    rs.textContent = text;
    rs.hidden = false;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      rs.hidden = true;
    }, 20000);
  }

  function updateControls() {
    sendBtn.disabled = state.busy || (!input.value.trim() && pendingImages.length === 0);
    $('#new-chat').disabled = state.busy;
    input.disabled = state.busy;
    const attach = $('#attach');
    if (attach) attach.disabled = state.busy;
  }

  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 192) + 'px';
  }

  function clearMessages() {
    messagesEl.querySelectorAll('.msg').forEach((m) => m.remove());
    const iframe = $('#code-preview');
    if (iframe) iframe.removeAttribute('src');
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      previewBlobUrl = null;
    }
    const empty = $('#code-preview-empty');
    if (empty) empty.hidden = false;
  }

  function renderChatList(chats, activeChatId) {
    sidebarBody.innerHTML = '';
    for (const chat of chats) {
      const item = document.createElement('div');
      item.className = 'chat-item' + (chat.id === activeChatId ? ' active' : '');
      item.title = chat.title || 'New chat';
      item.role = 'button';
      item.tabIndex = 0;
      const label = document.createElement('span');
      label.className = 'chat-item-label';
      label.textContent = chat.title || 'New chat';
      const actions = document.createElement('span');
      actions.className = 'chat-item-actions';
      const renameBtn = document.createElement('button');
      renameBtn.className = 'chat-item-btn';
      renameBtn.title = 'Rename chat';
      renameBtn.innerHTML = RENAME_SVG;
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = prompt('Rename chat', chat.title || '');
        if (next && next.trim() && next.trim() !== chat.title) {
          api('/api/chat-rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: chat.id, title: next.trim() }),
          }).then(() => refreshChatList()).catch(() => {});
        }
      });
      const expBtn = document.createElement('button');
      expBtn.className = 'chat-item-btn';
      expBtn.title = 'Export chat (.md)';
      expBtn.innerHTML = DOWNLOAD_SVG;
      expBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        api('/api/export?chatId=' + encodeURIComponent(chat.id))
          .then((r) => (r.ok ? r.text() : Promise.reject(new Error('export failed'))))
          .then((text) => downloadText(text, (chat.title || 'chat').slice(0, 60) + '.md'))
          .catch(() => {});
      });
      const delBtn = document.createElement('button');
      delBtn.className = 'chat-item-btn';
      delBtn.title = 'Delete chat';
      delBtn.innerHTML = TRASH_SVG;
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm('Delete this chat? This cannot be undone.')) return;
        api('/api/chat-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: chat.id }),
        })
          .then((r) => r.json())
          .then((res) => {
            if (res.ok) {
              if (state.currentChatId === chat.id) {
                state.currentChatId = null;
                state.loadedChatId = null;
                clearMessages();
                welcome.hidden = false;
              }
              refreshChatList();
            }
          })
          .catch(() => {});
      });
      actions.appendChild(renameBtn);
      actions.appendChild(delBtn);
      item.appendChild(label);
      item.appendChild(actions);
      item.addEventListener('click', () => selectChat(chat.id));
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectChat(chat.id);
        }
      });
      sidebarBody.appendChild(item);
    }
  }

  async function selectChat(chatId) {
    if (chatId === state.loadedChatId) return;
    state.currentChatId = chatId;
    clearMessages();
    artifacts.length = 0;
    welcome.hidden = true;
    try {
      const h = await api('/api/history?chatId=' + encodeURIComponent(chatId)).then((r) => r.json());
      if (h.messages && h.messages.length) {
        for (const m of h.messages) {
          if (m.role === 'user') addUserMessage(m.text, m.images);
          else if (m.role === 'assistant') {
            const { msg, markdown, msgIndex } = addAssistantMessage();
            if (m.text.trim()) markdown.replaceChildren(renderMarkdown(m.text));
            harvestMessage(markdown, msgIndex);
            addActions(msg, m.text);
          }
        }
      } else {
        welcome.hidden = false;
      }
      state.loadedChatId = chatId;
    } catch (e) {}
    document.body.classList.remove('sidebar-open');
    rebuildVersions();
    refreshChatList();
  }

  async function refreshChatList() {
    try {
      const s = await api('/api/chats').then((r) => r.json());
      renderChatList(s.chats || [], state.currentChatId || s.activeChatId);
      if (!state.currentChatId && s.activeChatId) state.currentChatId = s.activeChatId;
      return s;
    } catch (e) {
      return null;
    }
  }

  input.addEventListener('input', () => {
    autoGrow();
    updateControls();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (!state.busy && (input.value.trim() || pendingImages.length)) {
        const text = input.value.trim();
        input.value = '';
        autoGrow();
        updateControls();
        sendMessage(text);
      }
    }
  });

  composer.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.busy && (input.value.trim() || pendingImages.length)) {
      const text = input.value.trim();
      input.value = '';
      autoGrow();
      updateControls();
      sendMessage(text);
    }
  });

  // ---- image attachments: button, paste, drag & drop ----
  const attachInput = $('#attach-input');
  const attachBtn = $('#attach');
  if (attachInput && attachBtn) {
    attachBtn.addEventListener('click', () => attachInput.click());
    attachInput.addEventListener('change', () => {
      addPendingImages(attachInput.files);
      attachInput.value = '';
    });
  }
  input.addEventListener('paste', (e) => {
    if (!e.clipboardData) return;
    const files = [];
    for (const item of e.clipboardData.items) {
      if (item.kind === 'file' && /^image\//.test(item.type || '')) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) addPendingImages(files);
  });
  const dropZone = composer.closest('.composer-wrap');
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      if (state.busy) return;
      const files = [];
      for (const f of e.dataTransfer.files || []) {
        if (/^image\//.test(f.type || '')) files.push(f);
      }
      if (files.length) addPendingImages(files);
    });
  }

  $('#new-chat').addEventListener('click', async () => {
    if (state.busy) return;
    try {
      const r = await api('/api/new-chat', { method: 'POST' }).then((res) => res.json());
      if (r.ok && r.id) {
        if (state.busy) {
          refreshChatList();
          return;
        }
        state.currentChatId = r.id;
        clearMessages();
        pendingImages.length = 0;
        renderAttachStrip();
        welcome.hidden = false;
        refreshChatList();
        input.focus();
      }
    } catch (e) {}
  });

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const label = $('#settings-theme-label');
    if (label) label.textContent = theme === 'dark' ? 'Dark mode' : 'Light mode';
    try { localStorage.setItem('cgpt-theme', theme); } catch (e) {}
  }

  $('#theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });

  $('#api-btn').addEventListener('click', async () => {
    const loc = window.location;
    const base = loc.origin + '/v1';
    $('#api-base-url').value = base;
    let authVal = '';
    let authHint = '';
    let tokenAvailable = false;
    let tokenKind = '';
    let storedMaster = '';
    try { storedMaster = localStorage.getItem('cgpt-token') || ''; } catch (e) {}
    if (session && session.clientToken) {
      authVal = 'X-Client-Id: ' + activeClientId() + '\nx-client-token: ' + session.clientToken;
      tokenAvailable = true;
      tokenKind = 'account';
    } else if (storedMaster) {
      authVal = 'Authorization: Bearer ' + storedMaster;
      tokenAvailable = true;
      tokenKind = 'master';
    }
    const authWrap = $('#api-auth-wrap');
    if (tokenAvailable) {
      authWrap.hidden = false;
      $('#api-auth-value').value = authVal;
      authHint =
        tokenKind === 'account'
          ? 'These headers come from your logged-in account. Treat your token like a password.'
          : 'This is the master token you entered. Master access can stop/reset the server.';
    } else {
      authWrap.hidden = true;
      authHint = 'No token. Get one by logging in, or entering the master token (it will remember it).';
    }
    $('#api-auth-hint').textContent = authHint;
    const host = loc.host;
    const docs =
      '# Base URL\n' + base + '\n\n' +
      '# List models\n' +
      'curl ' + base + '/models\n\n' +
      '# Non-stream chat completion\n' +
      'curl ' + base + '/chat/completions \\\n' +
      '  -H "Content-Type: application/json" \\\n' +
      (tokenKind === 'master' ? '  -H "Authorization: Bearer ' + storedMaster + '" \\\n' :
        tokenKind === 'account' ? '  -H "X-Client-Id: ' + activeClientId() + '" -H "x-client-token: ' + session.clientToken + '" \\\n' : '') +
      '  -d \'{"model":"chatgpt-gateway","messages":[{"role":"user","content":"Hello"}]}\'\n\n' +
      '# Streaming (SSE)\n' +
      'curl -N ' + base + '/chat/completions \\\n' +
      '  -H "Content-Type: application/json" \\\n' +
      (tokenKind === 'master' ? '  -H "Authorization: Bearer ' + storedMaster + '" \\\n' :
        tokenKind === 'account' ? '  -H "X-Client-Id: ' + activeClientId() + '" -H "x-client-token: ' + session.clientToken + '" \\\n' : '') +
      '  -d \'{"model":"chatgpt-gateway","stream":true,"messages":[{"role":"user","content":"Hello"}]}\'\n\n' +
      '# Notes\n' +
      '- model: any string (the underlying model is ChatGPT\'s current page model).\n' +
      '- session via "user": "my-key" or header "x-session-id" keeps one chat per key.\n' +
      '- max message length: ' + (serverMaxPrompt || 500000).toLocaleString() + ' characters.\n' +
      '- Try the Quick test above — it runs a real request from this page.';
    $('#api-docs').textContent = docs;
    $('#api-test-output').hidden = true;
    $('#api-test-output').textContent = '';
    $('#api-modal').hidden = false;
    input.blur();
  });

  $('#api-close').addEventListener('click', () => {
    $('#api-modal').hidden = true;
  });
  $('#api-modal').addEventListener('click', (e) => {
    if (e.target.id === 'api-modal') $('#api-modal').hidden = true;
  });
  $('#api-copy-base').addEventListener('click', () => copyText($('#api-base-url').value));
  $('#api-copy-auth').addEventListener('click', () => copyText($('#api-auth-value').value));
  $('#api-test-btn').addEventListener('click', async () => {
    const out = $('#api-test-output');
    const btn = $('#api-test-btn');
    const msg = ($('#api-test-input').value || '').trim() || 'Hello';
    btn.disabled = true;
    btn.textContent = 'Waiting…';
    out.hidden = false;
    out.textContent = 'streaming…';
    try {
      const res = await api('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'chatgpt-gateway', stream: true, messages: [{ role: 'user', content: msg }] }),
      });
      if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let text = '';
      out.textContent = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of block.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') continue;
            try {
              const ev = JSON.parse(payload);
              const delta = ev.choices && ev.choices[0] && ev.choices[0].delta;
              if (delta && delta.content) {
                text += delta.content;
                out.textContent = text;
              }
            } catch (e) {}
          }
        }
      }
      if (!text) {
        try {
          const j = await res.clone().json();
          out.textContent = JSON.stringify(j, null, 2);
        } catch (e) {
          out.textContent = '(empty response)';
        }
      }
    } catch (e) {
      out.textContent = 'Error: ' + String((e && e.message) || e);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send test';
    }
  });

  $('#settings-btn').addEventListener('click', () => {
    api('/api/settings')
      .then((r) => r.json())
      .then((s) => {
        $('#settings-system-prompt').value = s.systemPrompt || '';
      })
      .catch(() => {});
    const speakLabel = $('#settings-speak-label');
    if (speakLabel) speakLabel.textContent = 'Speak replies: ' + (voiceEnabled ? 'on' : 'off');
    const voiceSel = $('#settings-voice');
    if (voiceSel) voiceSel.value = voiceName;
    $('#settings-modal').hidden = false;
  });

  $('#settings-speak-toggle').addEventListener('click', () => {
    voiceEnabled = !voiceEnabled;
    try { localStorage.setItem('cgpt-speak', voiceEnabled ? '1' : '0'); } catch (e) {}
    const label = $('#settings-speak-label');
    if (label) label.textContent = 'Speak replies: ' + (voiceEnabled ? 'on' : 'off');
    if (!voiceEnabled) stopSpeech();
  });

  $('#settings-voice').addEventListener('change', (e) => {
    voiceName = e.target.value || 'en-US-AriaNeural';
    try { localStorage.setItem('cgpt-voice', voiceName); } catch (err) {}
  });

  $('#settings-save-prompt').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const msg = $('#settings-save-msg');
    try {
      const r = await api('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: $('#settings-system-prompt').value }),
      }).then((res) => res.json());
      msg.textContent = r.ok ? 'Saved — applies to chats from their first message onward' : 'Save failed';
    } catch (err) {
      msg.textContent = 'Save failed';
    }
    btn.disabled = false;
    setTimeout(() => { msg.textContent = ''; }, 4000);
  });

  $('#settings-close').addEventListener('click', () => {
    $('#settings-modal').hidden = true;
  });

  $('#settings-modal').addEventListener('click', (e) => {
    if (e.target.id === 'settings-modal') $('#settings-modal').hidden = true;
  });

  $('#tab-chat').addEventListener('click', () => switchTab('chat'));
  $('#tab-code').addEventListener('click', () => switchTab('code'));

  $('#code-versions').addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'latest') {
      autoLatest = true;
      loadArtifact(artifacts[artifacts.length - 1] || null);
    } else {
      autoLatest = false;
      const art = artifacts.find((a) => a.id === val);
      loadArtifact(art || null);
    }
  });

  $('#code-run').addEventListener('click', () => {
    const art = artifacts.find((a) => a.id === activeArtifactId);
    if (art && previewableLang(art.lang)) {
      updatePreview(art);
      const btn = $('#code-run');
      btn.classList.add('run-flash');
      setTimeout(() => btn.classList.remove('run-flash'), 600);
      return;
    }
    const lang = art ? art.lang : null;
    const content = $('#code-editor').value;
    const html = lang && previewableLang(lang) ? buildPreviewHtml(lang, content) : null;
    openInNewTab(html || content, !!html);
    const btn = $('#code-run');
    btn.classList.add('run-flash');
    setTimeout(() => btn.classList.remove('run-flash'), 600);
  });

  $('#code-copy').addEventListener('click', () => {
    copyText($('#code-editor').value).then(() => {
      const btn = $('#code-copy');
      const label = btn.querySelector('span');
      if (label) label.textContent = 'Copied';
      else btn.textContent = 'Copied';
      setTimeout(() => {
        if (label) label.textContent = 'Copy';
        else btn.textContent = 'Copy';
      }, 1500);
    });
  });

  $('#code-download').addEventListener('click', () => {
    const art = artifacts.find((a) => a.id === activeArtifactId);
    const content = $('#code-editor').value;
    const lang = art ? art.lang : 'txt';
    const info = CODE_LANGS[lang] || CODE_DEFAULT;
    downloadText(content, info.filename);
  });

  $('#code-open').addEventListener('click', () => {
    const art = artifacts.find((a) => a.id === activeArtifactId);
    const lang = art ? art.lang : null;
    const content = $('#code-editor').value;
    const html = lang && previewableLang(lang) ? buildPreviewHtml(lang, content) : null;
    openInNewTab(html || content, !!html);
  });

  $('#code-editor').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') $('#code-run').click();
  });

  let codeEditTimer = null;
  $('#code-editor').addEventListener('input', () => {
    const art = artifacts.find((a) => a.id === activeArtifactId);
    if (!art) return;
    art.content = $('#code-editor').value;
    const chip = $('#code-file-chip');
    if (chip) chip.classList.add('edited');
    clearTimeout(codeEditTimer);
    codeEditTimer = setTimeout(() => {
      if (previewableLang(art.lang)) updatePreview(art);
    }, 700);
  });

  $('#settings-theme').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });

  $('#settings-reset-session').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Clearing…';
    try {
      await api('/api/reset-session', { method: 'POST' });
      btn.textContent = 'Done — fresh session';
      pollStatus();
    } catch (err) {
      btn.textContent = 'Failed — try again';
    }
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = 'Clear cookies & start a fresh session';
    }, 2500);
  });

  function setStatus(kind, text) {
    const dot = $('#status-dot');
    dot.className = 'dot ' + kind;
    $('#status-text').textContent = text;
    $('#topbar-status').textContent = text;
  }

  async function pollStatus() {
    try {
      const s = await api('/api/status').then((r) => r.json());
      if (!s.ready) {
        if (s.captcha) {
          setStatus('err', 'Captcha blocked — run with HEADED=1 and solve once');
          boot(30, 'Captcha — check the browser window…');
        } else if (s.error) {
          setStatus('warn', 'Browser not ready yet…');
          boot(45, 'Starting browser…');
        } else {
          setStatus('warn', 'Starting browser…');
          boot(45, 'Starting browser…');
        }
      } else if (s.gated) {
        setStatus('err', s.retryAfter ? 'Rate limited until ' + new Date(s.retryAfter).toLocaleTimeString() : 'Rate limited');
        boot(70, 'Rate limited — waiting…');
      } else if (s.busy || s.processing) {
        setStatus('ok', 'Generating…');
        boot(85, 'Connecting…');
      } else {
        setStatus('ok', 'Connected');
        boot(92, 'Connecting…');
      }
      if (s.lanIps && s.lanIps.length) {
        if (isPublicHost()) {
          $('#lan-url').hidden = true;
          $('#settings-server-info').textContent = location.host + ' · ' + s.chatCount + ' chat(s)';
        } else if (s.https && s.httpsPort) {
          $('#lan-url').textContent = 'LAN: https://' + s.lanIps[0] + ':' + s.httpsPort + ' (voice)';
          $('#settings-server-info').textContent =
            'https://' + s.lanIps[0] + ':' + s.httpsPort + ' · ' + s.chatCount + ' chat(s)';
        } else {
          $('#lan-url').textContent = 'LAN: http://' + s.lanIps[0] + ':' + s.port;
          $('#settings-server-info').textContent = 'http://' + s.lanIps[0] + ':' + s.port + ' · ' + s.chatCount + ' chat(s)';
        }
      }
      if (typeof s.maxPrompt === 'number') serverMaxPrompt = s.maxPrompt;
    } catch (e) {
      setStatus('err', 'Server offline');
      boot(8, 'Waiting for server…');
    }
  }

  let bootStart = 0;
  function boot(step, label) {
    const overlay = $('#boot-overlay');
    if (!overlay || overlay.hidden) return;
    if (!bootStart) bootStart = Date.now();
    const pct = Math.max(4, Math.min(100, Math.round(step)));
    const bar = $('#boot-bar');
    const light = $('#boot-logo .boot-light');
    if (bar) bar.style.width = pct + '%';
    if (light) light.style.clipPath = 'inset(0 ' + (100 - pct) + '% 0 0)';
    const pctEl = $('#boot-pct');
    if (pctEl) pctEl.textContent = pct + '%';
    if (label) $('#boot-status').textContent = label;
    if (pct >= 100) {
      overlay.classList.add('done');
      const waited = Date.now() - bootStart;
      const hold = Math.max(900, 2200 - waited);
      setTimeout(() => {
        overlay.hidden = true;
      }, hold);
    }
  }

  let lastKnownLatest = null;
  let updateState = 'idle';

  function setBanner(state, text, hideAfter) {
    const banner = $('#update-banner');
    if (!banner) return;
    updateState = state;
    banner.hidden = false;
    banner.dataset.state = state;
    $('#update-banner-text').textContent = text;
    const updateBtn = $('#update-btn');
    const dismissBtn = $('#update-dismiss');
    if (state === 'available') {
      updateBtn.hidden = false;
      updateBtn.disabled = false;
      updateBtn.textContent = 'Update';
      dismissBtn.hidden = false;
    } else if (state === 'checking') {
      updateBtn.hidden = true;
      dismissBtn.hidden = true;
    } else {
      updateBtn.hidden = false;
      updateBtn.disabled = false;
      updateBtn.textContent = 'Check again';
      dismissBtn.hidden = false;
    }
    if (hideAfter) {
      setTimeout(() => {
        const modal = $('#settings-modal');
        if (updateState === state && (!modal || modal.hidden)) {
          banner.hidden = true;
          updateState = 'idle';
        }
      }, hideAfter);
    }
  }

  async function checkUpdate(force) {
    if (updateState === 'checking') return;
    const banner = $('#update-banner');
    if (!banner) return;
    setBanner('checking', 'Checking for updates…');
    try {
      const r = await api('/api/update-info' + (force ? '?refresh=1' : ''));
      if (!r.ok) throw new Error('bad status ' + r.status);
      const info = await r.json();
      if (info.latest && info.latest !== info.current) {
        lastKnownLatest = info.latest;
        let dismissed = null;
        try {
          dismissed = localStorage.getItem('cgpt-update-dismiss');
        } catch (e) {}
        if (dismissed === info.latest) {
          banner.hidden = true;
          updateState = 'idle';
        } else {
          setBanner('available', 'Update available: v' + info.current + ' → v' + info.latest);
        }
      } else {
        setBanner('uptodate', 'You are up to date (v' + info.current + ')', 6000);
      }
    } catch (e) {
      setBanner('failed', 'Update check failed — are you online?', 6000);
    }
  }

  $('#update-dismiss').addEventListener('click', () => {
    const banner = $('#update-banner');
    banner.hidden = true;
    updateState = 'idle';
    if (lastKnownLatest && banner.dataset.state === 'available') {
      try {
        localStorage.setItem('cgpt-update-dismiss', lastKnownLatest);
      } catch (e) {}
    }
  });

  $('#update-btn').addEventListener('click', async () => {
    const btn = $('#update-btn');
    if (updateState !== 'available') {
      checkUpdate(true);
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Updating…';
    try {
      const r = await api('/api/update', { method: 'POST' }).then((res) => res.json());
      if (r.ok) {
        $('#update-banner-text').textContent = 'Updated — restarting the server…';
        btn.textContent = 'Restart';
        setTimeout(() => api('/api/restart', { method: 'POST' }).catch(() => {}), 3500);
      } else {
        $('#update-banner-text').textContent = 'Update failed: ' + (r.error || 'unknown error');
        btn.disabled = false;
        btn.textContent = 'Retry';
      }
    } catch (e) {
      $('#update-banner-text').textContent = 'Update failed.';
      btn.disabled = false;
      btn.textContent = 'Retry';
    }
  });

  $('#settings-update-btn').addEventListener('click', async () => {
    const btn = $('#settings-update-btn');
    const status = $('#settings-update-status');
    btn.disabled = true;
    status.textContent = 'Checking…';
    await checkUpdate(true);
    btn.disabled = false;
    if (updateState === 'available') status.textContent = 'New version available — see the banner above.';
    else if (updateState === 'uptodate') status.textContent = 'You are up to date.';
    else if (updateState === 'failed') status.textContent = 'Check failed.';
    else status.textContent = '';
  });

  $('#menu-btn').addEventListener('click', () => {
    document.body.classList.toggle('sidebar-open');
  });
  document.addEventListener('click', (e) => {
    if (
      document.body.classList.contains('sidebar-open') &&
      !e.target.closest('.sidebar') &&
      !e.target.closest('#menu-btn')
    ) {
      document.body.classList.remove('sidebar-open');
    }
  });

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = $('#mic');
  if (mic && SpeechRec && window.isSecureContext) {
    mic.hidden = false;
    let rec = null;
    let listening = false;
    mic.addEventListener('click', () => {
      if (listening) {
        try {
          rec.stop();
        } catch (e) {}
        return;
      }
      stopSpeech();
      rec = new SpeechRec();
      rec.lang = 'en-US';
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        let text = '';
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
        input.value = text;
        autoGrow();
        updateControls();
      };
      const stopListening = () => {
        listening = false;
        mic.classList.remove('listening');
      };
      rec.onend = stopListening;
      rec.onerror = stopListening;
      listening = true;
      mic.classList.add('listening');
      try {
        rec.start();
      } catch (e) {
        stopListening();
      }
    });
  } else if (mic) {
    mic.hidden = false;
    mic.disabled = false;
    mic.title = 'Voice input needs a secure page (https or localhost). Open the https URL shown in the sidebar, or enable the HTTPS option in run.bat.';
    mic.addEventListener('click', () => {
      const hint = 'Voice input needs a secure page (https or localhost).\n\nTo use the mic over your LAN, enable the HTTPS option in run.bat (setup wizard), then open the https URL shown in the sidebar.';
      try {
        alert(hint);
      } catch (e) {}
    });
  }

  const isPublicHost = () => location.hostname.endsWith('.pages.dev');

  async function init() {
    boot(4, 'Starting…');
    try {
      const t = localStorage.getItem('cgpt-theme');
      if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    } catch (e) {}
    if (isPublicHost()) {
      $('#lan-url').hidden = true;
      const db = $('#demo-banner');
      if (db) db.hidden = false;
      const ws = $('#welcome-sub');
      if (ws) ws.textContent = 'Live public demo - your chats go through the demo backend and are not private.';
    }
    let s = null;
    try {
      s = await refreshChatList();
    } catch (e) {}
    if (s && s.activeChatId) {
      try {
        await selectChat(s.activeChatId);
      } catch (e) {}
    }
    boot(100, 'Ready');
    input.focus();
    pollStatus();
    setInterval(pollStatus, 5000);
    checkUpdate();
    setInterval(checkUpdate, 1800000);
  }

  init();
})();
