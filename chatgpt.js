const fs = require('fs');
const { chromium } = require('playwright');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HOME_URL = 'https://chatgpt.com/';
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const RESET_MARKER = '__CG_RESET__';
const ASSISTANT_INNER = '[data-stream-target], [data-assistant-markdown], [data-message-copy]';
const CHALLENGE_TITLE = 'Just a moment...';

class ChatGPTDriver {
  constructor({ headed = false, profileDir = null, timeoutMs = 180000, stateFile = null } = {}) {
    this.headed = headed;
    this.profileDir = profileDir;
    this.timeoutMs = timeoutMs;
    this.stateFile = stateFile;
    this.context = null;
    this.page = null;
    this.pages = {};
    this._initialPage = null;
    this._deltas = {};
    this.ready = false;
    this.busy = false;
    this._startPromise = null;
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
        await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      } catch {
        await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      }
    } else {
      await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
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
        state = await page.evaluate(() => ({
          title: document.title,
          hasComposer: !!document.querySelector('[data-mobile-composer]'),
        }));
      } catch {
        state = { title: '', hasComposer: false };
      }
      if (state.hasComposer) return true;
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

  async status() {
    if (!this.page) return { ready: false, error: 'not_started' };
    try {
      const s = await this.page.evaluate(() => {
        const gatePanel = document.querySelector('[data-conversation-gate-panel]');
        const retry = document.querySelector('[data-safety-retry]');
        const composer = document.querySelector('[data-mobile-composer]');
        return {
          gated: !!(gatePanel || document.documentElement.hasAttribute('data-conversation-gated')),
          retryAfter: retry ? retry.getAttribute('data-retry-after') || '' : '',
          composerReady: !!composer,
          title: document.title,
        };
      });
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
      return await page.evaluate((innerSel) => {
        const els = document.querySelectorAll('[data-message-role="assistant"]');
        if (!els.length) return '';
        const el = els[els.length - 1];
        const inner = el.querySelector(innerSel);
        return inner ? inner.textContent : el.textContent;
      }, ASSISTANT_INNER);
    } catch {
      return '';
    }
  }

  async getHistory(chatId) {
    const page = this.pages[chatId] || this.page;
    if (!page) return [];
    try {
      return await page.evaluate((innerSel) => {
        const out = [];
        for (const el of document.querySelectorAll('[data-message-role]')) {
          if (el.closest('[hidden]')) continue;
          if (el.matches('[data-message-role="assistant"][data-message-streaming]')) continue;
          const role = el.getAttribute('data-message-role');
          const inner = el.querySelector(innerSel + ', [data-user-message-copy], [data-user-message-bubble]');
          const text = inner ? inner.textContent.trim() : el.textContent.trim();
          if (text) out.push({ role, text });
        }
        return out;
      }, ASSISTANT_INNER);
    } catch {
      return [];
    }
  }

  async submit({ chatId, message, onDelta = null }) {
    if (this.busy) throw new Error('browser is busy');
    const page = await this.ensureChat(chatId);
    this.page = page;
    this.busy = true;
    if (onDelta) this._deltas[chatId] = onDelta;
    try {
      const baseline = await this.getLastAssistantText(chatId);
      const filled = await page.evaluate((msg) => {
        const ta = document.querySelector('[data-mobile-composer-prompt]');
        if (!ta) return false;
        ta.value = msg;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }, message);
      if (!filled) throw new Error('composer not found');

      await page.evaluate(
        ({ baseline, innerSel, resetMarker }) => {
          window.__cgSeen = baseline;
          if (window.__cgObs) {
            window.__cgObs.disconnect();
            window.__cgObs = null;
          }
          const lastAssistant = () => {
            const els = document.querySelectorAll('[data-message-role="assistant"]');
            return els.length ? els[els.length - 1] : null;
          };
          const extract = (el) => {
            const inner = el.querySelector(innerSel);
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
        { baseline, innerSel: ASSISTANT_INNER, resetMarker: RESET_MARKER }
      );

      await page.evaluate(() => {
        const form = document.querySelector('[data-mobile-composer]');
        const btn = form && form.querySelector('[data-composer-submit]');
        if (btn && typeof btn.click === 'function') btn.click();
        else if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
      });

      const result = await this.waitForCompletion(baseline, page);
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

  async waitForCompletion(baseline, page) {
    const started = Date.now();
    let lastText = '';
    let stable = 0;
    let gateTries = 0;
    while (Date.now() - started < this.timeoutMs) {
      let state = null;
      try {
        state = await page.evaluate((innerSel) => {
          const els = document.querySelectorAll('[data-message-role="assistant"]');
          const el = els.length ? els[els.length - 1] : null;
          const streamingEl = document.querySelector('[data-message-role="assistant"][data-message-streaming]');
          const stopBtn = document.querySelector('[data-composer-submit][data-stop-generating]');
          const gatePanel = document.querySelector('[data-conversation-gate-panel]');
          const retry = document.querySelector('[data-safety-retry]');
          let text = '';
          if (el) {
            const inner = el.querySelector(innerSel);
            text = inner ? inner.textContent : el.textContent;
          }
          return {
            text,
            streaming: !!streamingEl,
            submitting: !!stopBtn,
            gate: !!gatePanel,
            retry: !!retry,
            retryDisabled: retry ? retry.disabled : false,
            retryAfter: retry ? retry.getAttribute('data-retry-after') : null,
          };
        }, ASSISTANT_INNER);
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

      if (state.text !== baseline && state.text) {
        if (state.text !== lastText) {
          lastText = state.text;
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
        await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.waitForComposer(90000, page);
      } catch {}
    }
    if (this._initialPage) {
      try {
        await this._initialPage.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.waitForComposer(90000, this._initialPage);
      } catch {}
    }
    console.log('[chatgpt] session cookies cleared, pages reloaded');
  }

  async stop() {
    const page = this.page;
    if (!page) return;
    await page
      .evaluate(() => {
        const b = document.querySelector('[data-composer-submit][data-stop-generating]');
        if (b) b.click();
      })
      .catch(() => {});
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
