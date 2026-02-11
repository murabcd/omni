# Telegram

## Group allowlist + mention gating

Set these environment variables:

```
ALLOWED_TG_GROUPS="-1001234567890,-1009876543210"
TELEGRAM_GROUP_REQUIRE_MENTION=1
TELEGRAM_LINK_PREVIEW=1
TELEGRAM_ABORT_ON_NEW_MESSAGE=0
INBOUND_DEDUPE_TTL_MS=1200000
INBOUND_DEDUPE_MAX=5000
```

Behavior:
- If `ALLOWED_TG_GROUPS` is set, only those groups are accepted.
- If `TELEGRAM_GROUP_REQUIRE_MENTION=1`, the bot only responds in groups when:
  - the message mentions the bot (`@botname`), or
  - the user replies to a bot message.

To allow all groups, set `ALLOWED_TG_GROUPS=""`.
To disable mention gating in groups, set `TELEGRAM_GROUP_REQUIRE_MENTION=0`.

Link previews are enabled by default; set `TELEGRAM_LINK_PREVIEW=0` to disable them.

Set `TELEGRAM_ABORT_ON_NEW_MESSAGE=1` to cancel in‑flight runs when a new message arrives
in the same chat (useful for fast iteration).

Inbound dedupe uses a per‑chat cache to skip repeated delivery of the same Telegram
message ID. Tune TTL and size via `INBOUND_DEDUPE_TTL_MS` and `INBOUND_DEDUPE_MAX`.

## Tool availability by chat type

Omni applies a chat-scoped tool policy:

- 1‑1 chats: all tools are available (web + memory included).
- Group chats: `web_search`, `memory_read`, `memory_append`, `memory_write`, `memory_search`, and `session_history` are disabled.

Use `/tools` to see the active tool list for the current chat.

You can further restrict tools by chat type with:

```
TOOL_ALLOWLIST_DM=
TOOL_DENYLIST_DM=
TOOL_ALLOWLIST_GROUP=
TOOL_DENYLIST_GROUP=
TOOL_RATE_LIMITS=web_search:10/60
```

## Background tasks

For long-running requests, Omni can create a background task instead of blocking
the chat. Use:

```
/task <request>
/task status <id>
/task cancel <id>
```

The bot also routes long requests automatically when `TASKS_ENABLED=1`.

## Sub-agent defaults (orchestration)

Sub-agents default to the same model as the main agent unless overridden.
You can set global defaults via env:

```
SUBAGENT_MODEL_PROVIDER="google"
SUBAGENT_MODEL_ID="gemini-2.5-flash"
```

If `SUBAGENT_MODEL_PROVIDER=google`, ensure `GEMINI_API_KEY` is set.

### Tool-based subagents (AI SDK)

In chat, the bot can delegate to subagents via tools:

- Call `subagent_route` first to pick the target subagent(s).
- Then call the recommended `subagent_*` tool(s) to get a concise summary.

This is synchronous (part of the same turn) and keeps the main context small.

### Hook-based background subagents

If you use `spawn_subagent` hooks, they run asynchronously and announce results
back into the chat as a new turn. See `docs/tools/subagents.md`.

## Reply threading

The bot replies to the triggering message in Telegram (uses `reply_to_message_id`)
so conversations stay threaded in groups and channels.

## History and compaction

Omni keeps a short tail of recent messages for context and can generate a summary
of older turns when history grows. Tune via env:

```
HISTORY_MAX_MESSAGES=20
HISTORY_SUMMARY_TRIGGER=60
HISTORY_SUMMARY_TAIL=20
HISTORY_SUMMARY_MAX=200
HISTORY_SUMMARY_MAX_CHARS=12000
AGENT_MAX_MESSAGES=120
AGENT_RECENT_MESSAGES=40
```

- `HISTORY_MAX_MESSAGES` controls how many recent messages are included verbatim.
- `HISTORY_SUMMARY_TRIGGER` starts summarizing once history reaches this size.
- `HISTORY_SUMMARY_TAIL` keeps the last N messages out of the summary.
- `HISTORY_SUMMARY_MAX` caps how many messages are loaded for summary.
- `HISTORY_SUMMARY_MAX_CHARS` limits summary prompt size.
- `AGENT_MAX_MESSAGES` and `AGENT_RECENT_MESSAGES` cap model context after pruning.

## Webhook reliability (optional)

When using the Cloudflare Worker webhook, it acknowledges webhooks immediately
and defers processing to a Durable Object queue with retries and backoff. This
avoids Telegram webhook timeouts while preserving at-least-once delivery. If
you run long‑polling on a droplet, this queue is not used.
