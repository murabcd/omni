---
summary: "Telegram bot configuration and long‑polling/webhook behavior for Omni"
read_when:
  - Working on Telegram commands or webhook delivery
---
# Telegram

Omni uses grammY with a Telegram Bot API token. In production it typically runs
as long‑polling on a droplet; Cloudflare Workers webhook is optional.

## Required env vars

- `BOT_TOKEN` — Telegram bot token from @BotFather
- `ALLOWED_TG_IDS` — comma‑separated allowlist of numeric Telegram user IDs

Optional:
- `TELEGRAM_TIMEOUT_SECONDS` (default: 60)
- `TELEGRAM_TEXT_CHUNK_LIMIT` (default: 4000)
- `TELEGRAM_LINK_PREVIEW` (default: 1) — set `0` to disable link previews
- `TELEGRAM_ABORT_ON_NEW_MESSAGE` (default: 0) — set `1` to cancel in-flight runs on new messages
- `TELEGRAM_REACTION_NOTIFICATIONS` (default: `off`) — `off` | `own` | `all`
- `TELEGRAM_REACTION_LEVEL` (default: `off`) — `off` | `minimal` | `extensive`
- `INBOUND_DEDUPE_TTL_MS` (default: 1200000) — TTL for inbound message dedupe
- `INBOUND_DEDUPE_MAX` (default: 5000) — max dedupe entries per chat
- `DEBUG_LOGS` (set `1` to enable)

## Webhook (Cloudflare Workers, optional)

Webhook path is fixed to `/telegram`:

```
https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=https://<worker>.workers.dev/telegram
```

To verify:

```
https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo
```

## Long‑polling (droplet / local dev)

```
bun dev
```

This starts long‑polling and ignores the webhook. Disable the webhook before
running long‑polling in production:

```
https://api.telegram.org/bot<YOUR_TOKEN>/deleteWebhook
```

## Formatting

Outbound messages are sent as Telegram HTML. The bot converts `**bold**`
to `<b>bold</b>` and escapes other HTML for safety.

Transient send errors are retried with backoff. If Telegram rejects the HTML
formatting, the bot falls back to plain text.

## Attachments

- Images are supported from `message:photo`.
- PDF and DOCX documents are supported from `message:document`.
- Non-PDF/DOCX documents are ignored (reply: "Only PDF or DOCX documents are supported.").
- Direct chat uploads are read automatically.
- Tracker issue attachments (PDF/DOCX) and Google Docs/Sheets links are offered after the first answer and read only with explicit consent.

Limits:
- `IMAGE_MAX_BYTES` (default: 5MB)
- `DOCUMENT_MAX_BYTES` (default: 10MB)
- `ATTACHMENT_MAX_BYTES` (default: 8MB, max size to read Tracker attachments)

## Research mode

Use `/research` to collect inputs (links, criteria, files). When the user says
`готово`, Omni runs a research workflow and may return a CSV file.
