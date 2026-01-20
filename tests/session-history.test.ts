import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
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
	it("appends and loads messages in order", () => {
		appendHistoryMessage(baseDir, chatId, {
			timestamp: "2026-01-20T00:00:00.000Z",
			role: "user",
			text: "hello",
		});
		appendHistoryMessage(baseDir, chatId, {
			timestamp: "2026-01-20T00:00:01.000Z",
			role: "assistant",
			text: "hi",
		});

		const messages = loadHistoryMessages(baseDir, chatId, 20);
		expect(messages).toHaveLength(2);
		expect(messages[0]?.text).toBe("hello");
		expect(messages[1]?.text).toBe("hi");

		const formatted = formatHistoryForPrompt(messages);
		expect(formatted).toContain("User: hello");
		expect(formatted).toContain("Assistant: hi");
	});
});
