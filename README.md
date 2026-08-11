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
- **Settings** — theme, system prompt, and a "clear cookies / fresh session" button
- **Model disclaimer** — the UI states clearly that the AI models belong to OpenAI and are not owned or modified by this project
- **Private per browser** — each browser gets its own chat list and history (auto-assigned client id); no one else on your LAN can see your chats
- **Request queue** — messages are processed one at a time; clients wait their turn
- **Stop generation** — cancel the current response
- **Persistent profile** — cookies and session data survive restarts in `./profile`
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

On Windows you can also double-click `start.bat` — it kills any stale process still using port 3000, then starts the server and opens your browser.

---

## Configuration

All options are environment variables:

| Variable     | Default                | Description                                              |
|--------------|------------------------|----------------------------------------------------------|
| `PORT`       | `3000`                 | Port the web UI and API listen on                        |
| `HEADED`     | `0`                    | Set to `1` to show the browser window (useful for solving a captcha once) |
| `PROFILE`    | `./profile`            | Chromium profile directory (persists cookies/session)    |
| `TIMEOUT`    | `180000`               | Max ms to wait for a response before timing out          |
| `STATE_FILE` | `./state.json`         | Where the current conversation URL is remembered         |
| `NO_BROWSER` | `0`                    | Set to `1` to skip auto-opening the browser on start     |
| `CHATS_FILE` | `./chats.json`         | Where saved chat transcripts are stored                  |
| `SETTINGS_FILE` | `./settings.json`   | Where settings (system prompt) are stored                |

**Examples**

```bash
PORT=8080 npm start
HEADED=1 npm start          # solve a Cloudflare captcha once, then it is remembered in ./profile
TIMEOUT=300000 npm start
```

**Using a `.env` file**

An annotated template is included as `example.env`. Copy it to `.env`, edit the values, then start with:

```bash
cp example.env .env        # Windows: copy example.env .env
node --env-file=.env server.js
```

The `.env` file is ignored by git, so your personal settings never get published.

---

## LAN Access

The server binds to `0.0.0.0` automatically. Any device on your network can open `http://<your-ip>:3000` — the startup log prints your LAN URLs, the sidebar shows them too, and the browser auto-opens to the LAN address on start.

Everyone shares the same conversation thread.

---

## API

All endpoints accept an optional `X-Client-Id` header (a per-browser id). When present, chats and history are scoped to that client and cannot be read or modified by other clients. The web UI always sends it.

### `POST /api/chat` or `GET /api/chat?prompt=...`

Body (POST): `{ "message": "Hello", "chatId": "optional" }` — without `chatId` a new chat is created and becomes active. If `chatId` belongs to another client, `404` is returned.

Returns an **SSE stream** with these event types:

| Event   | Payload                                   | Meaning                                   |
|---------|-------------------------------------------|-------------------------------------------|
| `queue` | `{ position }`                            | Waiting behind other messages             |
| `reset` | —                                         | The assistant's message restarted         |
| `delta` | `{ text }`                                | New chunk of the streamed reply           |
| `done`  | `{ text }`                                | Reply complete                            |
| `error` | `{ code, retryAfter, text, message }`     | Something went wrong (`rate_limited`, `timeout`, `internal`) |

### `POST /api/new-chat`

Creates a new chat (and its own browser tab) and makes it active. Returns `{ id }`.

### `POST /api/stop`

Stops the currently generating response.

### `GET /api/history?chatId=...`

Returns `{ messages: [{ role, text }, ...] }` for the given chat — from the saved transcript, so it survives restarts.

### `GET /api/chats`

Returns `{ chats: [{ id, title, updatedAt, messageCount }], activeChatId }` — only chats owned by the requesting client.

### `POST /api/chat-rename`

Body: `{ "chatId": "...", "title": "..." }` — renames the chat (title capped at 60 characters). Chats owned by other clients are rejected with `404`.

### `POST /api/chat-delete`

Body: `{ "chatId": "..." }` — deletes the chat, closes its browser tab, and clears the active chat if it was active. Chats owned by other clients are rejected with `404`.

### `GET /api/settings` / `POST /api/settings`

Gets/sets `{ systemPrompt }`. The system prompt is applied as each chat's first message (hidden from the transcript).

### `POST /api/reset-session`

Clears the ChatGPT cookies (fresh rate-limit session) and reloads all chat tabs.

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
<summary><strong>Are my chats saved if I close the server / start.bat?</strong></summary>

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

Raise `TIMEOUT` (default 180000 ms). Very long replies can exceed it during heavy upstream load.

</details>

<details>
<summary><strong>Composer doesn't appear / page never becomes ready</strong></summary>

ChatGPT sometimes changes its markup. Check the driver selectors in `chatgpt.js` (`[data-mobile-composer]`, `[data-composer-submit]`, `[data-message-role]`). If the site changed, update them and open an issue with the console output.

</details>

<details>
<summary><strong>Everything works, but I want a fresh conversation</strong></summary>

Click **New chat** in the sidebar, or delete `./profile` and restart.

</details>

---

## Security

- The server binds to all interfaces on purpose (LAN sharing) — **do not** expose it to the public internet without adding your own authentication (e.g. a reverse proxy with basic auth).
- Anyone on your LAN can read and send messages in the shared conversation.
- No secrets, API keys, or credentials are required or stored by this project.
- Do not commit `profile/`, `state.json`, `.env`, or the runtime data files (`chats.json`, `settings.json`).
- Use HTTPS if you expose it beyond your LAN.

### Responsible use

- Use the software responsibly and comply with applicable laws, terms, and policies.
- Do not use this project to attack, overload, disrupt, impersonate, or otherwise abuse third-party services.
- Respect the usage controls of the upstream service (rate limits are surfaced, not bypassed).

---

## Limitations

- BETA software; upstream markup and APIs can change without notice and break the driver until updated.
- Usage is capped by OpenAI's own limits.
- **Cross-restart model memory is best-effort:** after a restart, the model gets the whole saved transcript re-fed as hidden context, so it usually recalls everything — but the model may answer hesitantly about "secret" details (ChatGPT's policy behavior, not a bug).
- No image generation, file uploads, or voice — by design; this is a text-only chat.
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
- [x] MIT License
- [ ] Automatic driver-selector self-healing
- [ ] Authentication for public deployments
- [ ] Extended test coverage

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

- **v4** — No more invisible hangs: server-side **job watchdog** force-fails any request that runs past its deadline (returns a clear timeout error and stops the browser generation), each job now has a hard time budget so the queue can never wedge; hardened SSE writer (a dead connection can no longer crash a job); **client-side idle watchdog** — if the stream goes silent for 2.5 minutes the UI surfaces an error instead of spinning forever; huge messages protected end-to-end (composer fill now uses the React-native value setter + send verification with an Enter-key fallback, plus a friendly error past 5 MB, while the express body limit stays at 20 MB); memory context feeds are capped (20 KB per message / 200 KB total) so mega-chats can't stall the model; replies larger than 400 KB render as plain text instead of freezing the tab on markdown render.

- **v3** — Code tab polish: animated tabs (sliding underline, badge pop-in), icon buttons with hover/press animations, filename chip next to the version picker, pulsing Auto-sync badge, floating artwork in the preview empty state, and a re-render flash on Run.

- **v2** — Chat management & privacy: rename/delete chats, per-browser client isolation (`X-Client-Id`), official logo background, code previews with live iframe + per-block Preview/Download, `start.bat` stale-port cleanup, server auto-open browser (LAN URL), renamed to **ChatGPT Gateway**.

- **v1** — Initial release: Playwright-driven ChatGPT, SSE streaming, full in-session memory, web search via the built-in ChatGPT UI, markdown UI, LAN sharing, queue, persistent profile. Plus: multiple chats with independent per-chat context (each chat keeps its own browser tab and memory); chat sidebar; transcripts auto-saved to `chats.json` (also during long replies, so closing the server/`start.bat` loses nothing); chats restored in the UI after restart; cross-restart model memory — the whole saved transcript is re-fed into the model as hidden context after a restart (also hidden from the transcript); Settings cog with theme, server info, session reset (clear cookies), and a configurable **system prompt** applied per chat (hidden from transcript); per-reply **Download** buttons; clipboard fallback for non-secure (LAN) pages; fixed code-highlighting (highlight.js browser build, no more CDN); streaming cursor now appears only after the thinking dots; model ownership disclaimer in the UI; `start.bat` auto-kills stale port-3000 processes; server auto-opens the browser to the LAN URL; renamed to **ChatGPT Gateway**.
