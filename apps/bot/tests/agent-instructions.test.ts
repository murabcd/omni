import { describe, expect, it } from "vitest";
import { buildAgentInstructions } from "../src/lib/prompts/agent-instructions.js";

const base = {
	question: "пример",
	modelRef: "gpt-5.2",
	modelName: "GPT-5.2",
	reasoning: "standard",
	toolLines: "yandex_tracker_search - search",
	globalSoul: "Soul text",
	projectContext: [{ path: "config/SOUL.md", content: "Soul file" }],
	currentDateTime: "2026-01-29 10:00 (Europe/Moscow)",
	runtimeLine: "service=omni | model=GPT-5.2",
	skillsPrompt: "<available_skills></available_skills>",
};

describe("agent instructions prompt modes", () => {
	it("renders full prompt with context blocks by default", () => {
		const instructions = buildAgentInstructions(base);
		expect(instructions).toContain("SOUL (global):");
		expect(instructions).toContain("Skills (reference):");
		expect(instructions).toContain("Current Date & Time:");
		expect(instructions).toContain("Runtime:");
		expect(instructions).toContain("# Project Context");
	});

	it("renders minimal prompt without extra context blocks", () => {
		const instructions = buildAgentInstructions({
			...base,
			promptMode: "minimal",
		});
		expect(instructions).toContain("Available tools:");
		expect(instructions).toContain("SOUL (global):");
		expect(instructions).not.toContain("# Project Context");
		expect(instructions).not.toContain("Current Date & Time:");
		expect(instructions).not.toContain("Skills (reference):");
		expect(instructions).not.toContain("Runtime:");
	});

	it("renders none prompt with user only", () => {
		const instructions = buildAgentInstructions({
			...base,
			promptMode: "none",
		});
		expect(instructions).toBe("User: пример");
	});
});
