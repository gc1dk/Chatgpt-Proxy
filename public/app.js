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
    '<svg viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M11.2475 18.25C10.6975 18.25 10.175 18.1455 9.67999 17.9365C9.18499 17.7275 8.74499 17.436 8.35999 17.062C7.94199 17.205 7.50749 17.2765 7.05649 17.2765C6.31949 17.2765 5.63749 17.095 5.01049 16.732C4.38349 16.369 3.87749 15.874 3.49249 15.247C3.11849 14.62 2.93149 13.9215 2.93149 13.1515C2.93149 12.8325 2.97549 12.486 3.06349 12.112C2.62349 11.705 2.28249 11.2375 2.04049 10.7095C1.79849 10.1705 1.67749 9.6095 1.67749 9.0265C1.67749 8.4325 1.80399 7.8605 2.05699 7.3105C2.30999 6.7605 2.66199 6.2875 3.11299 5.8915C3.57499 5.4845 4.10849 5.204 4.71349 5.05C4.83449 4.423 5.08749 3.862 5.47249 3.367C5.86849 2.861 6.35249 2.465 6.92449 2.179C7.49649 1.893 8.10699 1.75 8.75599 1.75C9.30599 1.75 9.82849 1.8545 10.3235 2.0635C10.8185 2.2725 11.2585 2.564 11.6435 2.938C12.0615 2.795 12.496 2.7235 12.947 2.7235C13.684 2.7235 14.366 2.905 14.993 3.268C15.62 3.631 16.1205 4.126 16.4945 4.753C16.8795 5.38 17.072 6.0785 17.072 6.8485C17.072 7.1675 17.028 7.514 16.94 7.888C17.38 8.295 17.721 8.768 17.963 9.307C18.205 9.835 18.326 10.3905 18.326 10.9735C18.326 11.5675 18.1995 12.1395 17.9465 12.6895C17.6935 13.2395 17.336 13.718 16.874 14.125C16.423 14.521 15.895 14.796 15.29 14.95C15.169 15.577 14.9105 16.138 14.5145 16.633C14.1295 17.139 13.651 17.535 13.079 17.821C12.507 18.107 11.8965 18.25 11.2475 18.25ZM7.17199 16.1875C7.72199 16.1875 8.20049 16.072 8.60749 15.841L11.7095 14.059C11.8195 13.982 11.8745 13.8775 11.8745 13.7455V12.3265L7.88149 14.62C7.63949 14.763 7.39749 14.763 7.15549 14.62L4.03699 12.8215C4.03699 12.8545 4.03149 12.893 4.02049 12.937C4.02049 12.981 4.02049 13.047 4.02049 13.135C4.02049 13.696 4.15249 14.213 4.41649 14.686C4.69149 15.148 5.07099 15.511 5.55499 15.775C6.03899 16.05 6.57799 16.1875 7.17199 16.1875ZM7.33699 13.498C7.40299 13.531 7.46349 13.5475 7.51849 13.5475C7.57349 13.5475 7.62849 13.531 7.68349 13.498L8.92099 12.7885L4.94449 10.4785C4.70249 10.3355 4.58099 10.1255 4.58099 9.8485C4.58099 9.5715 4.70249 9.3615 4.94449 9.2185L10.9455 5.8485C11.132 5.7495 11.3185 5.7 11.505 5.7C11.8245 5.7 12.094 5.816 12.3135 6.048C12.544 6.269 12.6595 6.55 12.6595 6.8915V7.939L14.72 6.9185C14.9065 6.8195 15.0985 6.7705 15.296 6.7705C15.6265 6.7705 15.896 6.8915 16.1045 7.1335C16.324 7.3645 16.434 7.6405 16.434 7.9605C16.434 8.2805 16.324 8.5565 16.1045 8.7875L13.787 11.102C13.391 11.498 12.8755 11.696 12.2405 11.696C11.6165 11.696 11.1065 11.509 10.7105 11.134L10.2665 10.7065L7.33699 13.498ZM7.33699 11.7705L10.5815 8.5395L9.21449 7.2055L5.96999 10.4365C6.08199 10.4365 6.19449 10.436 6.30199 10.436C6.69499 10.436 7.04399 10.4905 7.33699 10.5895C7.33699 10.962 7.33749 11.3505 7.33699 11.7705ZM16.4355 7.9605L13.3065 11.0855L16.4355 12.814V7.9605ZM16.4345 12.8135L13.191 10.9015L16.4345 12.8135ZM13.568 12.9615L16.4345 14.6665V13.998L13.568 12.9615ZM16.4345 14.6665L16.4345 14.6665L16.4345 14.6665L13.568 12.9615V16.6665L16.4345 14.6665ZM10.9005 12.2415L13.568 12.9615L10.9005 16.6665V12.2415ZM10.8985 12.2415L10.8985 12.2415L10.9005 16.6665L7.33699 14.1895L10.8985 12.2415Z"/></svg>';
  const COPY_SVG = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.25 2.25C5.46 2.25 4 3.71 4 5.5v8.25a.75.75 0 0 0 1.5 0V5.5c0-.97.78-1.75 1.75-1.75h5.25a.75.75 0 0 0 0-1.5H7.25ZM11 5.25c-1.8 0-3.25 1.46-3.25 3.25v7c0 1.8 1.46 3.25 3.25 3.25h4c1.8 0 3.25-1.46 3.25-3.25v-7c0-1.8-1.46-3.25-3.25-3.25h-4Zm-1.75 3.25c0-.97.78-1.75 1.75-1.75h4c.97 0 1.75.78 1.75 1.75v7c0 .97-.78 1.75-1.75 1.75h-4a1.75 1.75 0 0 1-1.75-1.75v-7Z"/></svg>';
  const STOP_SVG = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.0834 3.91797C14.7392 3.91797 16.0812 5.26023 16.0814 6.91602V13.083C16.0814 14.7389 14.7393 16.0811 13.0834 16.0811H6.91638C5.2606 16.0809 3.91833 14.7388 3.91833 13.083V6.91602C3.91851 5.26034 5.26071 3.91814 6.91638 3.91797H13.0834Z"/></svg>';
  const RETRY_SVG = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M15.3124 4.93317C14.9966 4.6002 14.4677 4.58616 14.1347 4.90195L13.1228 5.85386C11.6567 4.45304 9.59095 3.90002 7.62612 4.45499C4.79601 5.24742 3.01804 8.15454 3.81047 10.9846C4.6029 13.8148 7.51003 15.5927 10.3401 14.8003C12.4387 14.2097 13.8927 12.4036 14.1268 10.3756C14.171 10.0132 14.4821 9.74396 14.8445 9.78816C15.2069 9.83236 15.4761 10.1435 15.4319 10.5059C15.1392 12.9968 13.3474 15.2161 10.7168 15.9591C7.12435 16.9657 3.42812 14.7472 2.42148 11.1548C1.41485 7.56235 3.63332 3.86611 7.22579 2.85948C9.66003 2.16786 12.1808 2.79148 13.9662 4.48231L14.9966 3.51339C15.3296 3.1976 15.8585 3.21164 16.1743 3.54461C16.4901 3.87758 16.4761 4.40648 16.1431 4.72227L15.3124 4.93317ZM10 5.25a.75.75 0 0 1 .75.75v4.25l2.5 1.5a.75.75 0 1 1-.75 1.3l-2.94-1.76a.75.75 0 0 1-.31-.61V6a.75.75 0 0 1 .75-.75Z"/></svg>';
  const DOWNLOAD_SVG = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 1.75a.75.75 0 0 1 .75.75v8.19l2.72-2.72a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 1 1 1.06-1.06l2.72 2.72V2.5A.75.75 0 0 1 10 1.75ZM3.25 16a.75.75 0 0 1 .75-.75h12a.75.75 0 0 1 0 1.5H4a.75.75 0 0 1-.75-.75Z"/></svg>';

  const state = {
    busy: false,
    lastPrompt: '',
    currentChatId: null,
  };

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

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'X-Client-Id': CLIENT_ID }, opts.headers || {});
    return fetch(path, opts);
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

  function renderMarkdown(text) {
    const raw = window.marked.parse(text || '', { async: false });
    const clean = window.DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
    const container = document.createElement('div');
    container.innerHTML = clean;
    container.querySelectorAll('pre code').forEach((block) => {
      if (window.hljs) {
        try { window.hljs.highlightElement(block); } catch (e) {}
      }
      const wrap = block.closest('pre');
      if (wrap) {
        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.textContent = 'Copy';
        btn.addEventListener('click', () => {
          copyText(block.innerText).then(() => {
            btn.textContent = 'Copied';
            setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
          });
        });
        wrap.appendChild(btn);
      }
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

  function addUserMessage(text) {
    const msg = document.createElement('div');
    msg.className = 'msg user';
    const bubble = document.createElement('div');
    bubble.className = 'user-bubble';
    bubble.textContent = text;
    msg.appendChild(bubble);
    messagesEl.appendChild(msg);
    scrollToBottom(true);
    return msg;
  }

  function addAssistantMessage() {
    const msg = document.createElement('div');
    msg.className = 'msg assistant';
    const avatar = document.createElement('div');
    avatar.className = 'assistant-avatar';
    avatar.innerHTML = BLOSSOM_SVG;
    const body = document.createElement('div');
    body.className = 'assistant-body';
    const name = document.createElement('div');
    name.className = 'assistant-name';
    name.innerHTML = '<span>ChatGPT</span><span class="gpt-badge">GPT-4</span>';
    const markdown = document.createElement('div');
    markdown.className = 'markdown';
    body.appendChild(name);
    body.appendChild(markdown);
    msg.appendChild(avatar);
    msg.appendChild(body);
    messagesEl.appendChild(msg);
    scrollToBottom(true);
    return { msg, markdown };
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
    const dlBtn = document.createElement('button');
    dlBtn.className = 'msg-action';
    dlBtn.innerHTML = DOWNLOAD_SVG + '<span>Download</span>';
    dlBtn.addEventListener('click', () => {
      downloadText(text, 'chatgpt-reply-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.md');
    });
    actions.appendChild(dlBtn);
    msgEl.appendChild(actions);
  }

  function makeStreamingBubble() {
    const { msg, markdown } = addAssistantMessage();
    msg.classList.add('streaming');
    const obj = {
      msg,
      markdown,
      buf: '',
      ready: false,
      rafPending: false,
      setThinking() {
        markdown.innerHTML = '<div class="thinking-dots"><span></span><span></span><span></span></div>';
      },
      render() {
        if (this.ready && !this.buf.trim()) return;
        if (!this.buf.trim()) {
          this.setThinking();
          return;
        }
        msg.classList.add('has-text');
        markdown.replaceChildren(renderMarkdown(this.buf));
        scrollToBottom(false);
      },
      renderSoon() {
        if (this.rafPending) return;
        this.rafPending = true;
        requestAnimationFrame(() => {
          this.rafPending = false;
          this.render();
        });
      },
      append(t) {
        if (t) {
          this.buf += t;
          this.renderSoon();
        }
      },
      reset() {
        this.buf = '';
        this.rafPending = false;
        msg.classList.remove('has-text');
        this.render();
      },
      finish(text) {
        this.ready = true;
        this.buf = text || this.buf;
        msg.classList.remove('streaming');
        if (this.buf.trim()) {
          markdown.replaceChildren(renderMarkdown(this.buf));
        } else {
          markdown.innerHTML = '';
        }
        scrollToBottom(true);
      },
      error(ev) {
        this.ready = true;
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
    state.lastPrompt = text;
    updateControls();
    welcome.hidden = true;
    addUserMessage(text);
    const bubble = makeStreamingBubble();

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

    try {
      const res = await api('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, chatId: state.currentChatId }),
      });
      if (!res.ok || !res.body) {
        let errText = 'Bad response from server (' + res.status + ')';
        try { errText = (await res.json()).error || errText; } catch (e) {}
        throw new Error(errText);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          handleEvent(block, bubble);
        }
      }
      if (buf.trim()) handleEvent(buf, bubble);
      if (!bubble.ready) {
        bubble.finish();
      }
      stopRow.remove();
      addActions(bubble.msg, bubble.buf);
      refreshChatList();
    } catch (e) {
      stopRow.remove();
      bubble.error({ code: 'internal', message: String((e && e.message) || e) });
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
      } else if (ev.type === 'reset') {
        bubble.reset();
      } else if (ev.type === 'queue') {
        queueInfo.textContent = ev.position > 0 ? 'Waiting for your turn in the queue…' : '';
      } else if (ev.type === 'done') {
        bubble.finish(ev.text || '');
      } else if (ev.type === 'error') {
        bubble.error(ev);
      }
    }
  }

  function updateControls() {
    sendBtn.disabled = state.busy || !input.value.trim();
    $('#new-chat').disabled = state.busy;
    input.disabled = state.busy;
  }

  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 192) + 'px';
  }

  function clearMessages() {
    messagesEl.querySelectorAll('.msg').forEach((m) => m.remove());
  }

  function renderChatList(chats, activeChatId) {
    sidebarBody.innerHTML = '';
    for (const chat of chats) {
      const item = document.createElement('button');
      item.className = 'chat-item' + (chat.id === activeChatId ? ' active' : '');
      item.textContent = chat.title || 'New chat';
      item.title = chat.title || 'New chat';
      item.addEventListener('click', () => selectChat(chat.id));
      sidebarBody.appendChild(item);
    }
  }

  async function selectChat(chatId) {
    state.currentChatId = chatId;
    clearMessages();
    welcome.hidden = true;
    try {
      const h = await api('/api/history?chatId=' + encodeURIComponent(chatId)).then((r) => r.json());
      if (h.messages && h.messages.length) {
        for (const m of h.messages) {
          if (m.role === 'user') addUserMessage(m.text);
          else if (m.role === 'assistant') {
            const { msg, markdown } = addAssistantMessage();
            if (m.text.trim()) markdown.replaceChildren(renderMarkdown(m.text));
            addActions(msg, m.text);
          }
        }
      } else {
        welcome.hidden = false;
      }
    } catch (e) {}
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
      if (!state.busy && input.value.trim()) {
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
    if (!state.busy && input.value.trim()) {
      const text = input.value.trim();
      input.value = '';
      autoGrow();
      updateControls();
      sendMessage(text);
    }
  });

  $('#new-chat').addEventListener('click', async () => {
    if (state.busy) return;
    try {
      const r = await api('/api/new-chat', { method: 'POST' }).then((res) => res.json());
      if (r.ok && r.id) {
        state.currentChatId = r.id;
        clearMessages();
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

  $('#settings-btn').addEventListener('click', () => {
    api('/api/settings')
      .then((r) => r.json())
      .then((s) => {
        $('#settings-system-prompt').value = s.systemPrompt || '';
      })
      .catch(() => {});
    $('#settings-modal').hidden = false;
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
        if (s.captcha) setStatus('err', 'Captcha blocked — run with HEADED=1 and solve once');
        else if (s.error) setStatus('warn', 'Browser not ready yet…');
        else setStatus('warn', 'Starting browser…');
      } else if (s.gated) {
        setStatus('err', s.retryAfter ? 'Rate limited until ' + new Date(s.retryAfter).toLocaleTimeString() : 'Rate limited');
      } else if (s.busy || s.processing) {
        setStatus('ok', 'Generating…');
      } else {
        setStatus('ok', 'Connected');
      }
      if (s.lanIps && s.lanIps.length) {
        $('#lan-url').textContent = 'LAN: http://' + s.lanIps[0] + ':' + s.port;
        $('#settings-server-info').textContent = 'http://' + s.lanIps[0] + ':' + s.port + ' · ' + s.chatCount + ' chat(s)';
      }
    } catch (e) {
      setStatus('err', 'Server offline');
    }
  }

  async function init() {
    try {
      const t = localStorage.getItem('cgpt-theme');
      if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    } catch (e) {}
    const s = await refreshChatList();
    if (s && s.activeChatId) {
      await selectChat(s.activeChatId);
    }
    input.focus();
    pollStatus();
    setInterval(pollStatus, 5000);
  }

  init();
})();
