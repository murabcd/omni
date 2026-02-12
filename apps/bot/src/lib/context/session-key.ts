export function buildSessionKey(params: {
	channel: string;
	chatType?: string;
	chatId: string;
	topic?: string;
}): string {
	const channel = params.channel.trim() || "unknown";
	const chatType = params.chatType?.trim() || "unknown";
	const chatId = params.chatId.trim() || "unknown";
	const topic = params.topic?.trim();
	return topic
		? `${channel}:${chatType}:${chatId}:${topic}`
		: `${channel}:${chatType}:${chatId}`;
}
