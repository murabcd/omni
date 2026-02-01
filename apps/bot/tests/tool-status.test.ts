import { describe, expect, it, vi } from "vitest";
import { createToolStatusHandler } from "../src/lib/tool-status.js";

describe("createToolStatusHandler", () => {
	it("delays status until threshold and cancels when cleared", () => {
		vi.useFakeTimers();
		const sendReply = vi.fn();
		const { onToolStep, clearAllStatuses } = createToolStatusHandler(
			sendReply,
			{
				delayMs: 1500,
			},
		);

		onToolStep(["web_search"]);
		vi.advanceTimersByTime(1400);
		expect(sendReply).not.toHaveBeenCalled();

		clearAllStatuses();
		vi.advanceTimersByTime(2000);
		expect(sendReply).not.toHaveBeenCalled();

		vi.useRealTimers();
	});

	it("sends status after delay", () => {
		vi.useFakeTimers();
		const sendReply = vi.fn();
		const { onToolStep } = createToolStatusHandler(sendReply, {
			delayMs: 1500,
			trackerMessage: "Проверяю в Yandex Tracker…",
		});

		onToolStep(["yandex_tracker_search"]);
		vi.advanceTimersByTime(1500);
		expect(sendReply).toHaveBeenCalledWith("Проверяю в Yandex Tracker…");

		vi.useRealTimers();
	});

	it("sends firecrawl status after delay", () => {
		vi.useFakeTimers();
		const sendReply = vi.fn();
		const { onToolStep } = createToolStatusHandler(sendReply, {
			delayMs: 1500,
			firecrawlMessage: "Собираю данные с сайтов…",
		});

		onToolStep(["firecrawl_search"]);
		vi.advanceTimersByTime(1500);
		expect(sendReply).toHaveBeenCalledWith("Собираю данные с сайтов…");

		vi.useRealTimers();
	});

	it("does not send without configured message", () => {
		vi.useFakeTimers();
		const sendReply = vi.fn();
		const { onToolStep } = createToolStatusHandler(sendReply, {
			delayMs: 1500,
		});

		onToolStep(["yandex_tracker_search", "firecrawl_search"]);
		vi.advanceTimersByTime(1500);
		expect(sendReply).not.toHaveBeenCalled();

		vi.useRealTimers();
	});
});
