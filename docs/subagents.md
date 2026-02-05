---
summary: "Tool-based subagents (AI SDK) and routing"
read_when:
  - Adding or tuning subagent routing
  - Understanding tool-based subagent behavior
---
# Subagents (AI SDK)

Omni uses **tool-based subagents** to offload context-heavy tasks while keeping
the main agent focused. The main agent routes work via a router tool and then
invokes the selected subagent tool.

## How it works

1. Call `subagent_route` with the user request.
2. The router returns recommended subagent(s) + rationale.
3. Call the suggested `subagent_*` tool(s) with a clear task.
4. Each subagent returns a **concise summary** that is added to the main turn.

This is **synchronous** and happens within the same turn (unlike background hooks).

## When to route

Use subagents for:
- Deep research or broad web searches
- Codebase exploration
- Large, multi‑step analysis

Avoid subagents for:
- Small, direct questions
- Low‑latency chats where a single response is enough

## Model and limits

Subagents default to the main model but can be overridden via:

```
SUBAGENT_MODEL_PROVIDER="google"
SUBAGENT_MODEL_ID="gemini-2.5-flash"
```

Per‑agent overrides are supported via `AGENT_CONFIG_OVERRIDES`.

## Background subagents (hooks)

If you need **asynchronous** work that announces later, use hook‑based
`spawn_subagent` actions. See `docs/tools/subagents.md`.
