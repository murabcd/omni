import type { InlineKeyboard } from "grammy";
import { describe, expect, it } from "vitest";
import { registerCommands } from "../src/lib/bot/commands.js";
import { createInMemoryChatStateStore } from "../src/lib/context/chat-state.js";
import {
	createApprovalStore,
	listApprovals,
} from "../src/lib/tools/approvals.js";
import type { ModelsFile } from "../src/models-core.js";

type CommandContext = {
	chat: { id: number; type: string };
	message: { text: string };
	state: { channelConfig?: unknown };
	reply: (text?: string) => Promise<unknown>;
};

type CommandHandler = (ctx: CommandContext) => Promise<unknown> | unknown;

type CapturedHandlers = Record<string, CommandHandler>;

function setup() {
	const handlers: CapturedHandlers = {};
	const bot = {
		command: (name: string, handler: CommandHandler) => {
			handlers[name] = handler;
			return bot;
		},
		callbackQuery: () => bot,
		on: () => bot,
	};
	const messages: string[] = [];
	const chatStateStore = createInMemoryChatStateStore();
	const approvalStore = createApprovalStore(60_000);
	const modelsConfig = { models: {} } as ModelsFile;

	registerCommands({
		bot,
		startGreeting: "hi",
		startKeyboard: {} as InlineKeyboard,
		sendText: async (_ctx, text) => {
			messages.push(text);
		},
		logDebug: () => {},
		clearHistoryMessages: async () => {},
		setLogContext: () => {},
		getCommandTools: async () => [],
		resolveChatToolPolicy: () => undefined,
		toolPolicy: undefined,
		mergeToolPolicies: (base, extra) => extra ?? base,
		filterToolMetasByPolicy: (tools) => tools,
		TOOL_CONFLICTS: [],
		TOOL_SUPPRESSED_BY_POLICY: [],
		approvalRequired: new Set(),
		approvalStore,
		listApprovals,
		parseToolRateLimits: () => [],
		TOOL_RATE_LIMITS: "",
		normalizeToolName: (value) => value,
		runtimeSkills: [],
		filterSkillsForChannel: ({ skills }) => skills,
		resolveToolRef: () => ({}),
		trackerCallTool: async () => ({}),
		formatToolResult: () => "",
		getActiveModelRef: () => "default",
		getActiveModelFallbacks: () => [],
		resolveReasoning: () => "off",
		setActiveModel: () => {},
		setActiveReasoningOverride: () => {},
		normalizeModelRef: (value) => value,
		normalizeReasoning: (value) => value,
		modelsConfig,
		isGroupChat: (ctx) => ctx.chat?.type !== "private",
		shouldRequireMentionForChannel: () => false,
		isReplyToBotWithoutMention: () => false,
		isBotMentioned: () => true,
		TELEGRAM_GROUP_REQUIRE_MENTION: false,
		withTimeout: async (promise) => promise,
		trackerHealthCheck: async () => ({}),
		formatUptime: () => "0s",
		getUptimeSeconds: () => 0,
		getLastTrackerCallAt: () => null,
		chatStateStore,
		defaultCronTimezone: "UTC",
		getChatTimezoneOverride: async () => undefined,
		setChatTimezone: async () => true,
	});

	return { handlers, messages, chatStateStore };
}

function makeCtx(text: string) {
	return {
		chat: { id: 1, type: "private" },
		message: { text },
		state: { channelConfig: undefined },
		reply: async () => {},
	};
}

describe("chat commands", () => {
	it("creates a default chat on /start", async () => {
		const { handlers, chatStateStore } = setup();
		await handlers.start?.(makeCtx("/start"));
		const chatState = await chatStateStore.get("1");
		expect(chatState.activeTopic).toBe("untitled-chat");
		expect(chatState.topics?.["untitled-chat"]).toBeDefined();
	});

	it("creates an untitled chat when /new has no name", async () => {
		const { handlers, messages, chatStateStore } = setup();
		await handlers.new?.(makeCtx("/new"));
		const chatState = await chatStateStore.get("1");
		expect(chatState.activeTopic).toBe("untitled-chat");
		expect(chatState.topics?.["untitled-chat"]).toBeDefined();
		expect(messages[messages.length - 1]).toContain("untitled-chat");
	});

	it("creates and resumes named chats only when explicitly requested", async () => {
		const { handlers, messages, chatStateStore } = setup();
		await handlers.new?.(makeCtx("/new Project X"));
		const chatState = await chatStateStore.get("1");
		expect(chatState.activeTopic).toBe("project-x");
		expect(chatState.topics?.["project-x"]).toBeDefined();

		await handlers.resume?.(makeCtx("/resume list"));
		expect(messages[messages.length - 1]).toContain("project-x");

		await handlers.resume?.(makeCtx("/resume does-not-exist"));
		expect(messages[messages.length - 1]).toContain("Чат не найден");
	});
});
