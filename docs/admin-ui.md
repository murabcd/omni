---
summary: "Gateway admin UI (Next.js)"
read_when:
  - You want a simple control panel for Omni
---
# Admin UI

The admin UI is a minimal Next.js app under `apps/admin`.

## Setup

1) Install deps in the admin app:

```
cd apps/admin
bun install
```

2) Configure the API base URL (optional):

```
cp .env.example .env.local
```

Set `NEXT_PUBLIC_ADMIN_API_BASE` to your Worker URL (for example, a local
Wrangler dev URL). The admin token is entered in the UI and stored in
`localStorage`.

3) Run dev:

```
bun run dev
```

## Gateway connection

The UI connects to the gateway over WebSocket at `/gateway` and uses RPC-style
methods:

- `connect` (auth + status snapshot)
- `config.get` / `config.set` (edit settings)
- `cron.run` (manual daily report)
- `chat.send` (admin chat, streaming)
- `chat.abort` (cancel in-flight admin chat)

HTTP endpoints (`GET /admin/status`, `POST /admin/cron/run`) remain available for
fallback and debugging, but the UI uses WebSocket by default.

Auth is required via `ADMIN_API_TOKEN` (entered in the UI). The gateway checks
`ADMIN_ALLOWLIST` if it is set.

## Admin chat

The chat panel streams responses from the bot pipeline (same tools, prompts, and
policies as Telegram). It is meant for debugging and does not persist history.

- Streaming: UI uses AI SDK `useChat` with a gateway transport.
- Markdown: assistant messages render via Streamdown.
- Tool visibility: tool calls are surfaced as `Tools: ...` hints during streams.

Stopping a response uses `chat.abort`, which cancels the in-flight stream.
