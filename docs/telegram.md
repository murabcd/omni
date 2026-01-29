# Telegram

## Group allowlist + mention gating

Set these environment variables:

```
ALLOWED_TG_GROUPS="-1001234567890,-1009876543210"
TELEGRAM_GROUP_REQUIRE_MENTION=1
```

Behavior:
- If `ALLOWED_TG_GROUPS` is set, only those groups are accepted.
- If `TELEGRAM_GROUP_REQUIRE_MENTION=1`, the bot only responds in groups when:
  - the message mentions the bot (`@botname`), or
  - the user replies to a bot message.

To allow all groups, set `ALLOWED_TG_GROUPS=""`.
To disable mention gating in groups, set `TELEGRAM_GROUP_REQUIRE_MENTION=0`.

## Tool availability by chat type

Omni applies a chat-scoped tool policy:

- 1‑1 chats: all tools are available (web + Supermemory included).
- Group chats: `web_search`, `searchMemories`, and `addMemory` are disabled.

Use `/tools` to see the active tool list for the current chat.

You can further restrict tools by chat type with:

```
TOOL_ALLOWLIST_DM=
TOOL_DENYLIST_DM=
TOOL_ALLOWLIST_GROUP=
TOOL_DENYLIST_GROUP=
TOOL_RATE_LIMITS=web_search:10/60
```

## Sub-agent defaults (orchestration)

Sub-agents default to the same model as the main agent unless overridden.
You can set global defaults via env:

```
SUBAGENT_MODEL_PROVIDER="google"
SUBAGENT_MODEL_ID="gemini-2.5-flash"
```

If `SUBAGENT_MODEL_PROVIDER=google`, ensure `GEMINI_API_KEY` is set.

## Reply threading

The bot replies to the triggering message in Telegram (uses `reply_to_message_id`)
so conversations stay threaded in groups and channels.

## Webhook reliability

The Cloudflare Worker acknowledges webhooks immediately and defers processing
to a Durable Object queue with retries and backoff. This avoids Telegram webhook
timeouts while preserving at-least-once delivery.
