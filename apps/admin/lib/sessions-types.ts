export type GatewaySessionRow = {
	key: string;
	kind: "direct" | "group" | "global" | "unknown";
	label?: string;
	displayName?: string;
	agentId?: string;
	spawnedBy?: string;
	surface?: string;
	subject?: string;
	room?: string;
	space?: string;
	lastChannel?: string;
	lastTo?: string;
	deliveryContext?: Record<string, unknown>;
	updatedAt: number | null;
	sessionId?: string;
	systemSent?: boolean;
	abortedLastRun?: boolean;
	thinkingLevel?: string;
	verboseLevel?: string;
	reasoningLevel?: string;
	elevatedLevel?: string;
	responseUsage?: "off" | "tokens" | "full" | "on";
	sendPolicy?: "allow" | "deny";
	groupActivation?: "mention" | "always";
	execHost?: string;
	execSecurity?: string;
	execAsk?: string;
	execNode?: string;
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
	model?: string;
	modelProvider?: string;
	contextTokens?: number;
};

export type SessionsListResult = {
	ts: number;
	path: string;
	count: number;
	defaults: { model: string | null; contextTokens: number | null };
	sessions: GatewaySessionRow[];
};

export type SessionsPatchResult = {
	ok: true;
	path: string;
	key: string;
	entry: {
		sessionId: string;
		updatedAt?: number;
		thinkingLevel?: string;
		verboseLevel?: string;
		reasoningLevel?: string;
		elevatedLevel?: string;
	};
};
