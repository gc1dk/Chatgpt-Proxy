# ChatGPT Gateway Discord Bot

Free Discord bot powered by the self-hosted **ChatGPT Gateway** (no OpenAI API keys — it drives your free ChatGPT session through the gateway). Fully editable: everything is in one file (`bot.js`) plus `config.json`.

## Features

- **Text chat** — `/chat` keeps a per-user conversation on the gateway (unlimited context via auto-compaction), `/ask` is a one-shot question.
- **Voice chat** — `/voice join`: talk in the voice channel, the bot answers **out loud**. Speech-to-text runs locally with Vosk (free, offline), replies are spoken with Edge TTS (free, natural voices). Also transcribes what you said into text chat.
- **Auto-moderation** — `/auto-mod on` makes ChatGPT monitor your channels, judge messages against a policy, and warn / delete / timeout offenders. Fully customizable per server.
- **Custom system prompt & personas** — `/setprompt <text>`, `/persona <name>` (edit `personas.json` freely).
- **Verification** — `/verify` sends a one-time code; `requireVerification` + `verifiedRoleName` gates the bot behind a role. `allowedRoles` can restrict the bot to specific roles.
- **More commands** — `/reset`, `/history`, `/summarize`, `/models`, `/ping`, `/about`, `/help`. Every slash command also works as a prefix command (`!chat`, `!voice join`, `!auto-mod on`, ...).
- **Renameable** — change `botName` in `config.json` and the bot's username updates.

## Setup

1. Create a bot at <https://discord.com/developers/applications> → New Application → Bot → **Reset Token** and copy it.
2. Enable the **Message Content Intent** (Bot → Privileged Gateway Intents → Message Content) — required for prefix commands and auto-mod.
3. Invite the bot with these permissions (OAuth2 → URL Generator → Scopes: `bot`, `applications.commands`; permissions: **Send Messages, Manage Messages, Moderate Members, Connect, Speak, Use Voice Activity**).
4. Copy `config.example.json` → `config.json` and fill in:
   - `token` — your bot token
   - `clientId` — your application's ID
   - `gatewayUrl` — where your gateway runs, e.g. `http://localhost:3000/v1`
   - `masterToken` — set it if your gateway uses `AUTH_TOKEN` (the bot sends `Authorization: Bearer <masterToken>`)
5. Install and run:

```
npm install
npm start
```

The first time someone uses voice, the bot downloads a ~40 MB Vosk speech model automatically (`models/vosk`).

## Voice

- `/voice join` — bot joins your channel and starts listening. Speak; it hears you (Vosk), sends it to ChatGPT through the gateway, and speaks the reply (Edge TTS).
- `/voice leave` — bot leaves. `/voice status` — current state.
- Config: `voice.enabled`, `voice.ttsVoice` (any Edge voice, e.g. `en-US-GuyNeural`, `en-GB-SoniaNeural`), `voice.speakReplies` (also speak text `/chat` replies while you're in VC), `voice.channelId` (always join a fixed channel).
- Needs `ffmpeg` — the bot uses `ffmpeg-static` (auto-downloaded). If your npm blocks install scripts, run `npm install-scripts approve ffmpeg-static @discordjs/opus ffi-napi ref-napi` first (already configured in `package.json` → `allowScripts`).
- If the native `@discordjs/opus` can't build on your machine, the bot automatically falls back to `opusscript` (pure JS).

## Auto-mod

- `/auto-mod on` — enables ChatGPT moderation for all text channels (or `/auto-mod on channel:#general` to scope it).
- `/auto-mod policy <text>` — your own rules, e.g. "No racism, no NSFW, no spam. Be fair."
- `/auto-mod action <warn|delete|timeout>` — default action; severe violations are handled more harshly automatically.
- `/auto-mod status` — current settings + stats (checks run, actions taken).
- Offenders get a DM with the reason; a `reportChannel` (id or name) logs every action as an embed.
- Messages from members with **Manage Messages** or in `ignoreRoles` are skipped. Checks are rate-limited (1 per 1.5 s per server) so ChatGPT is never flooded.

## Verification

- With `requireVerification: true`, users must hold the `verifiedRoleName` role to use the bot.
- `/verify` sends a one-time DM code; `/verify <code>` grants the role. Codes expire after 10 minutes and are rate-limited.
- `allowedRoles: ["Moderators"]` further restricts bot usage to those roles (id or name).

## Data

Everything the bot persists lives in `data.json` (sessions, custom prompts, personas, auto-mod settings). Delete it to reset all bot state — the gateway's own `chats.json` keeps the conversation history.

## Troubleshooting

- **Bot doesn't answer** — check the gateway is running (`http://localhost:3000/api/status`) and `gatewayUrl`/`masterToken` are correct in `config.json`.
- **Slash commands don't appear** — kick/reinvite the bot, or set `guildId` in config and restart.
- **Voice: "speech model" downloads forever** — delete `models/vosk` and restart, or download the zip manually into `models/vosk`.
- **Voice: no audio** — make sure the bot has **Connect/Speak** and you're not in a server-muted state; `npm install opusscript` if opus fails.