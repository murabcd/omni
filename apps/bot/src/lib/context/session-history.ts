import type { TextStore } from "../storage/text-store.js";
import { sessionHistoryKey } from "../workspace/paths.js";

export type HistoryMessage = {
	timestamp: string;
	role: "user" | "assistant";
	text: string;
};

function serialize(message: HistoryMessage) {
	return JSON.stringify(message);
}

function parse(line: string): HistoryMessage | null {
	try {
		const parsed = JSON.parse(line) as HistoryMessage;
		if (parsed?.role && parsed?.text && parsed?.timestamp) return parsed;
	} catch {
		// ignore malformed entries
	}
	return null;
}

export async function appendHistoryMessage(
	store: TextStore,
	workspaceId: string,
	sessionKey: string,
	message: HistoryMessage,
): Promise<void> {
	const key = sessionHistoryKey(workspaceId, sessionKey);
	await store.appendText(key, serialize(message), { separator: "\n" });
}

export async function loadHistoryMessages(
	store: TextStore,
	workspaceId: string,
	sessionKey: string,
	limit: number,
): Promise<HistoryMessage[]> {
	const key = sessionHistoryKey(workspaceId, sessionKey);
	const raw = await store.getText(key);
	if (!raw) return [];
	const lines = raw.trim().split("\n").filter(Boolean);
	const parsed = lines
		.map((line) => parse(line))
		.filter((entry): entry is HistoryMessage => entry !== null);
	if (!Number.isFinite(limit) || limit <= 0) return parsed;
	return parsed.slice(-limit);
}

export async function clearHistoryMessages(
	store: TextStore,
	workspaceId: string,
	sessionKey: string,
): Promise<void> {
	const key = sessionHistoryKey(workspaceId, sessionKey);
	await store.delete(key);
}

export function formatHistoryForPrompt(messages: HistoryMessage[]): string {
	if (!messages.length) return "";
	const lines = messages.map((msg) => {
		const role = msg.role === "user" ? "User" : "Assistant";
		return `${role}: ${msg.text}`;
	});
	return ["Recent conversation:", ...lines, ""].join("\n");
}
