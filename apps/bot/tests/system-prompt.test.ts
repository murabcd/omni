import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/lib/prompts/system-prompt.js";

describe("buildSystemPrompt", () => {
	it("includes memory guidance framing", () => {
		const prompt = buildSystemPrompt({
			modelRef: "test-ref",
			modelName: "test-model",
			reasoning: "standard",
		});
		expect(prompt).toContain("Memory Guidance (what counts as a learning)");
		expect(prompt).toContain("Memory Guidance (do not include)");
		expect(prompt).toContain("Memory Guidance (process)");
	});
});
