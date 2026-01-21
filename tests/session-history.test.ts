import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
	appendHistoryMessage,
	formatHistoryForPrompt,
	loadHistoryMessages,
} from "../src/lib/context/session-history.js";

const baseDir = "data/test-sessions";
const chatId = "chat-1";

function cleanup() {
	const dir = path.join(process.cwd(), baseDir);
	if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

beforeEach(() => {
	cleanup();
});

describe("session history", () => {
	it("returns empty history without supermemory config", async () => {
		await appendHistoryMessage(baseDir, chatId, {
			timestamp: "2026-01-20T00:00:00.000Z",
			role: "user",
			text: "hello",
		});
		await appendHistoryMessage(baseDir, chatId, {
			timestamp: "2026-01-20T00:00:01.000Z",
			role: "assistant",
			text: "hi",
		});

		const messages = await loadHistoryMessages(baseDir, chatId, 20, "hello");
		expect(messages).toHaveLength(0);
		expect(formatHistoryForPrompt(messages)).toBe("");
	});

	it("formats history messages for prompt", () => {
		const formatted = formatHistoryForPrompt([
			{
				timestamp: "2026-01-20T00:00:00.000Z",
				role: "user",
				text: "hello",
			},
			{
				timestamp: "2026-01-20T00:00:01.000Z",
				role: "assistant",
				text: "hi",
			},
		]);
		expect(formatted).toContain("User: hello");
		expect(formatted).toContain("Assistant: hi");
	});
});
