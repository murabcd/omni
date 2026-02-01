import { describe, expect, it } from "vitest";
import {
	appendHistoryMessage,
	formatHistoryForPrompt,
	loadHistoryMessages,
} from "../src/lib/context/session-history.js";
import type { TextStore } from "../src/lib/storage/text-store.js";

const workspaceId = "workspace-1";
const sessionKey = "telegram:private:chat-1";

function createMemoryStore(): TextStore {
	const data = new Map<string, string>();
	return {
		getText: async (key) => data.get(key) ?? null,
		putText: async (key, text) => {
			data.set(key, text);
		},
		appendText: async (key, text, options) => {
			const separator = options?.separator ?? "\n";
			const current = data.get(key) ?? "";
			const next = current
				? `${current}${current.endsWith("\n") ? "" : separator}${text}`
				: text;
			data.set(key, next);
		},
		list: async (prefix) =>
			Array.from(data.keys()).filter((key) => key.startsWith(prefix)),
		delete: async (key) => {
			data.delete(key);
		},
	};
}

describe("session history", () => {
	it("stores and loads recent history", async () => {
		const store = createMemoryStore();
		await appendHistoryMessage(store, workspaceId, sessionKey, {
			timestamp: "2026-01-20T00:00:00.000Z",
			role: "user",
			text: "hello",
		});
		await appendHistoryMessage(store, workspaceId, sessionKey, {
			timestamp: "2026-01-20T00:00:01.000Z",
			role: "assistant",
			text: "hi",
		});

		const messages = await loadHistoryMessages(
			store,
			workspaceId,
			sessionKey,
			20,
		);
		expect(messages).toHaveLength(2);
		expect(formatHistoryForPrompt(messages)).toContain("User: hello");
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
