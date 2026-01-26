export type ChannelEntry = {
	key: string;
	kind: "direct" | "group" | "unknown";
	surface: string;
	chatId: string;
	title?: string;
	label?: string;
	lastSeenAt: number;
	enabled?: boolean;
	requireMention?: boolean;
	allowUserIds?: string[];
	skillsAllowlist?: string[];
	skillsDenylist?: string[];
	systemPrompt?: string;
};

export type ChannelsListResult = {
	entries: ChannelEntry[];
};
