// Mock ChatGPT page for offline driver + server testing.
// Serves a page that mirrors the DOM surface the driver expects:
//   [data-mobile-composer], [data-mobile-composer-prompt],
//   [data-composer-submit], [data-message-role], [data-message-streaming]
// and a /mock-chat endpoint that appends assistant messages.
'use strict';

const http = require('http');

const HTML = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Mock ChatGPT</title></head>
<body>
  <div id="conv"></div>
  <div data-mobile-composer>
    <textarea data-mobile-composer-prompt></textarea>
    <button data-composer-submit data-testid="send-btn">Send</button>
  </div>
  <script>
    const conv = document.getElementById('conv');
    const ta = document.querySelector('[data-mobile-composer-prompt]');
    const btn = document.querySelector('[data-composer-submit]');
    btn.disabled = true;
    ta.addEventListener('input', () => {
      btn.disabled = !ta.value;
    });

    function addMessage(role, text, streaming) {
      const el = document.createElement('div');
      el.setAttribute('data-message-role', role);
      if (streaming) el.setAttribute('data-message-streaming', 'true');
      const inner = document.createElement('div');
      inner.setAttribute('data-message-copy', '');
      inner.textContent = text;
      el.appendChild(inner);
      conv.appendChild(el);
      return el;
    }

    btn.addEventListener('click', () => {
      const text = ta.value;
      if (!text) return;
      addMessage('user', text);
      ta.value = '';
      // Simulate generation: append tokens, then finish.
      const el = addMessage('assistant', 'I', true);
      btn.setAttribute('data-stop-generating', 'true');
      const wantsCode = !!(text.toLowerCase().match('(^|[^a-z])code([^a-z]|$)') ||
        text.toLowerCase().match('(^|[^a-z])js([^a-z]|$)') ||
        text.toLowerCase().match('(^|[^a-z])(javascript|function)([^a-z]|$)'));
      const BT = String.fromCharCode(96);
      const fence = BT + BT + BT;
      const tokens = wantsCode
        ? ['\\nHere', ' is', ' a', ' function', ':', '\\n' + fence + 'js', '\\nfunction hello() {', '\\n  return 42;', '\\n}', '\\n' + fence, '\\nCall', ' it', ' like', ' hello', '().']
        : ["\\nI'm", ' the', ' mock', ' reply'];
      let i = 0;
      const timer = setInterval(() => {
        if (i >= tokens.length) {
          clearInterval(timer);
          el.removeAttribute('data-message-streaming');
          btn.removeAttribute('data-stop-generating');
          return;
        }
        const inner = el.children[0];
        inner.textContent = (inner.textContent || '') + tokens[i++];
      }, 60);
    });

    // expose for tests
    window.__mock = { addMessage };
  </script>
</body>
</html>`;

let conversations = [];

const BARE_HTML = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Mock ChatGPT</title></head>
<body>
  <div id="conv"></div>
  <div class="composer">
    <textarea id="chat-input"></textarea>
    <button type="submit" id="send-btn">Send</button>
  </div>
  <script>
    const conv = document.getElementById('conv');
    const ta = document.getElementById('chat-input');
    const btn = document.getElementById('send-btn');
    btn.disabled = true;
    ta.addEventListener('input', () => {
      btn.disabled = !ta.value;
    });
    function addMessage(role, text, streaming) {
      const el = document.createElement('div');
      el.setAttribute('data-message-role', role);
      if (streaming) el.setAttribute('data-message-streaming', 'true');
      const inner = document.createElement('div');
      inner.setAttribute('data-message-copy', '');
      inner.textContent = text;
      el.appendChild(inner);
      conv.appendChild(el);
      return el;
    }
    btn.addEventListener('click', () => {
      const text = ta.value;
      if (!text) return;
      addMessage('user', text);
      ta.value = '';
      const el = addMessage('assistant', 'I', true);
      btn.setAttribute('data-stop-generating', 'true');
      const tokens = ["\\nI'm", ' the', ' bare', ' reply'];
      let i = 0;
      const timer = setInterval(() => {
        if (i >= tokens.length) {
          clearInterval(timer);
          el.removeAttribute('data-message-streaming');
          btn.removeAttribute('data-stop-generating');
          return;
        }
        const inner = el.children[0];
        inner.textContent = (inner.textContent || '') + tokens[i++];
      }, 60);
    });
    window.__mock = { addMessage };
  </script>
</body>
</html>`;

function booleq(v) {
  return v === '1' || v === 'true';
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/') {
    const bare = url.searchParams.get('bare') === '1';
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(bare ? BARE_HTML : HTML);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/mock-reset') {
    conversations = [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }
  if (req.method === 'GET' && url.pathname === '/mock-state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      primary: conversations[conversations.length - 1] || null,
      total: conversations.length,
    }));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/mock-chat') {
    const text = url.searchParams.get('text') || 'mock reply';
    const role = url.searchParams.get('role') || 'assistant';
    const streaming = booleq(url.searchParams.get('streaming'));
    const append = url.searchParams.get('append');
    const record = {
      role,
      text,
      streaming,
      at: Date.now(),
      served: Object.keys(server._pages || {}),
    };
    if (append && server._appendTo) {
      server._appendTo(append, role, text);
    }
    conversations.push(record);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, role, text }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end('{"error":"not found"}');
});

server._pages = {};

server.start = function start(port) {
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server.address().port));
  });
};

server.stop = function stop() {
  return new Promise((resolve) => server.close(resolve));
};

module.exports = server;