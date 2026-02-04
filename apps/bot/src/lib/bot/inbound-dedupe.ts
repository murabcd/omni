type InboundDedupeEntry = {
	messageIds: Map<number, number>;
};

type InboundDedupeOptions = {
	ttlMs?: number;
	maxPerChat?: number;
};

const DEFAULT_TTL_MS = 20 * 60_000;
const DEFAULT_MAX_PER_CHAT = 5000;

export function createInboundDedupe(options: InboundDedupeOptions = {}) {
	const ttlMs =
		typeof options.ttlMs === "number" && Number.isFinite(options.ttlMs)
			? Math.max(1000, options.ttlMs)
			: DEFAULT_TTL_MS;
	const maxPerChat =
		typeof options.maxPerChat === "number" &&
		Number.isFinite(options.maxPerChat)
			? Math.max(100, Math.floor(options.maxPerChat))
			: DEFAULT_MAX_PER_CHAT;
	const entries = new Map<string, InboundDedupeEntry>();

	const cleanup = (entry: InboundDedupeEntry, now: number) => {
		for (const [messageId, timestamp] of entry.messageIds) {
			if (now - timestamp > ttlMs) {
				entry.messageIds.delete(messageId);
			}
		}
		if (entry.messageIds.size > maxPerChat) {
			const overflow = entry.messageIds.size - maxPerChat;
			const ids = Array.from(entry.messageIds.keys()).slice(0, overflow);
			for (const id of ids) {
				entry.messageIds.delete(id);
			}
		}
	};

	const shouldSkip = (chatId: string, messageId: number) => {
		const key = chatId.trim();
		if (!key) return false;
		const now = Date.now();
		let entry = entries.get(key);
		if (!entry) {
			entry = { messageIds: new Map() };
			entries.set(key, entry);
		}
		cleanup(entry, now);
		if (entry.messageIds.has(messageId)) return true;
		entry.messageIds.set(messageId, now);
		return false;
	};

	const clear = () => {
		entries.clear();
	};

	return { shouldSkip, clear };
}
