import { describe, expect, it, vi } from "vitest";
import { createTelegramHelpers } from "../src/lib/bot/telegram.js";

describe("createTelegramHelpers sendText retries", () => {
	it("retries transient sendMessage failures", async () => {
		const logDebug = vi.fn();
		const { sendText } = createTelegramHelpers({
			textChunkLimit: 4000,
			logDebug,
		});
		let calls = 0;
		const ctx = {
			reply: vi.fn(async () => {
				calls += 1;
				if (calls < 3) {
					throw new Error("Network request for 'sendMessage' failed!");
				}
				return { ok: true };
			}),
		};

		const setTimeoutSpy = vi
			.spyOn(globalThis, "setTimeout")
			.mockImplementation((handler) => {
				if (typeof handler === "function") handler();
				return 0 as unknown as ReturnType<typeof setTimeout>;
			});

		try {
			await sendText(ctx, "hello");
		} finally {
			setTimeoutSpy.mockRestore();
		}

		expect(ctx.reply).toHaveBeenCalledTimes(3);
		expect(logDebug).toHaveBeenCalledWith(
			"telegram send retry",
			expect.objectContaining({ label: "sendMessage", attempt: 1 }),
		);
		expect(logDebug).toHaveBeenCalledWith(
			"telegram send retry",
			expect.objectContaining({ label: "sendMessage", attempt: 2 }),
		);
	});

	it("falls back to plain text without retrying on HTML parse errors", async () => {
		const logDebug = vi.fn();
		const { sendText } = createTelegramHelpers({
			textChunkLimit: 4000,
			logDebug,
		});
		const ctx = {
			reply: vi.fn(async (_text: string, options?: Record<string, unknown>) => {
				if (options?.parse_mode) {
					throw new Error("can't parse entities");
				}
				return { ok: true };
			}),
		};

		await sendText(ctx, "_oops_");

		expect(ctx.reply).toHaveBeenCalledTimes(2);
		expect(logDebug).toHaveBeenCalledWith(
			"telegram html reply failed, retrying as plain text",
			expect.objectContaining({ error: expect.any(String) }),
		);
	});
});
