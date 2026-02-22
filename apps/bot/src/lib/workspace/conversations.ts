import type { TextStore } from "../storage/text-store.js";
import { workspaceFileKey } from "./paths.js";

export type MemoryConversationEntry = {
	timestamp: string;
	role: "user" | "assistant";
	text: string;
};

export async function appendMemoryConversation(
	store: TextStore,
	workspaceId: string,
	message: MemoryConversationEntry,
): Promise<void> {
	const key = workspaceFileKey(workspaceId, "memory/conversations.jsonl");
	await store.appendText(key, JSON.stringify(message), { separator: "\n" });
}
