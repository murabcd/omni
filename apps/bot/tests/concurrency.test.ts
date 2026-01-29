import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../src/lib/concurrency.js";

describe("mapWithConcurrency", () => {
	it("preserves input order", async () => {
		const result = await mapWithConcurrency([3, 1, 2], 2, async (value) => {
			await new Promise((resolve) => setTimeout(resolve, value * 5));
			return value * 2;
		});
		expect(result).toEqual([6, 2, 4]);
	});

	it("respects concurrency limit", async () => {
		let active = 0;
		let peak = 0;
		await mapWithConcurrency([1, 2, 3, 4, 5], 2, async () => {
			active += 1;
			peak = Math.max(peak, active);
			await new Promise((resolve) => setTimeout(resolve, 10));
			active -= 1;
			return null;
		});
		expect(peak).toBeLessThanOrEqual(2);
	});
});
