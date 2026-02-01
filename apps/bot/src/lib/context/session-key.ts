export function buildSessionKey(params: {
	channel: string;
	chatType?: string;
	chatId: string;
}): string {
	const channel = params.channel.trim() || "unknown";
	const chatType = params.chatType?.trim() || "unknown";
	const chatId = params.chatId.trim() || "unknown";
	return `${channel}:${chatType}:${chatId}`;
}
