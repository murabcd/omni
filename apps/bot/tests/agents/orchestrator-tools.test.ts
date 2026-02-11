import { tool } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createOrchestrationHelpers } from "../../src/lib/agent/orchestration.js";
import type { OrchestrationPlan } from "../../src/lib/agents/orchestrator.js";

const routerModel = new MockLanguageModelV3({
	doGenerate: async () => ({
		content: [
			{
				type: "tool-call",
				toolCallId: "call-1",
				toolName: "route",
				input: JSON.stringify({ prompt: "PROJ-1", isGroupChat: false }),
			},
		],
		finishReason: { unified: "tool-calls", raw: "tool-calls" },
		usage: {
			inputTokens: { total: 1 },
			outputTokens: { total: 1 },
		},
		response: {
			id: "resp-1",
			modelId: "mock-model-id",
			timestamp: new Date(0),
		},
		providerMetadata: {},
	}),
});

const subagentModel = new MockLanguageModelV3({
	doGenerate: async () => ({
		content: [
			{
				type: "text",
				text: "Found Slack integration info.",
			},
		],
		finishReason: { unified: "stop", raw: "stop" },
		usage: {
			inputTokens: { total: 1 },
			outputTokens: { total: 1 },
		},
		response: {
			id: "resp-2",
			modelId: "mock-model-id",
			timestamp: new Date(0),
		},
		providerMetadata: {},
	}),
});

vi.mock("@ai-sdk/openai", () => ({
	openai: () => routerModel,
}));

describe("orchestration tools", () => {
	let routeRequest: typeof import("../../src/lib/agents/orchestrator.js").routeRequest;
	let runOrchestration: typeof import("../../src/lib/agents/orchestrator.js").runOrchestration;

	beforeAll(async () => {
		const orchestrator = await import("../../src/lib/agents/orchestrator.js");
		routeRequest = orchestrator.routeRequest;
		runOrchestration = orchestrator.runOrchestration;
	});

	beforeEach(() => {
		routerModel.doGenerateCalls.length = 0;
		subagentModel.doGenerateCalls.length = 0;
	});

	it("routes with a forced tool call", async () => {
		const plan = await routeRequest("PROJ-1", "mock-router", false);
		expect(routerModel.doGenerateCalls.length).toBe(1);
		expect(plan.agents.length).toBeGreaterThan(0);
		expect(routerModel.doGenerateCalls[0]?.toolChoice).toEqual({
			type: "tool",
			toolName: "route",
		});
	});

	it("subagent_orchestrate returns a non-empty summary", async () => {
		const { buildOrchestrationSummary } = createOrchestrationHelpers({
			allowAgentsRaw: "",
			denyAgentsRaw: "",
			subagentMaxSteps: 2,
			subagentMaxToolCalls: 2,
			subagentTimeoutMs: 10_000,
			parallelism: 2,
			agentConfigOverrides: "",
			agentDefaultMaxSteps: 2,
			agentDefaultTimeoutMs: 10_000,
			logger: { info: () => {} },
			isGroupChat: () => false,
			getActiveModelId: () => "mock-router",
		});

		const toolsByAgent = {
			tracker: {
				echo: tool({
					description: "noop",
					inputSchema: z.object({}),
					execute: async () => "ok",
				}),
			},
			jira: {},
			posthog: {},
			web: {},
			memory: {},
		};

		const plan: OrchestrationPlan = {
			agents: [{ id: "tracker", reason: "test" }],
		};
		const result = await runOrchestration(plan, {
			prompt: "Find when we did Slack integration",
			modelId: "mock-subagent",
			toolsByAgent,
			isGroupChat: false,
			log: () => {},
			getModel: () => subagentModel,
			parallelism: 2,
		});
		const summary = buildOrchestrationSummary(result);
		expect(summary.trim().length).toBeGreaterThan(0);
	});
});
