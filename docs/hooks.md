---
summary: "Hook registry for auto-triggered turns"
read_when:
  - Adding automation that creates turns without user input
---
# Hooks

Hooks let the gateway enqueue new turns based on events (incoming messages or tool results).

## Config

Set `HOOKS_CONFIG` to a JSON array of hooks:

```json
[
  {
    "id": "auto-followup",
    "event": "telegram.message",
    "filter": { "textIncludes": "report" },
    "action": {
      "type": "enqueue_turn",
      "text": "Gather the data and prepare a report.",
      "kind": "hook"
    }
  },
  {
    "id": "tool-scan",
    "event": "tool.finish",
    "filter": { "toolName": "web_search" },
    "action": {
      "type": "spawn_subagent",
      "prompt": "Write a short summary of the findings.",
      "announcePrefix": "Subtask result:"
    }
  }
]
```

## Events

- `telegram.message` — fires on incoming Telegram messages (text/caption).
- `admin.message` — fires on incoming Admin UI chat messages.
- `tool.finish` — fires after a tool call finishes in the agent loop.

## Actions

- `enqueue_turn` — adds a system turn to the session queue.
- `spawn_subagent` — enqueues a sub‑agent run (non-blocking) and announces the result back.

## Filters

- `chatId` — only for a specific chat id.
- `chatType` — `private`, `group`, `supergroup`, or `channel`.
- `textIncludes` — substring match for incoming text.
- `toolName` — tool name for `tool.finish`.
