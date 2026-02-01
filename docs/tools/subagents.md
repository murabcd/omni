---
summary: "Sub-agents: isolated background runs that announce results back to the chat"
read_when:
  - You want background/parallel work that should not block the main turn
  - You are configuring hooks that spawn sub-agents
---
# Sub-agents

Sub-agents are background agent runs spawned from the gateway. Each run is enqueued
and processed asynchronously, so it does not block the main turn. The run uses its
own session key and workspace scope, then posts an **announce** message back into the
original chat as a new turn.

## How to spawn

The public way to trigger sub-agents is via hooks. Configure `HOOKS_CONFIG` with a
`spawn_subagent` action:

```json
[
  {
    "id": "tool-scan",
    "event": "tool.finish",
    "filter": { "toolName": "web_search" },
    "action": {
      "type": "spawn_subagent",
      "prompt": "Summarize the tool results and list next steps.",
      "announcePrefix": "Subtask result:"
    }
  }
]
```

See `docs/hooks.md` for full hook syntax and filters.

## Announce behavior

- The sub-agent runs in a separate session and does not block the main turn.
- After completion, the gateway enqueues an announce turn in the original chat.
- If the sub-agent produces no reply text, a short fallback message is used.
- `announcePrefix` lets you customize the visible prefix on the announce message.

## Isolation and scope

- Sub-agents run under a distinct session key derived from the chat id.
- They are marked as system events so access checks are skipped for the internal run.
- The announce message is posted into the main chat session as a normal turn.

## Limitations

- There is no `/subagents` command yet (no list/stop/log UI).
- Announce is best-effort; if the worker restarts mid-run, the announce may be lost.
- Avoid recursive hooks that continuously spawn sub-agents.
