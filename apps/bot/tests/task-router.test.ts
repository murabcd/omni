import { describe, expect, it } from "vitest";
import {
	decideTaskMode,
	extractTaskOverride,
} from "../src/lib/tasks/router.js";

describe("task router", () => {
	it("extracts background override", () => {
		const result = extractTaskOverride("/task scan site");
		expect(result).toEqual({ mode: "background", text: "scan site" });
	});

	it("extracts inline override", () => {
		const result = extractTaskOverride("now: quick check");
		expect(result).toEqual({ mode: "inline", text: "quick check" });
	});

	it("routes to background for many urls", () => {
		const decision = decideTaskMode({
			text: "https://a.com https://b.com https://c.com",
			enabled: true,
			urlThreshold: 3,
			minChars: 800,
		});
		expect(decision.mode).toBe("background");
	});

	it("routes inline for short text", () => {
		const decision = decideTaskMode({
			text: "hello",
			enabled: true,
			urlThreshold: 3,
			minChars: 800,
		});
		expect(decision.mode).toBe("inline");
	});
});
