export type HookEventType = "telegram.message" | "admin.message" | "tool.finish";

export type HookFilter = {
	chatId?: string;
	chatType?: string;
	textIncludes?: string;
	toolName?: string;
};

export type HookAction =
	| {
			type: "enqueue_turn";
			text: string;
			kind?: "system" | "hook" | "followup";
	  }
	| {
			type: "spawn_subagent";
			prompt: string;
			announcePrefix?: string;
	  };

export type HookConfig = {
	id: string;
	event: HookEventType;
	filter?: HookFilter;
	action: HookAction;
	enabled?: boolean;
};

export type HookDispatchContext = {
	event: HookEventType;
	chatId?: string;
	chatType?: string;
	text?: string;
	toolName?: string;
};

export function parseHooksConfig(raw?: string): HookConfig[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.map((item) => normalizeHook(item))
			.filter((item): item is HookConfig => Boolean(item));
	} catch {
		return [];
	}
}

function normalizeHook(input: unknown): HookConfig | null {
	if (!input || typeof input !== "object") return null;
	const obj = input as Record<string, unknown>;
	const id =
		typeof obj.id === "string" && obj.id.trim()
			? obj.id.trim()
			: crypto.randomUUID();
	const event =
		obj.event === "telegram.message" ||
		obj.event === "admin.message" ||
		obj.event === "tool.finish"
			? (obj.event as HookEventType)
			: null;
	if (!event) return null;
	const enabled = obj.enabled !== false;
	const filter =
		obj.filter && typeof obj.filter === "object"
			? (obj.filter as HookFilter)
			: undefined;
	const action =
		obj.action && typeof obj.action === "object"
			? (obj.action as HookAction)
			: null;
	if (!action || !("type" in action)) return null;
	return { id, event, filter, action, enabled };
}

export function dispatchHooks(
	hooks: HookConfig[],
	ctx: HookDispatchContext,
): HookAction[] {
	if (!hooks.length) return [];
	const matches: HookAction[] = [];
	for (const hook of hooks) {
		if (!hook.enabled) continue;
		if (hook.event !== ctx.event) continue;
		if (!passesFilter(hook.filter, ctx)) continue;
		matches.push(hook.action);
	}
	return matches;
}

function passesFilter(filter: HookFilter | undefined, ctx: HookDispatchContext) {
	if (!filter) return true;
	if (filter.chatId && filter.chatId !== ctx.chatId) return false;
	if (filter.chatType && filter.chatType !== ctx.chatType) return false;
	if (filter.textIncludes) {
		const text = ctx.text ?? "";
		if (!text.includes(filter.textIncludes)) return false;
	}
	if (filter.toolName && filter.toolName !== ctx.toolName) return false;
	return true;
}
