# Using the ChatGPT Gateway in your IDE, CLI, and apps

The gateway speaks **OpenAI's API format** (`/v1/chat/completions`, `/v1/models`), so almost anything that accepts a "custom OpenAI-compatible endpoint" can be pointed at it — for free, with no API keys. Your IDE talks to the same free ChatGPT session your browser does.

**Before you start:** the gateway must be running (`npm start` or `run.bat`). Every tool below just needs two things:

| Thing | Value |
|---|---|
| Base URL | `http://localhost:3000/v1` (or `http://<your-LAN-ip>:3000/v1` on another device) |
| API key | `any` non-empty string, **or** your `AUTH_TOKEN`, **or** a per-client token (see below) |

Most tools append `/chat/completions` themselves — the base URL ends in `/v1`, not `/v1/chat/completions`.

---

## 1. Auth (only matters if you set `AUTH_TOKEN`)

- **No auth configured:** any API key works — the field just has to be non-empty.
- **`AUTH_TOKEN` set:** use `Authorization: Bearer <AUTH_TOKEN>`, or register a per-client token (master-token only) so each tool has its own identity:

```bash
curl -X POST http://localhost:3000/api/register \
  -H "Authorization: Bearer YOUR_MASTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clientId": "my-ide"}'
# → { "ok": true, "clientId": "my-ide", "clientToken": "…" }
```

Then send `Authorization: Bearer <clientToken>` (optionally with `X-Client-Id: my-ide`). Per-client rate limits: **60 requests/min on `/v1`**, 30/min on `/api/chat`.

## 2. Sanity check (5 seconds, no installs)

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"any-name","messages":[{"role":"user","content":"Say hi in 5 words"}],"stream":false}'
```

Streaming works the same way with `"stream":true` (SSE, OpenAI chunk format, ends with `[DONE]`). Model names are cosmetic — whatever string you pass, the reply comes from whatever model the driven ChatGPT page is using. `GET /v1/models` returns `chatgpt-gateway` for auto-discovering clients.

## 3. Sessions — give each tool its own memory

By default every request is a one-off chat. Add `"user": "some-name"` to the body (or send an `X-Session-Id` header) to get a **persistent session**: the gateway keeps the full history, and sessions are scoped to the client that created them (a different token gets `403`).

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"x","user":"my-ide","messages":[{"role":"user","content":"Remember: my project is called Fluxor"}]}'
```

Give each tool a different `user` name so their histories don't bleed into each other. Sessions never overflow — long chats are auto-compacted into rolling summaries (unlimited context).

## 4. CLI tools

**aichat** (`config.yaml`):

```yaml
model_providers:
  - type: openai
    name: gateway
    api_base: http://localhost:3000/v1
    api_key: "any"
    models:
      - name: chatgpt
```
```bash
aichat -m gateway/chatgpt "explain the gateway architecture"
```

**llm** (Simon Willison's CLI):

```bash
llm -m gpt-4o -o base_url http://localhost:3000/v1 -o api_key any "hello"
```

**aider**:

```bash
aider --openai-api-base http://localhost:3000/v1 --openai-api-key any --model gpt-4o
```

**LiteLLM** (aggregate several backends behind one endpoint):

```yaml
model_list:
  - model_name: chatgpt
    litellm_params:
      model: openai/chatgpt
      api_base: http://localhost:3000/v1
      api_key: any
```

**opencode** (this project's `opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "chatgpt-gateway": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "ChatGPT Gateway",
      "options": {
        "baseURL": "http://localhost:3000/v1",
        "apiKey": "any"
      },
      "models": {
        "chatgpt": { "name": "ChatGPT (free)" }
      }
    }
  }
}
```

**Universal env-var trick:** many CLIs and plugins read `OPENAI_BASE_URL` / `OPENAI_API_KEY`:

```bash
set OPENAI_BASE_URL=http://localhost:3000/v1
set OPENAI_API_KEY=any
```

## 5. IDE plugins

**VS Code — Continue** (`~/.continue/config.json`):

```json
{
  "models": [
    {
      "title": "ChatGPT Gateway",
      "provider": "openai",
      "model": "chatgpt",
      "apiBase": "http://localhost:3000/v1",
      "apiKey": "any"
    }
  ]
}
```

**Cline / Roo Code:** Settings → API Provider → **OpenAI Compatible** → Base URL `http://localhost:3000/v1`, API Key `any` (or your token), Model ID `chatgpt`.

**JetBrains:** install the Continue plugin → same config as VS Code.

**Zed** (`settings.json`):

```json
{
  "assistant": {
    "version": "2",
    "provider": {
      "chatgpt-gateway": {
        "type": "openai_compatible",
        "base_url": "http://localhost:3000/v1",
        "api_key": "any",
        "model": "chatgpt",
        "display_name": "ChatGPT Gateway"
      }
    }
  }
}
```

**Neovim:** any OpenAI-compatible plugin works (llm.nvim, codecompanion, avante…). Set `OPENAI_BASE_URL` / `OPENAI_API_KEY` or the plugin's custom base-url option to `http://localhost:3000/v1`.

**Obsidian — Copilot plugin:** OpenAI settings → enable custom endpoint → URL `http://localhost:3000/v1`, API key `any`.

**Doesn't work:** Cursor and Claude Code lock their providers (OpenAI/Anthropic only) and can't be retargeted — use Continue / Cline inside VS Code, or the opencode config above, instead.

## 6. Gotchas

- **Base URL ends in `/v1`.** Appending `/chat/completions` yourself double-suffixes it.
- **Same ChatGPT session, one queue.** Everything shares the single driven browser page and processes one message at a time. Great for one user, not a multi-user IDE farm.
- **ChatGPT's own limits still apply** — it's the same free session as the web UI. When it's rate-limited you get `429 rate_limited`; reset the session in the web UI's Settings or delete `./profile`.
- **Messages cap at 500 000 characters** (`MAX_PROMPT`), and the body limit is 20 MB — don't paste your whole repo into one message.
- **403 "session belongs to another client"** — you switched tokens mid-session; keep one token per session id.
- **429 "rate limit exceeded"** from the gateway itself is the per-client limiter (60/min on `/v1`) — slow down, or register a separate client for heavy tools.
- **Non-streaming is fully supported** — tools that don't stream work fine.
- **Another machine on your LAN:** use `http://<ip>:3000/v1` (needs the default `HOST=0.0.0.0`). It's plain HTTP, so keep it LAN-only or put HTTPS in front.