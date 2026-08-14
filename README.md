# ChatGPT Gateway — ChatGPT gateway (BETA)

An open-source proxy that gives you a ChatGPT-style chat experience by driving the official ChatGPT website in a headless browser, then streaming the response back to a clean, self-hosted interface.

> [!WARNING]
> **BETA SOFTWARE:** Experimental. Upstream behavior, features, and compatibility can change or break without notice.

> [!IMPORTANT]
> This project is not affiliated with, endorsed by, or sponsored by OpenAI.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [How It Works](#how-it-works)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [LAN Access](#lan-access)
- [API](#api)
- [FAQ](#faq)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Limitations](#limitations)
- [Roadmap](#roadmap)
- [License](#license)
- [Disclaimer](#disclaimer)
- [Author](#author)
- [Updates](#updates)

---

## Overview

> I got tired of waiting for usage limits to reset. So I built something.

Instead of polling the site by hand, this project opens the official ChatGPT experience in an automated browser and exposes it to you (and your LAN) through a small Express server with a custom, ChatGPT-like web UI.

There is no company behind this project and no expectation of profit. It is a personal project released publicly so other developers can inspect, experiment with, improve, and contribute to it.

---

## Features

- **Real ChatGPT** — replies come from the official ChatGPT website's own chat, driven by a headless Chromium (Playwright)
- **Full conversation context / memory** — every chat keeps its own live browser tab; the model remembers the entire conversation per chat
- **Cross-restart memory** — when the server restarts, the whole saved transcript is re-fed into the model as hidden context, so resumed chats keep their memory (hidden from the transcript)
- **Multiple chats** — a sidebar like ChatGPT's: create, switch, and resume chats; each chat has its own independent context
- **Auto-save** — every chat transcript is saved to `chats.json` after each message (and during long replies), so nothing is lost when the server or `start.bat` is closed
- **System prompt** — set custom instructions in Settings; they're applied as each chat's first message (hidden from the transcript, active in the model's context)
- **Streaming responses** — tokens are streamed to the UI in real time over SSE
- **Web search** — use ChatGPT's own built-in web search toggle in the chat (no custom reimplementation)
- **Markdown + syntax highlighting** — responses render markdown, code blocks, copy buttons, and a download button per reply
- **ChatGPT-style interface** — clean 1:1 UI: logo, sidebar, theme toggle, settings, streaming bubbles; no ads, no paid features
- **Code tab** — every code block in a reply becomes an artifact (per language, version picker, live preview, run, download, copy) collected in a dedicated Code workspace
- **Chat export** — download any chat as a Markdown file (`.md`) from the sidebar
- **Optional auth + accounts** — set `AUTH_TOKEN` to enable login. Users can create accounts in the UI (username + password); chats belong to the account, not the browser, so they follow you across devices. A master-token mode is also available for API clients
- **Offline test suite** — `npm test` runs 54 automated tests (driver, API, auth, UI) against a mock ChatGPT page, no real ChatGPT account or network access needed
- **Settings** — theme, system prompt, and a "clear cookies / fresh session" button
- **Model disclaimer** — the UI states clearly that the AI models belong to OpenAI and are not owned or modified by this project
- **Private per account** — each account (or browser, without login) gets its own chat list and history; no one else on your LAN can see your chats
- **Request queue** — messages are processed one at a time; clients wait their turn (per-client depth cap when auth is on)
- **Stop generation** — cancel the current response, or your queued one (each user can only cancel their own; master can cancel anything)
- **Persistent profile** — cookies and session data survive restarts in `./profile`
- **Auto driver self-healing** — if ChatGPT changes its page structure, the driver detects the new selectors (with heuristic fallbacks), caches them to `selectors.json`, and keeps working without code changes
- **OpenAI-compatible API** — `POST /v1/chat/completions` (stream + non-stream) + `GET /v1/models`, so local apps, CLIs, and IDEs can use this as a drop-in endpoint; a built-in in-app **API panel** (top-right arrow button) shows your base URL, auth, copy-ready `curl`, and a live test
- **In-app updates** — the UI checks GitHub for new releases and can update + restart the server with one click
- **Voice** — dictation button in the composer (browser SpeechRecognition; needs a secure page, i.e. https or localhost) plus **spoken replies**: assistant answers are read aloud with Microsoft Edge neural voices (Aria — the same voice ChatGPT uses), streamed free from the server with no API keys. Toggle "Speak replies" and pick a voice in Settings, or press Play on any reply
- **Mobile layout** — sidebar becomes a slide-in drawer on small screens
- **MIT licensed**

---

## How It Works

```
+------------+   SSE    +---------------+        +-----------------------+
|  Your UI   | <------> |  Express      | drive  |  Headless Chromium    |
|  (public/) |          |  server.js    |------->|  + chatgpt.com        |
|            |          |  + queue      |        |  (mobile UA)          |
+------------+          +---------------+        +-----------------------+
```

1. You type a message in the web UI (`public/`).
2. `server.js` queues the request and emits SSE events (`queue`, `delta`, `reset`, `done`, `error`).
3. Each chat owns a tab in the headless Chromium (iPhone user-agent) against the ChatGPT mobile web app. Your message is typed into that chat's real composer and sent.
4. A `MutationObserver` inside the page watches the assistant's message element and pushes new characters out through `exposeFunction` → streamed to your UI as `delta` events.
5. Because each chat's tab is never reloaded between messages, the model keeps full context of that conversation.
6. After every turn (and every ~4 seconds during a long reply) the transcript is saved to `chats.json`, so chats survive server restarts and `start.bat` being closed. If the server restarts, the saved transcript is re-fed into the model as hidden context so resumed chats keep their memory.
7. If ChatGPT shows a safety/rate-limit screen, the driver auto-clicks the retry button (up to 3 attempts).

---

## Requirements

- **Node.js 18+** (20+ recommended)
- **npm**
- Windows, macOS, or Linux
- Internet access to `chatgpt.com`

Chromium is downloaded automatically during `npm install` (via the `playwright install chromium` postinstall step).

---

## Installation

### 1. Get the code

```bash
git clone https://github.com/gc1dk/Chatgpt-Proxy.git
cd Chatgpt-Proxy
```

### 2. Install dependencies

```bash
npm install
```

This installs Express + Playwright and downloads Chromium.

### 3. Start the proxy

```bash
npm start
```

Then open **http://localhost:3000** in your browser — it also opens automatically on start (set `NO_BROWSER=1` to disable).

On Windows you can also double-click `run.bat` — a setup wizard asks for your settings (port, password, etc.), saves them to `web.env`, and starts the server + browser.

---

## Configuration

All options are environment variables:

| Variable     | Default                | Description                                              |
|--------------|------------------------|----------------------------------------------------------|
| `PORT`       | `3000`                 | Port the web UI and API listen on                        |
| `HOST`       | `0.0.0.0`              | Address to bind to (`0.0.0.0` = whole LAN, `127.0.0.1` = this PC only) |
| `HEADED`     | `0`                    | Set to `1` to show the browser window (useful for solving a captcha once) |
| `PROFILE`    | `./profile`            | Chromium profile directory (persists cookies/session)    |
| `TIMEOUT`    | `300000`               | Max ms to wait for a response before timing out          |
| `STATE_FILE` | `./state.json`         | Where the current conversation URL is remembered         |
| `NO_BROWSER` | `0`                    | Set to `1` to skip auto-opening the browser on start     |
| `CHATS_FILE` | `./chats.json`         | Where saved chat transcripts are stored                  |
| `SETTINGS_FILE` | `./settings.json`   | Where settings (system prompt) are stored                |
| `CLIENTS_FILE` | `./clients.json`    | Per-client tokens (issued by login / register)           |
| `USERS_FILE` | `./users.json`         | User accounts (scrypt-hashed passwords)                  |
| `SELECTORS_FILE` | `./selectors.json` | Cached working page selectors (driver self-healing)      |
| `AUTH_TOKEN`  | *(none)*                | Master token. If set, all `/api/*` calls require auth: a user account (UI login) or `Authorization: Bearer <master>` for programmatic clients. The `?token=` query param is **not** accepted |
| `ALLOW_SIGNUP` | `1`                   | Set to `0` to disable self-registration (accounts must then be created by the admin) |
| `ENCRYPT_KEY` | *(none)*                | If set, `chats.json` and `settings.json` are encrypted at rest (AES-256-GCM) |
| `UPDATE_CHECK` | `1`                  | Set to `0` to disable the GitHub update check           |
| `HTTPS`       | `0`                     | Set to `1` to also serve HTTPS on `PORT + 1` with an auto-generated self-signed certificate (auto-trusted in the Windows user store). Needed for the **mic** (browser speech recognition only works on secure pages) |
| `HTTPS_PORT`  | `PORT + 1`              | Override the HTTPS port when `HTTPS=1`                 |
| `MAX_PROMPT`  | `500000`                | Max characters per message — ChatGPT's guest-mode ceiling is the model context (~128k tokens ≈ 500k chars). The web UI and API reject larger messages with a clear error |
| `TTS_MAX_CHARS` | `20000`               | Max characters that can be spoken in one `/api/tts` call |

**Examples**

```bash
PORT=8080 npm start
HEADED=1 npm start          # solve a Cloudflare captcha once, then it is remembered in ./profile
TIMEOUT=300000 npm start
AUTH_TOKEN="my-secret" npm start   # enable login + master-token auth for LAN/public deployments
HOST=127.0.0.1 npm start    # this PC only - no LAN exposure
ENCRYPT_KEY="long random phrase" npm start  # encrypt chats.json / settings.json at rest
```

**Using a `.env` file**

An annotated template is included as `example.env`. Copy it to `.env`, edit the values, then start with:

```bash
cp example.env .env        # Windows: copy example.env .env
node --env-file=.env server.js
```

The `.env` file is ignored by git, so your personal settings never get published.

**Windows quick start: `run.bat`**

Double-click `run.bat` for a setup wizard: it creates a `web.env` file (port, bind address, login password, signup on/off, headed mode, timeout, encryption key) that you can re-edit any time from the menu, then launches the server with those settings. `web.env` is also git-ignored.

---

## LAN Access

The server binds to `0.0.0.0` automatically (override with `HOST`). Any device on your network can open `http://<your-ip>:3000` — the startup log prints your LAN URLs, the sidebar shows them too, and the browser auto-opens to the LAN address on start.

Without a password, every browser on the LAN shares the server (each browser gets its own chat list via its client id). With a password set, users log in with their own account and each account's chats are private to it.

---

## API

Authentication (only when `AUTH_TOKEN` is set): send `Authorization: Bearer <master-token>` **or** a per-client token: `X-Client-Id: <id>` + `X-Client-Token: <token>` (issued by `/api/login`, `/api/signup`, or `/api/register`). When no token is set, everything is open as before.

All endpoints accept an optional `X-Client-Id` header (a per-browser id, or the account id `u-<username>` when logged in). Chats and history are scoped to that client and cannot be read or modified by other clients.

### `POST /api/chat`

Body: `{ "message": "Hello", "chatId": "optional" }` — without `chatId` a new chat is created and becomes active. If `chatId` belongs to another client, `404` is returned.

Returns an **SSE stream** with these event types:

| Event   | Payload                                   | Meaning                                   |
|---------|-------------------------------------------|-------------------------------------------|
| `queue` | `{ position }`                            | Waiting behind other messages             |
| `reset` | —                                         | The assistant's message restarted         |
| `delta` | `{ text }`                                | New chunk of the streamed reply           |
| `done`  | `{ text }`                                | Reply complete                            |
| `error` | `{ code, retryAfter, text, message }`     | Something went wrong (`rate_limited`, `timeout`, `internal`) |

### `GET /v1/models`

Returns the OpenAI-style model list (`chatgpt-gateway`), so clients that auto-discover models (editors, `litellm`) work out of the box.

### `POST /v1/chat/completions` (OpenAI-compatible)

Drop-in endpoint for local apps, CLIs, and IDEs. There's a built-in **API panel** in the web UI (the arrow icon in the top-right corner): it shows your base URL + auth headers, a live "Send test" that streams a real request, and copy-ready `curl` examples — no need to read this page to get started.

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}],"stream":true}'
```

- `model`: any string — the underlying model is whatever the driven ChatGPT page is using
- `stream: true` → SSE chunks in OpenAI's format (`chat.completion.chunk`, ends with `[DONE]`)
- `stream: false` → a single `chat.completion` JSON response
- `user: "<session-id>"` (or `X-Session-Id` header) → a persistent session whose history stays in the chat transcript
- Without `user`, each request is a one-off chat
- System messages are accepted but not injected into ChatGPT's page; only the last user/assistant message is sent. The real ChatGPT page holds the conversation context
- Auth (same rules as `/api/*`): when `AUTH_TOKEN` is set, send `Authorization: Bearer <master>` **or** `X-Client-Id: u-<username>` + `X-Client-Token: <token>` (your account token from the API panel / login). Without `AUTH_TOKEN` the API is open like the rest of the server.

### `POST /api/new-chat`

Creates a new chat (and its own browser tab) and makes it active. Returns `{ id }`.

### `POST /api/stop`

Stops the currently generating response. With auth on, you can only stop your own request (master token can stop anything).

### `GET /api/history?chatId=...`

Returns `{ messages: [{ role, text }, ...] }` for the given chat — from the saved transcript, so it survives restarts.

### `GET /api/chats`

Returns `{ chats: [{ id, title, updatedAt, messageCount }], activeChatId }` — only chats owned by the requesting client.

### `POST /api/chat-rename`

Body: `{ "chatId": "...", "title": "..." }` — renames the chat (title capped at 60 characters). Chats owned by other clients are rejected with `404`.

### `POST /api/chat-delete`

Body: `{ "chatId": "..." }` — deletes the chat, closes its browser tab, and clears the active chat if it was active. Chats owned by other clients are rejected with `404`.

### `GET /api/export?chatId=...`

Downloads the full chat as a Markdown file (`text/markdown` attachment). Only the owner client can export a chat; anyone else gets `404`.

### `GET /api/settings` / `POST /api/settings`

Gets/sets `{ systemPrompt }`. The system prompt is applied as each chat's first message (hidden from the transcript).

### `POST /api/reset-session`

Clears the ChatGPT cookies (fresh rate-limit session) and reloads all chat tabs. Requires the master token when auth is on.

### `POST /api/signup` / `POST /api/login`

Body: `{ "username": "...", "password": "..." }`. Returns `{ clientId: "u-<username>", clientToken }`. Signup can be disabled with `ALLOW_SIGNUP=0`; logins are throttled per IP.

### `POST /api/register`

Master-token-only: creates a per-client token for a programmatic client. Body: `{ "clientId": "..." }` → `{ clientToken }`.

### `GET /api/update-info` / `POST /api/update` / `POST /api/restart`

`update-info` reports the current version and the latest GitHub release. `update` pulls + reinstalls (master token required when auth is on) and `restart` restarts the server process.

### `GET /api/tts?text=...&voice=...`

Streams the text as MP3 speech (Microsoft Edge neural voices — free, no keys). `text` is capped at `TTS_MAX_CHARS` (20 000) and synthesized in ~1800-character chunks. Default voice `en-US-AriaNeural` (the voice ChatGPT uses). Used by "Speak replies" and the Play button on replies.

### `GET /api/status`

Returns browser status, queue length, captcha/gate state, LAN IPs, and port.

---

## FAQ

<details>
<summary><strong>Does the AI keep context / remember previous messages?</strong></summary>

Yes — per chat, for the entire time the server is running. Each chat owns its own browser tab that is never reloaded between messages, so every chat keeps its own full context, exactly like normal ChatGPT chats.

If the server restarts, the full saved transcript is re-fed into the model as hidden context, so the model continues with the whole history in mind (the memory message itself stays hidden from the transcript). The saved transcript stays complete, and settings like the system prompt are re-applied to new chats.

</details>

<details>
<summary><strong>How do I use web search?</strong></summary>

It's built into ChatGPT itself. Ask ChatGPT to search, or use the web-search toggle in the real chat UI — the proxy passes everything through unchanged. No separate button in this UI by design.

</details>

<details>
<summary><strong>Is this an official OpenAI project?</strong></summary>

No. Independently developed, not affiliated with, endorsed by, or sponsored by OpenAI.

</details>

<details>
<summary><strong>Is it unlimited?</strong></summary>

No guarantees. ChatGPT applies its own usage limits (typically per browser session). When a limit is hit, the proxy auto-retries via the site's own retry button and reports the situation to the UI. Your profile in `./profile` keeps the session cookie, so limits reset when the profile/session is refreshed.

</details>

<details>
<summary><strong>Why does it open a browser?</strong></summary>

The chat is protected by Cloudflare/Turnstile bot checks that only a real browser engine can pass. A plain HTTP client gets `403 Chat verification could not be completed`. Driving a real Chromium is the only reliable way to use the service.

</details>

<details>
<summary><strong>Are my chats saved if I close the server / run.bat?</strong></summary>

Yes. Every transcript is written to `chats.json` after each message and during long replies, so when you start the server again, the sidebar and transcripts are exactly where you left them.

</details>

<details>
<summary><strong>How do I set a system prompt?</strong></summary>

Open **Settings** (cog icon) and type your instructions, then Save. The prompt is sent as each chat's first message — hidden from the transcript but fully part of the model's context. It applies to chats from the moment you save it.

</details>

<details>
<summary><strong>Can I modify the project?</strong></summary>

Yes — MIT licensed. See `LICENSE.txt`.

</details>

---

## Troubleshooting

<details>
<summary><strong>"Captcha blocked" / nothing loads in the UI</strong></summary>

Cloudflare occasionally challenges new browser profiles. Run once with `HEADED=1` so you can solve it in the visible window:

```bash
HEADED=1 npm start
```

The solution is stored in `./profile` and won't be required again (until the profile is deleted or expires).

</details>

<details>
<summary><strong>Rate limited</strong></summary>

ChatGPT caps usage per session. The driver auto-clicks the site's retry button when a safety gate appears. To force a fresh session, stop the server and delete `./profile`, then restart.

</details>

<details>
<summary><strong>Response times out</strong></summary>

Raise `TIMEOUT` (default 300000 ms). Very long replies can exceed it during heavy upstream load.

</details>

<details>
<summary><strong>Composer doesn't appear / page never becomes ready</strong></summary>

The driver now **self-heals**: on every send it re-tests its selectors against the live page, falls back to heuristic patterns (textarea, contenteditable, `button[type=submit]`, …), and caches the first working selector per slot in `selectors.json`. So most ChatGPT markup changes are absorbed automatically. If it still fails, check `selectors.json` and open an issue with the console output.

</details>

<details>
<summary><strong>Everything works, but I want a fresh conversation</strong></summary>

Click **New chat** in the sidebar, or delete `./profile` and restart.

</details>

---

## Voice

- **Mic (speech-to-text):** the composer's mic button uses the browser's built-in speech recognition. Browsers only expose the mic to **secure pages**, so it works on `http://localhost` and on the HTTPS server — enable `HTTPS` in `run.bat` (or set `HTTPS=1`) to use the mic from other devices on your LAN. The first visit shows a certificate warning once; on Windows the server installs its self-signed certificate into your user store automatically, so later visits are clean.
- **Spoken replies (text-to-speech):** toggle "Speak replies" in Settings to have every answer read aloud with a neural voice (Aria by default — ChatGPT's own voice), or press **Play** on any message. Audio streams from the server via `/api/tts` (Microsoft Edge voices, no API keys) and works on both HTTP and HTTPS pages.
- If the mic button is greyed out, you're on a plain-HTTP LAN page — open the https URL shown in the sidebar instead.

## Security

- **Recommended setup for anything beyond your own PC:** run `run.bat` (or set env vars) with a password. That enables login: accounts are created in the UI, passwords are stored scrypt-hashed in `users.json`, and each account gets its own random session token (`clients.json`, stored hashed). Chats are scoped per account, not per browser, so an account's history follows it across devices — and other users can never read or stop its chats.
- When `AUTH_TOKEN` is set: all `/api/*` and `/v1/*` routes require a master Bearer token or a valid client token. `?token=` is **not** accepted. `/api/stop` is scoped to the job owner; `/api/reset-session`, `/api/update`, `/api/restart` and `/api/register` need the master token. Per-client rate limits and a per-client queue-depth cap apply.
- By default the server binds to all interfaces (LAN sharing) — set `HOST=127.0.0.1` for this-PC-only, and **do not** expose it to the public internet without a reverse proxy + HTTPS in front.
- Optional `ENCRYPT_KEY`: `chats.json` and `settings.json` are encrypted at rest (AES-256-GCM). User passwords are always hashed.
- Login attempts are throttled per IP (10/min).
- No secrets, API keys, or credentials are required or stored by this project beyond what you configure.
- Do not commit `profile/`, `state.json`, `.env`, `web.env`, or the runtime data files (`chats.json`, `settings.json`, `users.json`, `clients.json`, `selectors.json`).

### Responsible use

- Use the software responsibly and comply with applicable laws, terms, and policies.
- Do not use this project to attack, overload, disrupt, impersonate, or otherwise abuse third-party services.
- Respect the usage controls of the upstream service (rate limits are surfaced, not bypassed).

---

## Limitations

- BETA software; upstream markup and APIs can change without notice and break the driver until updated.
- Usage is capped by OpenAI's own limits.
- **Cross-restart model memory is best-effort:** after a restart, the model gets the whole saved transcript re-fed as hidden context, so it usually recalls everything — but the model may answer hesitantly about "secret" details (ChatGPT's policy behavior, not a bug).
- No image generation or file uploads — by design; this is a text-only chat. Voice is covered by the mic button + spoken replies (see Voice below).
- No model selection — ChatGPT picks the model for chats.
- Chats share one queue and one browser; heavy concurrent use across a LAN can slow responses.
- Upstream services can change, restrict, or remove access at any time.

---

## Roadmap

- [x] Initial proxy (Playwright-driven ChatGPT)
- [x] Streaming SSE responses
- [x] Full in-session context / memory
- [x] Multiple chats with independent per-chat context
- [x] Auto-saved chat transcripts (`chats.json`)
- [x] System prompt setting
- [x] Settings (theme, session reset, server info)
- [x] ChatGPT-style UI (markdown, code highlight, copy/download, theme toggle)
- [x] LAN sharing + request queue
- [x] Stop generation
- [x] Auto-open browser to LAN URL
- [x] Cross-restart model memory (transcript re-fed as hidden context)
- [x] Code tab (artifacts, previews, versions, auto-sync)
- [x] Chat export (Markdown download)
- [x] Optional auth token for public deployments
- [x] Extended test coverage (mock ChatGPT page, driver/API/UI suites)
- [x] Automatic driver-selector self-healing (cached to `selectors.json`)
- [x] Multi-user accounts (username/password login, per-account chats)
- [x] OpenAI-compatible API (`/v1/chat/completions`, stream + non-stream)
- [x] In-app update check + one-click update/restart
- [x] Boot loading screen (logo light-fill + progress bar)
- [x] Voice input (mic) in the composer
- [x] Mobile drawer layout
- [x] At-rest encryption (`ENCRYPT_KEY`) + per-client rate limits
- [x] MIT License
- [ ] More resilient driver during live ChatGPT A/B tests (heuristics already cover composer/submit)
- [ ] Role-based accounts (admin vs member)
- [ ] Per-account settings profiles

Items may be added, removed, or changed as development continues.

---

## License

This project is licensed under the MIT License.

See `LICENSE.txt` for the complete license text.

In short: you are permitted to use, copy, modify, merge, publish, distribute, sublicense, and sell copies of the software, subject to the conditions of the license.

---

## Disclaimer

This software is provided "AS IS", without warranty of any kind.

The authors and contributors are not responsible for damages, service interruptions, data loss, account restrictions, upstream changes, or other consequences resulting from the use or inability to use this software.

This project is independently developed and is not affiliated with, endorsed by, or sponsored by OpenAI.

---

## Author

**Gc.idk**

- Discord: `@Gc.idk`
- GitHub: [gc1dk](https://github.com/gc1dk)

This project started because I didn't feel like waiting for usage limits to reset.

- If you find something broken, improve it.
- If you find something useful, keep it.
- If you have an idea, open an issue or submit a pull request.

---

## Updates

Recent changes:

- **v7.2** — The API is a built-in feature. **In-app API panel** (arrow icon, top-right corner): shows your base URL + auth headers, a live "Send test" that streams a real `/v1/chat/completions` request, and copy-ready `curl` examples — point any app at this server without reading the docs. **`GET /v1/models`** added for clients that auto-discover models. **Security fix:** the `/v1` OpenAI endpoints were accidentally left open when `AUTH_TOKEN` was set (only `/api` was guarded) — auth is now shared, and `/v1` gets its own rate limiter mounted before the route (the old one was dead code after the route). `/api/status` reports `authRequired`. 54 tests green.

- **v7.1** — Voice that actually works + cancel & limits. **Spoken replies:** server-side TTS endpoint (`/api/tts`) streaming Microsoft Edge neural voices — enable "Speak replies" in Settings and ChatGPT's answers are read aloud (Aria — the same voice ChatGPT uses), or press Play on any reply; no API keys. **Mic fixed:** browsers only allow the mic on secure pages, so voice input silently failed over plain LAN HTTP — the server now has an optional HTTPS mode (`HTTPS=1` / run.bat wizard) with an auto-generated self-signed certificate that is auto-trusted in the Windows user store; the mic enables itself on https/localhost and explains itself otherwise. **Cancelling:** `/api/stop` now cancels your queued job too (with a clean "Stopped." state instead of an error), is properly scoped per user, and no longer kills another user's running generation. **Message cap:** research showed ChatGPT guest mode has no separate per-message cap — the real ceiling is the model context (~128k tokens ≈ 500k characters), so the default `MAX_PROMPT` is now 500k characters (was 5 MB), enforced in the web UI, `/api/chat` and the OpenAI API with clear errors, and configurable via `MAX_PROMPT`. **Update check** now shows live status (checking / up-to-date / failed + "Check again") and the settings panel has a manual "Check for updates". 51 tests green.

- **v7** — Resilience & hardening round. **Driver self-healing:** the driver now re-tests its page selectors on every send, falls back to heuristic patterns, and caches the working ones to `selectors.json` — ChatGPT markup changes no longer need code fixes; every step of the send path (fill → enable → click → verify) uses the healed selectors. **Multi-user accounts:** when `AUTH_TOKEN` is set, the UI shows a login screen — create accounts (scrypt-hashed in `users.json`), log in from any device, and chats follow your account, not your browser. **Security per review:** removed the `?token=` query auth and the `GET /api/chat?prompt=` endpoint, per-client tokens (`/api/register`/`/api/login`), `/api/stop` scoped to the job owner, `/api/reset-session`/`/api/update`/`/api/restart` master-token-only, `HOST` env for this-PC-only binding, per-client rate limits + queue-depth cap, login throttling, optional at-rest AES-256-GCM encryption via `ENCRYPT_KEY`, `clients.json`/`users.json`/`selectors.json` git-ignored. **OpenAI-compatible API:** `POST /v1/chat/completions` (stream + non-stream, session continuity via `user`). **UI:** boot screen with logo light-fill + progress %, update banner with one-click update/restart, voice input (mic), mobile drawer sidebar, removed the flaky in-tab preview iframe (Run/Open now opens the preview in a new tab), fixed "clicking a chat doesn't open it" (active-chat load guard). **`run.bat` wizard** writes an editable `web.env` (port, host, password, signup, headed, timeout, encryption). 47 tests green.

- **v6** — Big messages fixed: the driver now **verifies the composer accepted the text** (read-back check with retries) and **waits for the send button to become enabled** before clicking — if ChatGPT's page rejects a huge story, you get an immediate clear error instead of a 3-minute silent wait that ended in "Timed out waiting for a response"; **huge replies stream live** — buffers over 60 KB throttle rendering and switch to a cheap plain-text append mode past 120 KB so the tab never freezes on the thinking dots; defaults bumped so slow starts work: driver `TIMEOUT` 300 000 ms and the client idle watchdog 5 minutes; 1 MB story covered by a new driver test (34 tests total).

- **v5** — Testing round + fixes: **offline test suite** (`npm test`) — 30+ tests in three suites that run against a mock ChatGPT page with no account or network access: driver suite (composer fill, streaming deltas, history, multi-turn, oversized messages, multi-chat isolation), server suite (every API endpoint incl. SSE end-to-end, persistence, privacy), UI suite (headless browser exercising the real interface). Bugs found & fixed: consecutive identical replies timed out (fresh assistant element detection); tapping "new chat" then immediately sending erased the visible message (chat-id is now emitted as the first SSE event and new-chat no longer steals the view mid-send); lazy `HOME_URL` (was captured at module load, breaking env overrides for tests). New features: **chat export** (download any chat as `.md` from the sidebar), **optional `AUTH_TOKEN`** (API password; the UI prompts once and remembers it), `npm test` script.

- **v4** — No more invisible hangs: server-side **job watchdog** force-fails any request that runs past its deadline (returns a clear timeout error and stops the browser generation), each job now has a hard time budget so the queue can never wedge; hardened SSE writer (a dead connection can no longer crash a job); **client-side idle watchdog** — if the stream goes silent for 2.5 minutes the UI surfaces an error instead of spinning forever; huge messages protected end-to-end (composer fill now uses the React-native value setter + send verification with an Enter-key fallback, plus a friendly error past 5 MB, while the express body limit stays at 20 MB); memory context feeds are capped (20 KB per message / 200 KB total) so mega-chats can't stall the model; replies larger than 400 KB render as plain text instead of freezing the tab on markdown render.

- **v3** — Code tab polish: animated tabs (sliding underline, badge pop-in), icon buttons with hover/press animations, filename chip next to the version picker, pulsing Auto-sync badge, floating artwork in the preview empty state, and a re-render flash on Run.

- **v2** — Chat management & privacy: rename/delete chats, per-browser client isolation (`X-Client-Id`), official logo background, code previews with live iframe + per-block Preview/Download, `start.bat` stale-port cleanup, server auto-open browser (LAN URL), renamed to **ChatGPT Gateway**.

- **v1** — Initial release: Playwright-driven ChatGPT, SSE streaming, full in-session memory, web search via the built-in ChatGPT UI, markdown UI, LAN sharing, queue, persistent profile. Plus: multiple chats with independent per-chat context (each chat keeps its own browser tab and memory); chat sidebar; transcripts auto-saved to `chats.json` (also during long replies, so closing the server/`start.bat` loses nothing); chats restored in the UI after restart; cross-restart model memory — the whole saved transcript is re-fed into the model as hidden context after a restart (also hidden from the transcript); Settings cog with theme, server info, session reset (clear cookies), and a configurable **system prompt** applied per chat (hidden from transcript); per-reply **Download** buttons; clipboard fallback for non-secure (LAN) pages; fixed code-highlighting (highlight.js browser build, no more CDN); streaming cursor now appears only after the thinking dots; model ownership disclaimer in the UI; `start.bat` auto-kills stale port-3000 processes; server auto-opens the browser to the LAN URL; renamed to **ChatGPT Gateway**.
