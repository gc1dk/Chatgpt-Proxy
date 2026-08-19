const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const homeUrl = () => process.env.HOME_URL || 'https://chatgpt.com/';
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const RESET_MARKER = '__CG_RESET__';
const ASSISTANT_INNER = '[data-stream-target], [data-assistant-markdown], [data-message-copy]';
const CHALLENGE_TITLE = 'Just a moment...';
const MAX_COMPOSER_MSG = parseInt(process.env.MAX_PROMPT || '500000', 10);

// Multi-selector fallbacks so a single class/attribute rename by OpenAI can't break the driver.
const SEL = {
  composer: ['[data-mobile-composer]', '#composer-form', 'main form[data-testid*="composer"]', 'main form'],
  textarea: ['[data-mobile-composer-prompt]', '#prompt-textarea', 'main form textarea', 'form textarea'],
  submit: [
    '[data-composer-submit]',
    'button[data-testid="send-button"]',
    'button[aria-label*="Send"]',
    'form button[type="submit"]',
  ],
  stop: ['[data-composer-submit][data-stop-generating]', 'button[data-testid="stop-button"]', 'button[aria-label*="Stop"]'],
  file: ['input[type="file"]', 'input[multiple]', 'form input[type="file"]'],
  assistant: ['[data-message-role="assistant"]', '[data-message-author-role="assistant"]'],
  roles: ['[data-message-role]', '[data-message-author-role]'],
  userInner: ['[data-user-message-copy]', '[data-user-message-bubble]'],
  assistantStreaming: [
    '[data-message-role="assistant"][data-message-streaming]',
    '[data-message-author-role="assistant"][data-message-streaming]',
  ],
  gate: ['[data-conversation-gate-panel]'],
  retry: ['[data-safety-retry]'],
  inner: ['[data-stream-target]', '[data-assistant-markdown]', '[data-message-copy]', '.markdown'],
};

// Heuristic last-resort selectors for when OpenAI changes the page structure
// and none of the known selectors match anymore. These are only tried after
// every known selector fails, and the first working one is cached to selectors.json.
const HEURISTICS = {
  composer: ['textarea', '[contenteditable="true"]', '[role="textbox"]'],
  textarea: ['textarea', '[contenteditable="true"]'],
  submit: ['button[type="submit"]', 'button[data-testid="send-button"]', 'button[aria-label*="send" i]'],
  stop: ['button[data-testid="stop-button"]', 'button[aria-label*="stop" i]'],
  file: ['input[type="file"]'],
  assistant: ['[data-message-author-role="assistant"]', 'article[data-testid*="conversation-turn"] .markdown'],
  roles: ['[data-message-author-role]', 'article[data-testid*="conversation-turn"]'],
  userInner: ['[data-user-message-copy]', '[data-user-message-bubble]', '.whitespace-pre-wrap'],
  inner: ['[data-stream-target]', '[data-assistant-markdown]', '[data-message-copy]', '.markdown', '[data-message-text]'],
};

const PAGE_TOOLS = `
  window.__pick = (list) => { for (const s of list) { const el = document.querySelector(s); if (el) return el; } return null; };
  window.__pickAll = (list) => { for (const s of list) { const els = document.querySelectorAll(s); if (els.length) return Array.from(els); } return []; };
  window.__innerOf = (el, list) => { for (const s of list) { const i = el.querySelector(s); if (i) return i; } return null; };
  true;
`;

class ChatGPTDriver {
  constructor({ headed = false, profileDir = null, timeoutMs = 180000, stateFile = null, selectorsFile = null } = {}) {
    this.headed = headed;
    this.profileDir = profileDir;
    this.timeoutMs = timeoutMs;
    this.stateFile = stateFile;
    this.selectorsFile = selectorsFile || process.env.SELECTORS_FILE || path.join(__dirname, 'selectors.json');
    this.context = null;
    this.page = null;
    this.pages = {};
    this._initialPage = null;
    this._deltas = {};
    this.ready = false;
    this.busy = false;
    this._startPromise = null;
    this._selCache = {};
    try {
      const loaded = JSON.parse(fs.readFileSync(this.selectorsFile, 'utf8'));
      if (loaded && typeof loaded === 'object') this._selCache = loaded;
    } catch {}
    this.selOrder = {};
    for (const slot of Object.keys(SEL)) {
      const seen = [];
      const list = [];
      for (const s of [this._selCache[slot], ...SEL[slot], ...(HEURISTICS[slot] || [])]) {
        if (s && !seen.includes(s)) {
          seen.push(s);
          list.push(s);
        }
      }
      this.selOrder[slot] = list;
    }
  }

  async _healSelectors(page) {
    try {
      const report = await page.evaluate((sel) => {
        const out = {};
        for (const slot of Object.keys(sel)) {
          let found = null;
          for (const s of sel[slot]) {
            if (s && document.querySelector(s)) {
              found = s;
              break;
            }
          }
          out[slot] = found;
        }
        return out;
      }, this.selOrder);
      let changed = false;
      for (const slot of Object.keys(report)) {
        const s = report[slot];
        if (s && this._selCache[slot] !== s) {
          this._selCache[slot] = s;
          changed = true;
        }
      }
      if (changed) {
        try {
          fs.writeFileSync(this.selectorsFile, JSON.stringify(this._selCache, null, 2));
          console.log('[chatgpt] selectors healed →', this.selectorsFile);
        } catch {}
      }
    } catch {}
  }

  async start() {
    if (this._startPromise) return this._startPromise;
    this._startPromise = (async () => {
      const opts = {
        headless: !this.headed,
        viewport: { width: 1366, height: 900 },
        userAgent: MOBILE_UA,
        locale: 'en-US',
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--lang=en-US',
        ],
      };
      if (this.profileDir) {
        this.context = await chromium.launchPersistentContext(this.profileDir, opts);
        this.page = this.context.pages()[0] || (await this.context.newPage());
      } else {
        this.context = await chromium.launch(opts);
        this.page = await this.context.newPage();
      }
      await this._preparePage(this.page);
      await this._openConversation(this.page);
      this._initialPage = this.page;
      this.ready = true;
      console.log('[chatgpt] chat page ready');
    })();
    return this._startPromise;
  }

  async _preparePage(page) {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.__pick = (list) => {
        for (const s of list) {
          const el = document.querySelector(s);
          if (el) return el;
        }
        return null;
      };
      window.__pickAll = (list) => {
        for (const s of list) {
          const els = document.querySelectorAll(s);
          if (els.length) return Array.from(els);
        }
        return [];
      };
      window.__innerOf = (el, list) => {
        for (const s of list) {
          const i = el.querySelector(s);
          if (i) return i;
        }
        return null;
      };
    });
    page.setDefaultTimeout(30000);
    await page.exposeFunction('__cgStreamDelta', (payload) => {
      const cb = this._deltas[page.__cgChatId];
      if (cb) cb(payload);
    });
  }

  async _openConversation(page) {
    const savedUrl = this.stateFile ? await this._readStateUrl() : null;
    if (savedUrl) {
      try {
        await page.goto(savedUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        if (await this.waitForComposer(60000, page)) {
          console.log('[chatgpt] restored conversation:', savedUrl);
          return;
        }
        console.log('[chatgpt] saved conversation unreachable, falling back to home');
        await page.goto(homeUrl(), { waitUntil: 'domcontentloaded', timeout: 60000 });
      } catch {
        await page.goto(homeUrl(), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      }
    } else {
      await page.goto(homeUrl(), { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    await this.waitForComposer(120000, page);
  }

  async ensureChat(chatId) {
    await this.start();
    if (this.pages[chatId]) return this.pages[chatId];
    let page;
    if (this._initialPage) {
      page = this._initialPage;
      this._initialPage = null;
    } else {
      page = await this.context.newPage();
      await this._preparePage(page);
      await this._openConversation(page);
    }
    page.__cgChatId = chatId;
    this.pages[chatId] = page;
    this.page = page;
    return page;
  }

  async waitForComposer(timeout = 90000, page = this.page) {
    const deadline = Date.now() + timeout;
    let reloaded = false;
    while (Date.now() < deadline) {
      let state = null;
      try {
        state = await page.evaluate((sel) => ({
          title: document.title,
          hasComposer: !!window.__pick(sel.composer),
        }), this.selOrder);
      } catch {
        state = { title: '', hasComposer: false };
      }
      if (state.hasComposer) {
        await this._healSelectors(page).catch(() => {});
        return true;
      }
      if (state.title === CHALLENGE_TITLE || (!state.title && reloaded)) {
        console.log('[chatgpt] challenge page, reloading...');
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
        reloaded = true;
        await sleep(1500);
        continue;
      }
      await sleep(2000);
    }
    throw new Error('composer did not appear (verification may be blocking)');
  }

  async _fileSelector(page) {
    try {
      return await page.evaluate(
        (fileSels) => {
          for (const s of fileSels) {
            const el = document.querySelector(s);
            if (el) return s;
          }
          return null;
        },
        this.selOrder.file
      );
    } catch {
      return null;
    }
  }

  async _waitForAttachments(page) {
    const start = Date.now();
    const deadline = start + 45000;
    while (Date.now() < deadline) {
      try {
        const st = await page.evaluate(
          (fileSels) => {
            const input = window.__pick(fileSels);
            const hasFiles = !!(input && input.files && input.files.length);
            const thumbs = Array.from(
              document.querySelectorAll(
                'img[alt*="attachment" i], [data-testid*="attachment" i] img, [data-attachment-card] img'
              )
            );
            const processing = Array.from(document.querySelectorAll('[data-testid*="attachment" i]')).some(
              (el) => /processing|uploading|uploaded/i.test(el.textContent || '')
            );
            return { hasFiles, thumbs: thumbs.length, processing };
          },
          this.selOrder.file
        );
        if (st.thumbs > 0 && !st.processing) return true;
        if (!st.hasFiles && Date.now() - start > 8000) return false;
      } catch {}
      await sleep(600);
    }
    return false;
  }

  async status() {
    if (!this.page) return { ready: false, error: 'not_started' };
    try {
      const s = await this.page.evaluate((sel) => {
        const gatePanel = window.__pick(sel.gate);
        const retry = window.__pick(sel.retry);
        const composer = window.__pick(sel.composer);
        return {
          gated: !!(gatePanel || document.documentElement.hasAttribute('data-conversation-gated')),
          retryAfter: retry ? retry.getAttribute('data-retry-after') || '' : '',
          composerReady: !!composer,
          title: document.title,
        };
      }, this.selOrder);
      const captcha = this.page
        .frames()
        .some(
          (f) =>
            (f.url() || '').includes('challenges.cloudflare.com') ||
            (f.url() || '').includes('hcaptcha') ||
            (f.url() || '').includes('captcha')
        );
      return { ready: this.ready, ...s, captcha, challenge: s.title === CHALLENGE_TITLE };
    } catch {
      return { ready: this.ready, error: 'page_unavailable' };
    }
  }

  async _readStateUrl() {
    try {
      return JSON.parse(fs.readFileSync(this.stateFile, 'utf8')).conversationUrl || null;
    } catch {
      return null;
    }
  }

  async getLastAssistantText(chatId) {
    const page = this.pages[chatId] || this.page;
    try {
      return await page.evaluate((sel) => {
        const els = window.__pickAll(sel.assistant);
        if (!els.length) return '';
        const el = els[els.length - 1];
        const inner = window.__innerOf(el, sel.inner);
        return inner ? inner.textContent : el.textContent;
      }, this.selOrder);
    } catch {
      return '';
    }
  }

  async getHistory(chatId) {
    const page = this.pages[chatId] || this.page;
    if (!page) return [];
    try {
      return await page.evaluate((sel) => {
        const out = [];
        for (const el of window.__pickAll(sel.roles)) {
          if (el.closest('[hidden]')) continue;
          const streamingSel = sel.assistantStreaming;
          if (el.matches(streamingSel.join(','))) continue;
          const role = el.getAttribute('data-message-role') || el.getAttribute('data-message-author-role');
          const inner = window.__innerOf(el, sel.inner.concat(sel.userInner));
          const text = inner ? inner.textContent.trim() : el.textContent.trim();
          if (text) out.push({ role, text });
        }
        return out;
      }, this.selOrder);
    } catch {
      return [];
    }
  }

  async submit({ chatId, message, onDelta = null, images = null }) {
    const deadline = Date.now() + this.timeoutMs;
    while (this.busy) {
      if (Date.now() > deadline) throw new Error('browser is busy');
      await sleep(750);
    }
    const page = await this.ensureChat(chatId);
    this.page = page;
    this.busy = true;
    if (onDelta) this._deltas[chatId] = onDelta;
    try {
      await this._healSelectors(page).catch(() => {});
      if (message.length > MAX_COMPOSER_MSG) {
        throw new Error(
          'message is too large for the ChatGPT composer (' +
            Math.round(message.length / 1024) +
            ' KB). Split it into smaller messages.'
        );
      }
      const baseline = await this.getLastAssistantText(chatId);
      const baselineCount = await page
        .evaluate((sel) => window.__pickAll(sel.assistant).length, this.selOrder)
        .catch(() => 0);

      // Fill the composer and VERIFY the page accepted the value. Huge messages can
      // be rejected by the page (React never committing the state) — detect that
      // immediately instead of silently waiting for a reply that never comes.
      let filled = false;
      let fillLen = 0;
      for (let attempt = 0; attempt < 3 && !filled; attempt++) {
        const st = await page
          .evaluate(
            ({ text, taSels }) => {
              const ta = window.__pick(taSels);
              if (!ta) return { ok: false, reason: 'composer textarea not found' };
              const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
              setter.call(ta, text);
              ta.dispatchEvent(new Event('input', { bubbles: true }));
              return { ok: ta.value === text, len: ta.value.length };
            },
            { text: message, taSels: this.selOrder.textarea }
          )
          .catch(() => ({ ok: false, reason: 'composer evaluate failed' }));
        if (st.reason) throw new Error(st.reason);
        filled = st.ok;
        fillLen = st.len || 0;
        if (!filled) await sleep(600);
      }
      if (!filled) {
        throw new Error(
          'ChatGPT did not accept the message (' +
            Math.round(message.length / 1024) +
            ' KB — composer holds ' +
            Math.round(fillLen / 1024) +
            ' KB). It may be too large for the page — try splitting it.'
        );
      }

      // Attach images (if any) through the composer's real file input, then wait
      // for ChatGPT to finish processing them (thumbnails appear) before sending.
      if (images && images.length) {
        const fileSel = await this._fileSelector(page);
        if (!fileSel) {
          throw new Error('could not attach the image to the composer (file input not found)');
        }
        await page
          .setInputFiles(
            fileSel,
            images.map((im) => ({
              name: im.name || 'image.png',
              mimeType: im.mimeType || 'image/png',
              buffer: im.buffer,
            }))
          )
          .catch(() => {
            throw new Error('could not attach the image to the composer');
          });
        if (!(await this._waitForAttachments(page))) {
          throw new Error('image attachment did not finish processing');
        }
      }

      // Wait for the send button to become enabled (React committed the value).
      // If the setter path never enables it, fall back to real IME-style typing
      // (keyboard.insertText) — the most compatible way to talk to any React composer.
      const btnOk = async () => {
        const st = await page
          .evaluate(
            ({ btnSels, stopSels }) => {
              if (window.__pick(stopSels)) return { sending: true };
              const btn = window.__pick(btnSels);
              if (!btn) return { none: true };
              return { disabled: !!btn.disabled };
            },
            { btnSels: this.selOrder.submit, stopSels: this.selOrder.stop }
          )
          .catch(() => ({ none: true }));
        if (st.sending) return true;
        if (st.none) return true;
        return !st.disabled;
      };
      let sendReady = await btnOk();
      if (!sendReady) {
        const focused = await page
          .evaluate((taSels) => {
            const ta = window.__pick(taSels);
            if (!ta) return false;
            ta.focus();
            return true;
          }, this.selOrder.textarea)
          .catch(() => false);
        if (focused) {
          await page.keyboard.press('ControlOrMeta+a').catch(() => {});
          await page.keyboard.press('Delete').catch(() => {});
          await page.keyboard.insertText(message).catch(() => {});
          for (let i = 0; i < 20 && !sendReady; i++) {
            await sleep(750);
            sendReady = await btnOk();
          }
        }
      }
      if (!sendReady) {
        throw new Error(
          'ChatGPT did not accept the message (send button stayed disabled). It may be too large — try splitting it.'
        );
      }

      await page.evaluate(
        ({ sel, resetMarker, baseline }) => {
          window.__cgSeen = baseline;
          if (window.__cgObs) {
            window.__cgObs.disconnect();
            window.__cgObs = null;
          }
          const lastAssistant = () => {
            const els = window.__pickAll(sel.assistant);
            return els.length ? els[els.length - 1] : null;
          };
          const extract = (el) => {
            const inner = window.__innerOf(el, sel.inner);
            return inner ? inner.textContent : el.textContent;
          };
          const obs = new MutationObserver(() => {
            const el = lastAssistant();
            if (!el) return;
            const text = extract(el);
            if (text.startsWith(window.__cgSeen)) {
              const added = text.slice(window.__cgSeen.length);
              window.__cgSeen = text;
              if (added) window.__cgStreamDelta(added);
            } else {
              window.__cgSeen = text;
              window.__cgStreamDelta(resetMarker);
              if (text) window.__cgStreamDelta(text);
            }
          });
          obs.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['data-message-streaming'],
          });
          window.__cgObs = obs;
        },
        { sel: this.selOrder, resetMarker: RESET_MARKER, baseline }
      );

      const trySend = async () => {
        await page.evaluate(
          ({ cSels, bSels }) => {
            const form = window.__pick(cSels);
            const btn = window.__pick(bSels);
            if (btn && typeof btn.click === 'function') btn.click();
            else if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
          },
          { cSels: this.selOrder.composer, bSels: this.selOrder.submit }
        );
      };
      await trySend();

      // Verify the send actually started: the stop button appears (generation
      // running) or the composer value cleared (fast send).
      const sendCheck = async () => {
        return await page
          .evaluate(
            ({ taSels, stopSels }) => {
              if (window.__pick(stopSels)) return true;
              const ta = window.__pick(taSels);
              if (!ta || !ta.value) return true;
              return false;
            },
            { taSels: this.selOrder.textarea, stopSels: this.selOrder.stop }
          )
          .catch(() => false);
      };
      let sent = await sendCheck();
      for (let i = 0; i < 20 && !sent; i++) {
        await sleep(750);
        sent = await sendCheck();
      }
      if (!sent) {
        // Real Enter keypress fallback (synthetic events can be ignored by React).
        await page
          .evaluate((taSels) => {
            const ta = window.__pick(taSels);
            if (ta) ta.focus();
          }, this.selOrder.textarea)
          .catch(() => {});
        await page.keyboard.press('Enter').catch(() => {});
        for (let i = 0; i < 6 && !sent; i++) {
          await sleep(750);
          sent = await sendCheck();
        }
      }
      if (!sent) {
        throw new Error(
          'Could not send the message to ChatGPT (the composer did not clear after clicking send). Try again — if this keeps happening, the page layout may have changed.'
        );
      }

      const result = await this.waitForCompletion(baseline, page, baselineCount);
      await page
        .evaluate(() => {
          if (window.__cgObs) {
            window.__cgObs.disconnect();
            window.__cgObs = null;
          }
        })
        .catch(() => {});
      return result;
    } finally {
      delete this._deltas[chatId];
      this.busy = false;
    }
  }

  async waitForCompletion(baseline, page, baselineCount = 0) {
    const started = Date.now();
    let lastText = '';
    let lastCount = 0;
    let stable = 0;
    let gateTries = 0;
    while (Date.now() - started < this.timeoutMs) {
      let state = null;
      try {
        state = await page.evaluate((sel) => {
          const els = window.__pickAll(sel.assistant);
          const el = els.length ? els[els.length - 1] : null;
          const streamingEl = window.__pick(sel.assistantStreaming);
          const stopBtn = window.__pick(sel.stop);
          const gatePanel = window.__pick(sel.gate);
          const retry = window.__pick(sel.retry);
          let text = '';
          if (el) {
            const inner = window.__innerOf(el, sel.inner);
            text = inner ? inner.textContent : el.textContent;
          }
          return {
            text,
            count: els.length,
            streaming: !!streamingEl,
            submitting: !!stopBtn,
            gate: !!gatePanel,
            retry: !!retry,
            retryDisabled: retry ? retry.disabled : false,
            retryAfter: retry ? retry.getAttribute('data-retry-after') : null,
          };
        }, this.selOrder);
      } catch {
        await sleep(200);
        continue;
      }

      if (state.gate) {
        if (state.retry && !state.retryDisabled && gateTries < 3) {
          gateTries += 1;
          console.log(`[chatgpt] safety gate, auto-retrying (${gateTries})`);
          await page
            .evaluate(() => {
              const r = document.querySelector('[data-safety-retry]');
              if (r) r.click();
            })
            .catch(() => {});
          await sleep(1500);
          continue;
        }
        return { error: 'rate_limited', retryAfter: state.retryAfter, text: state.text.trim() };
      }

      const fresh = state.text !== baseline || state.count > baselineCount;
      if (fresh && state.text) {
        if (state.text !== lastText || state.count !== lastCount) {
          lastText = state.text;
          lastCount = state.count;
          stable = 0;
        } else {
          stable += 1;
        }
        if (!state.streaming && !state.submitting && stable >= 4) {
          return { error: null, retryAfter: null, text: state.text.trim() };
        }
      }
      await sleep(250);
    }
    return { error: 'timeout', retryAfter: null, text: lastText.trim() };
  }

  async resetSession() {
    try {
      await this.context.clearCookies();
    } catch {}
    for (const page of Object.values(this.pages)) {
      try {
        await page.goto(homeUrl(), { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.waitForComposer(90000, page);
      } catch {}
    }
    if (this._initialPage) {
      try {
        await this._initialPage.goto(homeUrl(), { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.waitForComposer(90000, this._initialPage);
      } catch {}
    }
    console.log('[chatgpt] session cookies cleared, pages reloaded');
  }

  async stop() {
    const page = this.page;
    if (!page) return;
    await page
      .evaluate((sel) => {
        const b = window.__pick(sel.stop);
        if (b) b.click();
      }, SEL)
      .catch(() => {});
  }

  async closeChat(chatId) {
    const page = this.pages[chatId];
    if (!page) return;
    try {
      await page.close();
    } catch {}
    delete this.pages[chatId];
    delete this._deltas[chatId];
    if (this.page === page) {
      const next = Object.values(this.pages)[0];
      this.page = next || this._initialPage || null;
    }
  }

  async dispose() {
    try {
      await this.context.close();
    } catch {}
    this.context = null;
    this.page = null;
    this.pages = {};
    this._initialPage = null;
    this.ready = false;
    this._startPromise = null;
  }
}

module.exports = { ChatGPTDriver, RESET_MARKER };
