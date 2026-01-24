# Clawdbot Parity: Agents, Parallelization, Approvals

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows the requirements in `.agent/PLANS.md` from the repository root. Keep this document aligned with that file at all times.

## Purpose / Big Picture

After this change, Omni will match Clawdbot’s battle‑tested agent practices: parallel subagent execution with timeouts, per‑agent configuration, and an approval workflow for risky tools. Users will see faster multi‑tool responses, consistent safety prompts when a tool is blocked pending approval, and clearer /tools output showing which tools require approval. The behavior is observable by sending a multi‑agent request and seeing a single response that completes faster than sequential execution, and by attempting a risky tool call that triggers an approval prompt.

## Progress

- [x] (2026-01-24 10:30Z) Define a unified “agent execution policy” that includes concurrency limits, per‑agent models/instructions, and approval requirements.
- [x] (2026-01-24 10:31Z) Implement parallel orchestration with timeouts and safe aggregation.
- [x] (2026-01-24 10:32Z) Implement approval workflow for designated tools and expose status via /tools.
- [x] (2026-01-24 10:33Z) Add tests and docs; run full test suite and record results.

## Surprises & Discoveries

- Observation: None yet.
  Evidence: Not applicable.

## Decision Log

- Decision: Implement approval and parallelization inside Omni rather than introducing a separate gateway service.
  Rationale: The Worker/Telegram runtime already centralizes tool execution and is simpler to evolve safely.
  Date/Author: 2026-01-24 / assistant

## Outcomes & Retrospective

Parallel subagents now run with bounded concurrency and per‑agent overrides. Approval gating is available via `/approve`, and `/tools` shows approval‑required tools. Tests and docs are updated, and the full test suite passes. Remaining work is tuning which tools require approval and adjusting parallelism defaults based on production telemetry.

## Context and Orientation

Omni currently has an orchestration layer in `src/lib/agents/orchestrator.ts` that runs subagents sequentially, and a global tool hook in `src/lib/tools/hooks.ts` that logs and blocks tools by policy and rate limits. There is no approval workflow and no per‑agent config overrides. Subagents are defined in `src/lib/agents/subagents/index.ts` and are wired in `src/bot.ts` as part of the message handling flow.

Clawdbot’s “parity” target for this plan means:

1) Parallel subagent execution with explicit limits and timeouts.
2) Per‑agent config (model + instructions override + max steps).
3) Approval workflow for risky tools (explicit user consent).

We will implement these without external services and keep everything observable and testable.

## Plan of Work

First, define a shared agent execution policy. Add new env variables for concurrency limits and per‑agent configuration. For example:

- `ORCHESTRATION_PARALLELISM` (max concurrent subagents)
- `AGENT_DEFAULT_MAX_STEPS`, `AGENT_DEFAULT_TIMEOUT_MS`
- `AGENT_CONFIG_OVERRIDES` (JSON: per agent id for model/instructions/max steps)
  
Parse these in `src/bot.ts` and `src/lib/agents/orchestrator.ts`, and expose a typed configuration object.

Second, implement parallel orchestration. Update `runOrchestration` to execute selected subagents using a bounded concurrency pool (for example, `p-limit` or a small in‑house queue) and apply per‑agent timeouts. Aggregate results in a stable order. If an agent times out, log the error and continue.

Third, add approval workflow for risky tools. Extend the global tool hook wrapper to support `needsApproval` and an approval store. The simplest version is a per‑chat in‑memory allowlist with a short TTL and a `/approve` command. If a tool is marked as “approval required”, the hook should block it and return a deterministic error like `TOOL_APPROVAL_REQUIRED`. The bot should catch that and reply with instructions: “Reply with /approve <tool> to proceed.” If approved, the next call to that tool is allowed.

Fourth, update /tools to display:

- tools that are available
- tools blocked by policy
- tools that require approval
- current parallelism configuration (optional)

Fifth, add tests:

- Parallel orchestration returns all summaries even when one agent fails.
- Approval required blocks tool calls until /approve is issued.
- Per‑agent override chooses the configured model or steps.

Finally, update docs:

- New env vars and approval workflow in `docs/tools/tool-policy.md`.
- Orchestration parallelism in a new `docs/tools/orchestration.md` section or existing orchestration docs.

## Concrete Steps

Run commands from `/Users/murad-pc/Documents/Github/omni`.

1) Add configuration parsing:

    - Update `.env.example` with new variables.
    - Parse in `src/bot.ts` and pass to orchestrator.

2) Parallel orchestration:

    - Update `src/lib/agents/orchestrator.ts` to run subagents concurrently with a max parallel limit and timeouts.
    - Ensure result ordering matches the plan order.

3) Approval workflow:

    - Add a small in‑memory approval store (per chat id).
    - Extend tool hook wrapper to block “approval required” tools.
    - Add `/approve <tool>` command in `src/bot.ts`.

4) /tools output:

    - Display tools that require approval and current policy state.

5) Tests:

    - `tests/agents/orchestration-parallel.test.ts`
    - `tests/tools/approval.test.ts`

6) Docs updates:

    - `docs/tools/tool-policy.md`
    - Optional `docs/tools/orchestration.md`

7) Run validation:

    - `bun test`
    - `bun type-check`

## Validation and Acceptance

Behavioral acceptance:

1) A request that triggers multiple subagents completes faster than sequential execution, and the response includes results from all subagents that succeeded.
2) A tool flagged as “approval required” is blocked with a clear prompt; issuing `/approve <tool>` allows the next call.
3) `/tools` output explicitly lists tools that require approval and tools blocked by policy.
4) `bun test` and `bun type-check` both pass.

## Idempotence and Recovery

All changes are additive. If parallelism causes instability, set `ORCHESTRATION_PARALLELISM=1` to revert to sequential behavior. Approval state is in memory; restarting clears approvals.

## Artifacts and Notes

Expected log example:

    {"event":"orchestration","plan":["tracker","jira"],"parallelism":2,"durationMs":1234}

Expected approval flow:

    User: "Run web search..."
    Bot: "Tool web_search requires approval. Reply /approve web_search"
    User: "/approve web_search"
    User: "Run web search..."
    Bot: [returns web result]

Actual test run (2026-01-24):

    bun test
    31 pass
    0 fail
    Ran 31 tests across 14 files.

## Interfaces and Dependencies

In `src/lib/agents/orchestrator.ts`, add:

    type OrchestrationConfig = {
      parallelism: number;
      defaultMaxSteps: number;
      defaultTimeoutMs: number;
      perAgentOverrides?: Record<string, { modelId?: string; maxSteps?: number; timeoutMs?: number; instructions?: string }>;
    };

In `src/lib/tools/hooks.ts`, add:

    type ApprovalState = {
      allowTool: (chatId: string, toolName: string) => void;
      isApproved: (chatId: string, toolName: string) => boolean;
    };

Plan change note: Created this plan on 2026-01-24 to target Clawdbot parity for parallelism, approvals, and per‑agent configuration.
Plan change note: Marked plan complete and recorded test results after implementation on 2026-01-24.
