const TTL_MS = 24 * 60 * 60 * 1000;

type CacheEntry = {
	messageIds: Set<number>;
	timestamps: Map<number, number>;
};

const sentMessages = new Map<string, CacheEntry>();

function getChatKey(chatId: number | string): string {
	return String(chatId);
}

function cleanupExpired(entry: CacheEntry): void {
	const now = Date.now();
	for (const [msgId, timestamp] of entry.timestamps) {
		if (now - timestamp > TTL_MS) {
			entry.messageIds.delete(msgId);
			entry.timestamps.delete(msgId);
		}
	}
}

export function recordSentMessage(
	chatId: number | string,
	messageId: number,
): void {
	const key = getChatKey(chatId);
	let entry = sentMessages.get(key);
	if (!entry) {
		entry = { messageIds: new Set(), timestamps: new Map() };
		sentMessages.set(key, entry);
	}
	entry.messageIds.add(messageId);
	entry.timestamps.set(messageId, Date.now());
	if (entry.messageIds.size > 100) {
		cleanupExpired(entry);
	}
}

export function wasSentByBot(
	chatId: number | string,
	messageId: number,
): boolean {
	const key = getChatKey(chatId);
	const entry = sentMessages.get(key);
	if (!entry) return false;
	cleanupExpired(entry);
	return entry.messageIds.has(messageId);
}

export function clearSentMessageCache(): void {
	sentMessages.clear();
}
