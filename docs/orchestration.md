---
summary: "Sub-agent orchestration and model overrides"
read_when:
  - Tuning sub-agent performance or costs
  - Overriding sub-agent models/providers
---
# Orchestration (sub-agents)

Omni can spawn sub-agents for specialized work (tracker/jira/posthog/web/memory).
There are two paths:

- **Tool-based subagents** (AI SDK): the main agent calls `subagent_route` to
  pick a target, then invokes a `subagent_*` tool for a concise summary.
- **Hook-based background subagents**: `spawn_subagent` actions run asynchronously
  and announce results back into the chat.

Sub-agents default to the same model as the main agent, but you can override
model and provider.

## Defaults via env

Set global defaults for all sub-agents:

```
SUBAGENT_MODEL_PROVIDER="google"
SUBAGENT_MODEL_ID="gemini-2.5-flash"
```

Providers supported:
- `openai`
- `google` (Gemini)

If `SUBAGENT_MODEL_PROVIDER=google`, ensure `GEMINI_API_KEY` is set.

## Per-agent overrides

Use `AGENT_CONFIG_OVERRIDES` to override specific sub-agents:

```
AGENT_CONFIG_OVERRIDES='{
  "web": { "provider": "google", "modelId": "gemini-2.5-flash" },
  "tracker": { "provider": "openai", "modelId": "gpt-5.2" }
}'
```

Supported keys:
- `provider`: `"openai"` or `"google"`
- `modelId`: provider-specific model id
- `maxSteps`, `timeoutMs`, `instructions`

## Tool-based subagents (AI SDK)

The AI SDK path uses a router tool to decide which subagent to call:

- Call `subagent_route` first (router returns suggested subagents + rationale).
- Then call the recommended `subagent_*` tool with a clear task.
- The tool returns a concise summary, keeping the main context small.

See `docs/subagents.md` for the full behavior and guidance.
