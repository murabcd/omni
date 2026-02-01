import { type ChatState, createEmptyChatState } from "./chat-state-types.js";

export type ChatStateStore = {
	get: (chatId: string) => Promise<ChatState>;
	set: (chatId: string, state: ChatState) => Promise<void>;
	clear: (chatId: string) => Promise<void>;
};

export function createInMemoryChatStateStore(): ChatStateStore {
	const chatStates = new Map<string, ChatState>();
	return {
		get: async (chatId) => {
			const existing = chatStates.get(chatId);
			if (existing) return existing;
			const fresh = createEmptyChatState();
			chatStates.set(chatId, fresh);
			return fresh;
		},
		set: async (chatId, state) => {
			chatStates.set(chatId, state);
		},
		clear: async (chatId) => {
			chatStates.delete(chatId);
		},
	};
}

export { type ChatState, createEmptyChatState } from "./chat-state-types.js";
