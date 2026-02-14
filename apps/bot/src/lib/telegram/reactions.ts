export type TelegramReactionLevel = "off" | "ack" | "minimal" | "extensive";
export type TelegramReactionNotificationMode = "off" | "own" | "all";

export type ResolvedTelegramReactionLevel = {
	level: TelegramReactionLevel;
	ackEnabled: boolean;
	agentReactionsEnabled: boolean;
	agentReactionGuidance?: "minimal" | "extensive";
};

export function normalizeTelegramReactionNotificationMode(
	value?: string,
): TelegramReactionNotificationMode {
	if (value === "own" || value === "all" || value === "off") return value;
	return "off";
}

export function resolveTelegramReactionLevel(
	value?: string,
): ResolvedTelegramReactionLevel {
	const level: TelegramReactionLevel =
		value === "ack" || value === "minimal" || value === "extensive"
			? value
			: "off";

	switch (level) {
		case "off":
			return {
				level,
				ackEnabled: false,
				agentReactionsEnabled: false,
			};
		case "ack":
			return {
				level,
				ackEnabled: true,
				agentReactionsEnabled: false,
			};
		case "minimal":
			return {
				level,
				ackEnabled: false,
				agentReactionsEnabled: true,
				agentReactionGuidance: "minimal",
			};
		case "extensive":
			return {
				level,
				ackEnabled: false,
				agentReactionsEnabled: true,
				agentReactionGuidance: "extensive",
			};
		default:
			return {
				level: "off",
				ackEnabled: false,
				agentReactionsEnabled: false,
			};
	}
}
