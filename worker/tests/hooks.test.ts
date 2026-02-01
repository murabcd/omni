import { describe, expect, it } from "vitest";

import { dispatchHooks, parseHooksConfig } from "../lib/hooks.js";

describe("hooks", () => {
	it("parses valid hook config", () => {
		const raw = JSON.stringify([
			{
				id: "tool-hook",
				event: "tool.finish",
				action: { type: "spawn_subagent", prompt: "Summarize." },
			},
			{
				id: "admin-hook",
				event: "admin.message",
				action: { type: "enqueue_turn", text: "Ack." },
			},
		]);
		const hooks = parseHooksConfig(raw);
		expect(hooks).toHaveLength(2);
		expect(hooks[0]?.event).toBe("tool.finish");
		expect(hooks[0]?.action?.type).toBe("spawn_subagent");
	});

	it("dispatches only matching hooks", () => {
		const raw = JSON.stringify([
			{
				id: "msg-hook",
				event: "telegram.message",
				filter: { textIncludes: "report" },
				action: {
					type: "enqueue_turn",
					text: "Generate report.",
				},
			},
			{
				id: "tool-hook",
				event: "tool.finish",
				filter: { toolName: "web_search" },
				action: { type: "spawn_subagent", prompt: "Summarize." },
			},
		]);
		const hooks = parseHooksConfig(raw);
		const actions = dispatchHooks(hooks, {
			event: "telegram.message",
			text: "please report",
		});
		expect(actions).toHaveLength(1);
		expect(actions[0]?.type).toBe("enqueue_turn");

		const toolActions = dispatchHooks(hooks, {
			event: "tool.finish",
			toolName: "web_search",
		});
		expect(toolActions).toHaveLength(1);
		expect(toolActions[0]?.type).toBe("spawn_subagent");
	});

	it("ignores disabled hooks", () => {
		const raw = JSON.stringify([
			{
				id: "disabled",
				event: "telegram.message",
				enabled: false,
				action: { type: "enqueue_turn", text: "Nope" },
			},
		]);
		const hooks = parseHooksConfig(raw);
		const actions = dispatchHooks(hooks, {
			event: "telegram.message",
			text: "hi",
		});
		expect(actions).toHaveLength(0);
	});
});
