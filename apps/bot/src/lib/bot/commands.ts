import { regex } from "arkregex";
import type { Bot, InlineKeyboard } from "grammy";
import type { ModelsFile } from "../../models-core.js";
import type { RuntimeSkill } from "../../skills-core.js";
import type { ChannelConfig } from "../channels.js";
import {
	type ChatStateStore,
	createEmptyChatState,
} from "../context/chat-state.js";
import { buildSessionKey } from "../context/session-key.js";
import type { ApprovalStore } from "../tools/approvals.js";
import type { ToolPolicy } from "../tools/policy.js";
import type { ToolConflict, ToolMeta } from "../tools/registry.js";
import { findCronJob, formatCronJob } from "./cron.js";
import type { BotContext, LogContext, QueueTurnPayload } from "./types.js";

type CommandDeps = {
	bot: Bot<BotContext>;
	startGreeting: string;
	startKeyboard: InlineKeyboard;
	sendText: (
		ctx: {
			reply: (
				text: string,
				options?: Record<string, unknown>,
			) => Promise<unknown>;
		},
		text: string,
		options?: Record<string, unknown>,
	) => Promise<void>;
	logDebug: (message: string, data?: unknown) => void;
	clearHistoryMessages: (ctx: BotContext) => Promise<void>;
	setLogContext: (ctx: BotContext, update: Partial<LogContext>) => void;
	getCommandTools: () => Promise<ToolMeta[]>;
	resolveChatToolPolicy: (ctx: BotContext) => ToolPolicy | undefined;
	toolPolicy: ToolPolicy | undefined;
	mergeToolPolicies: (
		base?: ToolPolicy,
		extra?: ToolPolicy,
	) => ToolPolicy | undefined;
	filterToolMetasByPolicy: (
		tools: ToolMeta[],
		policy?: ToolPolicy,
	) => ToolMeta[];
	TOOL_CONFLICTS: ToolConflict[];
	TOOL_SUPPRESSED_BY_POLICY: string[];
	approvalRequired: Set<string>;
	approvalStore: ApprovalStore;
	listApprovals: (
		store: ApprovalStore,
		chatId: string,
	) => Array<{ tool: string; expiresAt: number }>;
	parseToolRateLimits: (
		raw: string,
	) => Array<{ tool: string; max: number; windowSeconds: number }>;
	TOOL_RATE_LIMITS: string;
	normalizeToolName: (value: string) => string;
	runtimeSkills: RuntimeSkill[];
	filterSkillsForChannel: (options: {
		skills: RuntimeSkill[];
		channelConfig?: ChannelConfig;
	}) => RuntimeSkill[];
	resolveToolRef: (value: string) => { server?: string; tool?: string };
	trackerCallTool: (
		toolName: string,
		args: Record<string, unknown>,
		timeoutMs: number,
		ctx?: BotContext,
	) => Promise<unknown>;
	formatToolResult: (result: unknown) => string;
	getActiveModelRef: () => string;
	getActiveModelFallbacks: () => string[];
	resolveReasoning: () => string;
	setActiveModel: (ref: string) => void;
	setActiveReasoningOverride: (value: string | null) => void;
	normalizeModelRef: (ref: string) => string;
	normalizeReasoning: (value: string) => string | null;
	modelsConfig: ModelsFile;
	isGroupChat: (ctx: BotContext) => boolean;
	shouldRequireMentionForChannel: (options: {
		channelConfig?: ChannelConfig;
		defaultRequireMention: boolean;
	}) => boolean;
	isReplyToBotWithoutMention: (ctx: BotContext) => boolean;
	isBotMentioned: (ctx: BotContext) => boolean;
	TELEGRAM_GROUP_REQUIRE_MENTION: boolean;
	withTimeout: <T>(
		promise: Promise<T>,
		ms: number,
		label: string,
	) => Promise<T>;
	trackerHealthCheck: () => Promise<unknown>;
	formatUptime: (seconds: number) => string;
	getUptimeSeconds?: () => number;
	getLastTrackerCallAt: () => number | null;
	jiraEnabled?: boolean;
	figmaEnabled?: boolean;
	wikiEnabled?: boolean;
	posthogEnabled?: boolean;
	webSearchEnabled?: boolean;
	memoryEnabled?: boolean;
	realtimeCallUrl?: string;
	chatStateStore: ChatStateStore;
	cronClient?: {
		list: (params?: {
			includeDisabled?: boolean;
		}) => Promise<{ jobs?: unknown[] }>;
		add: (params: Record<string, unknown>) => Promise<unknown>;
		remove: (params: { jobId: string }) => Promise<unknown>;
		run: (params: {
			jobId: string;
			mode?: "due" | "force";
		}) => Promise<unknown>;
		update: (params: {
			id?: string;
			jobId?: string;
			patch: Record<string, unknown>;
		}) => Promise<unknown>;
		runs: (params: {
			id?: string;
			jobId?: string;
			limit?: number;
		}) => Promise<unknown>;
		status: () => Promise<unknown>;
	};
	taskClient?: {
		create: (params: Record<string, unknown>) => Promise<unknown>;
		start: (params: Record<string, unknown>) => Promise<unknown>;
		progress: (params: Record<string, unknown>) => Promise<unknown>;
		complete: (params: Record<string, unknown>) => Promise<unknown>;
		fail: (params: Record<string, unknown>) => Promise<unknown>;
		cancel: (params: Record<string, unknown>) => Promise<unknown>;
		status: (params: Record<string, unknown>) => Promise<unknown>;
		list: (params: Record<string, unknown>) => Promise<unknown>;
	};
	queueTurn?: (payload: QueueTurnPayload) => Promise<void>;
	tasksEnabled?: boolean;
	defaultCronTimezone: string;
	getChatTimezoneOverride: (ctx: BotContext) => Promise<string | undefined>;
	setChatTimezone: (
		ctx: BotContext,
		timeZone: string | null,
	) => Promise<boolean>;
};

export function registerCommands(deps: CommandDeps) {
	const HELP_STATUS_CMD_RE = regex("^cmd:(help|commands|status)$");
	const TOPIC_SPACE_RE = regex("\\s+", "g");
	const TOPIC_INVALID_RE = regex("[^a-z0-9_\\-\\u0400-\\u052f]+", "g");
	const TOPIC_DASH_RE = regex("-+", "g");
	const TOPIC_TRIM_RE = regex("(^-+)|(-+$)", "g");
	const DEFAULT_NEW_CHAT = "untitled chat";
	const {
		bot,
		startGreeting,
		startKeyboard,
		sendText,
		logDebug,
		clearHistoryMessages,
		setLogContext,
		getCommandTools,
		resolveChatToolPolicy,
		toolPolicy,
		mergeToolPolicies,
		filterToolMetasByPolicy,
		TOOL_CONFLICTS,
		TOOL_SUPPRESSED_BY_POLICY,
		approvalRequired,
		approvalStore,
		listApprovals,
		parseToolRateLimits,
		TOOL_RATE_LIMITS,
		normalizeToolName,
		runtimeSkills,
		filterSkillsForChannel,
		resolveToolRef,
		trackerCallTool,
		formatToolResult,
		getActiveModelRef,
		getActiveModelFallbacks,
		resolveReasoning,
		setActiveModel,
		setActiveReasoningOverride,
		normalizeModelRef,
		normalizeReasoning,
		modelsConfig,
		isGroupChat,
		shouldRequireMentionForChannel,
		isReplyToBotWithoutMention,
		isBotMentioned,
		TELEGRAM_GROUP_REQUIRE_MENTION,
		withTimeout,
		trackerHealthCheck,
		formatUptime,
		getUptimeSeconds,
		jiraEnabled,
		figmaEnabled,
		wikiEnabled,
		posthogEnabled,
		webSearchEnabled,
		memoryEnabled,
		realtimeCallUrl,
		chatStateStore,
		cronClient,
		taskClient,
		queueTurn,
		tasksEnabled,
		defaultCronTimezone,
		getChatTimezoneOverride,
		setChatTimezone,
	} = deps;

	const normalizeTopic = (value: string): string | null => {
		const trimmed = value.trim();
		if (!trimmed) return null;
		let out = trimmed.toLowerCase();
		out = out.replace(TOPIC_SPACE_RE, "-");
		out = out.replace(TOPIC_INVALID_RE, "-");
		out = out.replace(TOPIC_DASH_RE, "-");
		out = out.replace(TOPIC_TRIM_RE, "");
		return out || null;
	};

	const ensureUniqueTopic = (base: string, existing: Set<string>) => {
		if (!existing.has(base)) return base;
		let counter = 2;
		let candidate = `${base}-${counter}`;
		while (existing.has(candidate)) {
			counter += 1;
			candidate = `${base}-${counter}`;
		}
		return candidate;
	};

	bot.command("start", (ctx) => {
		setLogContext(ctx, { command: "/start", message_type: "command" });
		void clearHistoryMessages(ctx);
		if (ctx.chat?.type === "private") {
			const chatId = ctx.chat?.id?.toString() ?? "";
			if (chatId) {
				const defaultTopic =
					normalizeTopic(DEFAULT_NEW_CHAT) ?? "untitled-chat";
				void chatStateStore.set(chatId, {
					...createEmptyChatState(),
					activeTopic: defaultTopic,
					topics: {
						[defaultTopic]: {},
					},
				});
			}
		}
		return sendText(ctx, startGreeting, { reply_markup: startKeyboard });
	});

	async function handleHelp(ctx: {
		reply: (text: string) => Promise<unknown>;
	}) {
		await sendText(
			ctx,
			"Я omni — помогаю с задачами, аналитикой и поиском.\n\n" +
				"Умею:\n" +
				"— отчеты и напоминания по расписанию\n" +
				"— jira / yandex tracker\n" +
				"— yandex wiki (по ссылке/id/slug, без поиска)\n" +
				"— figma\n" +
				"— posthog аналитика\n" +
				"— поиск в интернете\n" +
				"— фоновые задачи через /task\n" +
				"— исследование через /research\n\n" +
				"Примеры:\n" +
				'"сделай ежедневный отчет по posthog в 11:00"\n' +
				'"проверь статус proj-1234 в tracker"\n' +
				'"открой страницу wiki по ссылке"\n' +
				'"открой макет в figma по ссылке"\n' +
				'"есть ли блокеры в текущем спринте jira?"',
		);
	}

	async function handleCommands(ctx: {
		reply: (text: string) => Promise<unknown>;
	}) {
		await sendText(
			ctx,
			"Команды:\n" +
				"— /start — начать сначала\n" +
				"— /commands — список команд\n" +
				"— /status — проверить работу бота\n" +
				"— /call — ссылка на голосовой звонок\n" +
				"— /new — новый чат\n" +
				"— /resume — вернуться к чату (/resume list — список)\n" +
				"— /tool list — список инструментов\n" +
				"— /skill list — список runtime-skills\n" +
				"— /task — фоновая задача (status/cancel)\n" +
				"— /research — режим исследования\n" +
				"— /cron — управление расписаниями\n" +
				"— /timezone — установить или посмотреть часовой пояс\n" +
				"— /help — описание возможностей\n\n",
		);
	}

	bot.command("call", async (ctx) => {
		setLogContext(ctx, { command: "/call", message_type: "command" });
		if (shouldBlockCommand(ctx)) return;
		if (!realtimeCallUrl) {
			await sendText(
				ctx,
				"Ссылка для звонка не настроена. Укажите ADMIN_UI_BASE_URL.",
			);
			return;
		}
		await sendText(
			ctx,
			`Откройте ссылку, чтобы начать звонок: ${realtimeCallUrl}`,
		);
	});

	bot.command("new", async (ctx) => {
		setLogContext(ctx, { command: "/new", message_type: "command" });
		if (shouldBlockCommand(ctx)) return;
		if (ctx.chat?.type !== "private") {
			return sendText(ctx, "Чаты доступны только в личных чатах.");
		}
		const raw = ctx.message?.text ?? "";
		const args = raw.split(" ").slice(1);
		const input = args.join(" ").trim();
		const chatId = ctx.chat?.id?.toString() ?? "";
		if (!chatId) return sendText(ctx, "Не удалось определить чат.");
		const chatState = await chatStateStore.get(chatId);
		const current = chatState.activeTopic?.trim();
		const next = input
			? normalizeTopic(input)
			: normalizeTopic(DEFAULT_NEW_CHAT);
		if (!next) return sendText(ctx, "Название чата пустое.");
		const existing = new Set(Object.keys(chatState.topics ?? {}));
		const unique = ensureUniqueTopic(next, existing);
		if (current && unique === current) {
			return sendText(ctx, `Уже в чате: ${current}`);
		}
		if (current) {
			const stack = chatState.topicStack ?? [];
			stack.push(current);
			chatState.topicStack = stack;
		}
		chatState.activeTopic = unique;
		chatState.topics = chatState.topics ?? {};
		chatState.topics[unique] = chatState.topics[unique] ?? {};
		await chatStateStore.set(chatId, chatState);
		return sendText(ctx, `Создал новый чат: ${unique}`);
	});

	bot.command("resume", async (ctx) => {
		setLogContext(ctx, { command: "/resume", message_type: "command" });
		if (shouldBlockCommand(ctx)) return;
		if (ctx.chat?.type !== "private") {
			return sendText(ctx, "Чаты доступны только в личных чатах.");
		}
		const raw = ctx.message?.text ?? "";
		const args = raw.split(" ").slice(1);
		const input = args.join(" ").trim();
		const chatId = ctx.chat?.id?.toString() ?? "";
		if (!chatId) return sendText(ctx, "Не удалось определить чат.");
		const chatState = await chatStateStore.get(chatId);
		const current = chatState.activeTopic?.trim();
		if (input.toLowerCase() === "list") {
			const stack = chatState.topicStack ?? [];
			const known = new Set([...stack, ...Object.keys(chatState.topics ?? {})]);
			if (current) known.add(current);
			const lines = [
				`Текущий чат: ${current ?? "(нет)"}`,
				known.size > 0
					? `Чаты: ${Array.from(known).join(", ")}`
					: "Чаты: (пусто)",
			];
			return sendText(ctx, lines.join("\n"));
		}
		if (!input) {
			const stack = chatState.topicStack ?? [];
			const previous = stack.pop();
			if (!previous) return sendText(ctx, "История чатов пуста.");
			chatState.topicStack = stack;
			chatState.activeTopic = previous;
			chatState.topics = chatState.topics ?? {};
			chatState.topics[previous] = chatState.topics[previous] ?? {};
			await chatStateStore.set(chatId, chatState);
			return sendText(ctx, `Вернулся в чат: ${previous}`);
		}
		const target = normalizeTopic(input);
		if (!target) return sendText(ctx, "Название чата пустое.");
		if (current && target === current) {
			return sendText(ctx, `Уже в чате: ${current}`);
		}
		if (!chatState.topics?.[target]) {
			return sendText(
				ctx,
				"Чат не найден. Создай новый через /new <название>.",
			);
		}
		if (current) {
			const stack = chatState.topicStack ?? [];
			stack.push(current);
			chatState.topicStack = stack;
		}
		chatState.activeTopic = target;
		await chatStateStore.set(chatId, chatState);
		return sendText(ctx, `Переключил чат: ${target}`);
	});

	bot.command("help", (ctx) => {
		setLogContext(ctx, { command: "/help", message_type: "command" });
		return handleHelp(ctx);
	});

	bot.command("commands", (ctx) => {
		setLogContext(ctx, { command: "/commands", message_type: "command" });
		return handleCommands(ctx);
	});

	bot.command("research", async (ctx) => {
		setLogContext(ctx, { command: "/research", message_type: "command" });
		const chatId = ctx.chat?.id?.toString() ?? "";
		if (!chatId) return sendText(ctx, "Не удалось определить чат.");
		const chatState = await chatStateStore.get(chatId);
		chatState.research = {
			active: true,
			notes: [],
			files: [],
			createdAt: Date.now(),
		};
		await chatStateStore.set(chatId, chatState);
		return sendText(
			ctx,
			"Ок, включил режим исследования.\n\n" +
				"Пришли вводные: цель, ссылки, список участников, критерии отбора.\n" +
				"Когда будешь готов — напиши «готово», и я начну.\n" +
				"Чтобы отменить — напиши «отмена».",
		);
	});

	bot.command("task", async (ctx) => {
		setLogContext(ctx, { command: "/task", message_type: "command" });
		if (!tasksEnabled || !taskClient || !queueTurn) {
			return sendText(ctx, "Фоновые задачи отключены.");
		}
		const raw = ctx.message?.text ?? "";
		const args = raw.split(" ").slice(1);
		if (args.length === 0) {
			return sendText(
				ctx,
				"Использование:\n" +
					"/task <запрос>\n" +
					"/task status <id>\n" +
					"/task cancel <id>",
			);
		}
		const sub = args[0]?.toLowerCase();
		if (sub === "status") {
			const id = args[1];
			if (!id) return sendText(ctx, "Укажи id задачи.");
			const status = await taskClient.status({ id });
			return sendText(ctx, JSON.stringify(status, null, 2));
		}
		if (sub === "cancel") {
			const id = args[1];
			if (!id) return sendText(ctx, "Укажи id задачи.");
			const result = await taskClient.cancel({ id });
			return sendText(ctx, JSON.stringify(result, null, 2));
		}
		const text = args.join(" ").trim();
		if (!text) return sendText(ctx, "Пустой запрос.");
		const chatId = ctx.chat?.id?.toString() ?? "";
		if (!chatId) return sendText(ctx, "Не удалось определить чат.");
		const chatState = await chatStateStore.get(chatId);
		const activeTopic =
			ctx.chat?.type === "private" ? chatState.activeTopic?.trim() : undefined;
		const chatType = ctx.chat?.type ?? "private";
		const sessionKey = buildSessionKey({
			channel: "telegram",
			chatType,
			chatId,
			...(activeTopic ? { topic: activeTopic } : {}),
		});
		const created = (await taskClient.create({
			sessionKey,
			chatId,
			chatType,
			text,
			meta: {
				source: "telegram",
				reason: "command",
			},
		})) as { id?: string };
		const taskId = created?.id?.toString();
		if (taskId) {
			await queueTurn({
				sessionKey,
				chatId,
				chatType,
				text,
				kind: "task",
				channelConfig: ctx.state.channelConfig,
				meta: { taskId, reason: "command" },
			});
			return sendText(
				ctx,
				`Запустил задачу. ID: ${taskId}\nСтатус: /task status ${taskId}`,
			);
		}
		return sendText(ctx, "Не удалось создать задачу.");
	});

	async function handleTools(ctx: {
		reply: (text: string) => Promise<unknown>;
	}) {
		try {
			const tools = await getCommandTools();
			const chatPolicy = resolveChatToolPolicy(ctx as BotContext);
			const effectivePolicy = mergeToolPolicies(toolPolicy, chatPolicy);
			const filteredTools = filterToolMetasByPolicy(tools, effectivePolicy);
			if (!tools.length) {
				await sendText(ctx, "Нет доступных инструментов.");
				return;
			}

			const lines = filteredTools.map((tool) => tool.name);

			const conflictLines =
				TOOL_CONFLICTS.length > 0
					? TOOL_CONFLICTS.map(
							(conflict) =>
								`- ${conflict.tool.name} (дубликат имени, источник ${conflict.tool.source})`,
						)
					: [];
			const suppressedLines = (() => {
				const globalSuppressed =
					TOOL_SUPPRESSED_BY_POLICY.length > 0 ? TOOL_SUPPRESSED_BY_POLICY : [];
				if (!chatPolicy) return globalSuppressed;
				const chatSuppressed = tools
					.filter((tool) => !filteredTools.includes(tool))
					.map((tool) => tool.name);
				return Array.from(new Set([...globalSuppressed, ...chatSuppressed]));
			})();
			const approvalLines =
				approvalRequired.size > 0
					? Array.from(approvalRequired).map((name) => `- ${name}`)
					: [];
			const rateRules = parseToolRateLimits(TOOL_RATE_LIMITS);
			const rateLimitLines =
				rateRules.length > 0
					? [
							"Лимиты (на пользователя и чат):",
							...rateRules.map(
								(rule) => `- ${rule.tool}: ${rule.max}/${rule.windowSeconds}с`,
							),
						]
					: [];
			const sections = [
				`Доступные инструменты:\n${lines.join("\n")}`,
				conflictLines.length > 0
					? `\nКонфликты:\n${conflictLines.join("\n")}`
					: "",
				suppressedLines.length > 0
					? `\nОтключены политикой:\n${suppressedLines.map((name) => `- ${name}`).join("\n")}`
					: "",
				approvalLines.length > 0
					? `\nТребуют одобрения:\n${approvalLines.join("\n")}`
					: "",
				rateLimitLines.length > 0 ? `\n${rateLimitLines.join("\n")}` : "",
			].filter(Boolean);

			await sendText(ctx, sections.join("\n"));
		} catch (error) {
			await sendText(ctx, `Ошибка списка инструментов: ${String(error)}`);
		}
	}

	bot.command("tool", async (ctx) => {
		setLogContext(ctx, { command: "/tool", message_type: "command" });
		const text = ctx.message?.text ?? "";
		const [, sub] = text.split(" ");
		if (!sub || sub.toLowerCase() !== "list") {
			await sendText(ctx, "Использование: /tool list");
			return;
		}
		return handleTools(ctx);
	});

	bot.command("approve", async (ctx) => {
		setLogContext(ctx, { command: "/approve", message_type: "command" });
		const text = ctx.message?.text ?? "";
		const [, toolRaw] = text.split(" ");
		const chatId = ctx.chat?.id?.toString() ?? "";
		if (!chatId) {
			await sendText(ctx, "Нет chat_id для одобрения.");
			return;
		}
		if (!toolRaw) {
			const list =
				approvalRequired.size > 0
					? Array.from(approvalRequired).join(", ")
					: "нет";
			await sendText(
				ctx,
				`Использование: /approve <tool>\nТребуют одобрения: ${list}`,
			);
			return;
		}
		const normalized = normalizeToolName(toolRaw);
		if (!approvalRequired.has(normalized)) {
			await sendText(ctx, `Инструмент ${normalized} не требует одобрения.`);
			return;
		}
		approvalStore.approve(chatId, normalized);
		await sendText(ctx, `Одобрено: ${normalized}. Повторите запрос.`);
	});

	bot.command("approvals", async (ctx) => {
		setLogContext(ctx, { command: "/approvals", message_type: "command" });
		const chatId = ctx.chat?.id?.toString() ?? "";
		if (!chatId) {
			await sendText(ctx, "Нет chat_id для списка одобрений.");
			return;
		}
		const approvals = listApprovals(approvalStore, chatId);
		if (approvals.length === 0) {
			await sendText(ctx, "Активных одобрений нет.");
			return;
		}
		const lines = approvals.map(
			(item) => `- ${item.tool} (до ${new Date(item.expiresAt).toISOString()})`,
		);
		await sendText(ctx, `Активные одобрения:\n${lines.join("\n")}`);
	});

	bot.command("model", async (ctx) => {
		setLogContext(ctx, { command: "/model", message_type: "command" });
		const text = ctx.message?.text ?? "";
		const [, sub, ...rest] = text.split(" ");
		if (sub) setLogContext(ctx, { command_sub: sub });

		if (!sub) {
			const fallbacks = getActiveModelFallbacks().length
				? getActiveModelFallbacks().join(", ")
				: "нет";
			await sendText(
				ctx,
				`Модель: ${getActiveModelRef()}\nРежим рассуждений: ${resolveReasoning()}\nРезервные модели: ${fallbacks}`,
			);
			return;
		}

		if (sub === "list") {
			const lines = Object.entries(modelsConfig.models).map(([ref, cfg]) => {
				const label = cfg.label ?? cfg.id;
				return `${ref} - ${label}`;
			});
			await sendText(ctx, `Доступные модели:\n${lines.join("\n")}`);
			return;
		}

		if (sub === "set") {
			const raw = rest.join(" ").trim();
			if (!raw) {
				await sendText(ctx, "Использование: /model set <ref>");
				return;
			}
			const normalized = normalizeModelRef(raw);
			try {
				setActiveModel(normalized);
				await sendText(ctx, `Модель установлена: ${getActiveModelRef()}`);
			} catch (error) {
				await sendText(ctx, `Ошибка модели: ${String(error)}`);
			}
			return;
		}

		if (sub === "reasoning") {
			const raw = rest.join(" ").trim();
			const normalized = normalizeReasoning(raw);
			if (!normalized) {
				await sendText(ctx, "Режим рассуждений: off|low|standard|high");
				return;
			}
			setActiveReasoningOverride(normalized);
			await sendText(ctx, `Режим рассуждений установлен: ${normalized}`);
			return;
		}

		await sendText(ctx, "Неизвестная подкоманда /model");
	});

	bot.command("skill", async (ctx) => {
		setLogContext(ctx, { command: "/skill", message_type: "command" });
		const channelSkills = filterSkillsForChannel({
			skills: runtimeSkills,
			channelConfig: ctx.state.channelConfig,
		});
		const channelSupported = filterSkillsForChannel({
			skills: runtimeSkills,
			channelConfig: ctx.state.channelConfig,
		});
		if (
			isGroupChat(ctx) &&
			shouldRequireMentionForChannel({
				channelConfig: ctx.state.channelConfig,
				defaultRequireMention: TELEGRAM_GROUP_REQUIRE_MENTION,
			})
		) {
			const allowReply = isReplyToBotWithoutMention(ctx);
			if (!allowReply && !isBotMentioned(ctx)) {
				setLogContext(ctx, { outcome: "blocked", status_code: 403 });
				return;
			}
		}
		const text = ctx.message?.text ?? "";
		const [, sub, ...rest] = text.split(" ");
		if (!sub) {
			await sendText(
				ctx,
				"Использование: /skill list\nили /skill <name> <json>",
			);
			return;
		}
		if (sub.toLowerCase() === "list") {
			if (!channelSkills.length) {
				await sendText(ctx, "Нет доступных runtime-skills.");
				return;
			}
			const supported = new Set(channelSupported.map((skill) => skill.name));
			const lines = channelSkills.map((skill) => {
				const suffix = supported.has(skill.name) ? "" : " (заблокировано)";
				return `${skill.name}${suffix}`;
			});
			await sendText(ctx, `Доступные runtime-skills:\n${lines.join("\n")}`);
			return;
		}
		const skillName = sub;
		const skill = channelSupported.find((item) => item.name === skillName);
		if (!skill) {
			await sendText(ctx, `Неизвестный skill: ${skillName}`);
			return;
		}

		const rawArgs = rest.join(" ").trim();
		let args: Record<string, unknown> = {};
		if (rawArgs) {
			try {
				args = JSON.parse(rawArgs) as Record<string, unknown>;
			} catch (error) {
				await sendText(ctx, `Некорректный JSON: ${String(error)}`);
				return;
			}
		}

		const mergedArgs = { ...(skill.args ?? {}), ...args };
		const { server, tool } = resolveToolRef(skill.tool);
		if (!tool) {
			await sendText(ctx, `Некорректный инструмент в skill: ${skill.name}`);
			return;
		}
		const ALLOWED_SKILL_SERVERS = new Set([
			"yandex-tracker",
			"jira",
			"web",
			"memory",
			"posthog",
		]);
		if (!server || !ALLOWED_SKILL_SERVERS.has(server)) {
			await sendText(ctx, `Неподдерживаемый сервер инструмента: ${server}`);
			return;
		}

		try {
			if (server === "yandex-tracker" || server === "tracker") {
				const result = await trackerCallTool(
					tool,
					mergedArgs,
					skill.timeoutMs ?? 8_000,
					ctx,
				);
				const text = formatToolResult(result);
				if (text) {
					await sendText(ctx, text);
					return;
				}
				await sendText(ctx, "Skill выполнился, но не вернул текст.");
				return;
			}
			await sendText(
				ctx,
				`Инструменты сервера ${server} пока не поддерживаются в /skill.`,
			);
			return;
		} catch (error) {
			await sendText(ctx, `Ошибка вызова skill: ${String(error)}`);
		}
	});

	function shouldBlockCommand(ctx: BotContext) {
		if (
			isGroupChat(ctx) &&
			shouldRequireMentionForChannel({
				channelConfig: ctx.state.channelConfig,
				defaultRequireMention: TELEGRAM_GROUP_REQUIRE_MENTION,
			})
		) {
			const allowReply = isReplyToBotWithoutMention(ctx);
			if (!allowReply && !isBotMentioned(ctx)) {
				setLogContext(ctx, { outcome: "blocked", status_code: 403 });
				return true;
			}
		}
		return false;
	}

	type CronResolution =
		| {
				id: string;
				job?: unknown;
				error?: undefined;
		  }
		| {
				error: "cron_not_configured" | "not_found" | "ambiguous";
				id?: undefined;
				job?: undefined;
		  };

	async function resolveCronJobTarget(target: string): Promise<CronResolution> {
		if (!cronClient) return { error: "cron_not_configured" };
		const payload = await cronClient.list({ includeDisabled: true });
		const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
		const matches = findCronJob(jobs, target);
		if (matches.length === 0) return { error: "not_found" };
		if (matches.length > 1) return { error: "ambiguous" };
		const job = matches[0] as { id?: string };
		return { id: job.id ?? target, job };
	}

	bot.command("timezone", async (ctx) => {
		setLogContext(ctx, { command: "/timezone", message_type: "command" });
		if (shouldBlockCommand(ctx)) return;
		if (!setChatTimezone) {
			await sendText(ctx, "Хранилище часовых поясов не настроено.");
			return;
		}
		const text = ctx.message?.text ?? "";
		const parts = text.split(" ");
		const raw = parts.slice(1).join(" ").trim();
		if (!raw) {
			const override = await getChatTimezoneOverride(ctx);
			const value = override ?? defaultCronTimezone;
			const suffix = override ? " (пользовательский)" : " (по умолчанию)";
			await sendText(ctx, `Часовой пояс: ${value}${suffix}`);
			return;
		}
		if (raw === "reset" || raw === "default") {
			const ok = await setChatTimezone(ctx, null);
			await sendText(
				ctx,
				ok
					? `Часовой пояс сброшен на умолчание (${defaultCronTimezone}).`
					: "Не удалось сбросить часовой пояс.",
			);
			return;
		}
		const ok = await setChatTimezone(ctx, raw);
		await sendText(
			ctx,
			ok
				? `Часовой пояс установлен: ${raw}.`
				: "Не удалось установить часовой пояс.",
		);
	});

	bot.command("cron", async (ctx) => {
		setLogContext(ctx, { command: "/cron", message_type: "command" });
		if (shouldBlockCommand(ctx)) return;
		if (!cronClient) {
			await sendText(ctx, "Cron не настроен.");
			return;
		}
		const text = ctx.message?.text ?? "";
		const parts = text.split(" ");
		const sub = parts[1]?.trim().toLowerCase() ?? "";
		const rest = parts.slice(2).join(" ").trim();

		if (!sub || sub === "help") {
			await sendText(
				ctx,
				"Использование:\n" +
					"/cron list\n" +
					"/cron status [id|name]\n" +
					"/cron runs <id|name>\n" +
					"/cron run <id|name>\n" +
					"/cron stop <id|name>\n" +
					"/cron start <id|name>\n" +
					"/cron remove <id|name>\n" +
					"/cron edit <id|name> cron <expr> [tz]\n" +
					"/cron edit <id|name> every <minutes>",
			);
			return;
		}

		if (sub === "list") {
			const payload = await cronClient.list({ includeDisabled: true });
			const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
			if (jobs.length === 0) {
				await sendText(ctx, "Нет cron-задач.");
				return;
			}
			const lines = jobs.map((job) => formatCronJob(job));
			await sendText(ctx, lines.join("\n"));
			return;
		}

		if (sub === "status") {
			if (!rest) {
				const status = await cronClient.status();
				await sendText(ctx, JSON.stringify(status, null, 2));
				return;
			}
			const resolved = await resolveCronJobTarget(rest);
			if (resolved.error === "not_found") {
				await sendText(ctx, `Не найдена задача для ${rest}.`);
				return;
			}
			if (resolved.error === "ambiguous") {
				await sendText(ctx, "Найдено несколько совпадений. Укажите ID задачи.");
				return;
			}
			if (resolved.error) {
				await sendText(ctx, "Cron не настроен.");
				return;
			}
			await sendText(ctx, formatCronJob(resolved.job));
			return;
		}

		if (sub === "runs") {
			if (!rest) {
				await sendText(ctx, "Использование: /cron runs <id|name>");
				return;
			}
			const resolved = await resolveCronJobTarget(rest);
			if (resolved.error === "not_found") {
				await sendText(ctx, `Не найдена задача для ${rest}.`);
				return;
			}
			if (resolved.error === "ambiguous") {
				await sendText(ctx, "Найдено несколько совпадений. Укажите ID задачи.");
				return;
			}
			if (resolved.error) {
				await sendText(ctx, "Cron не настроен.");
				return;
			}
			const runs = await cronClient.runs({ id: resolved.id, limit: 10 });
			await sendText(ctx, JSON.stringify(runs, null, 2));
			return;
		}

		if (sub === "run") {
			if (!rest) {
				await sendText(ctx, "Использование: /cron run <id|name>");
				return;
			}
			const resolved = await resolveCronJobTarget(rest);
			if (resolved.error === "not_found") {
				await sendText(ctx, `Не найдена задача для ${rest}.`);
				return;
			}
			if (resolved.error === "ambiguous") {
				await sendText(ctx, "Найдено несколько совпадений. Укажите ID задачи.");
				return;
			}
			if (resolved.error) {
				await sendText(ctx, "Cron не настроен.");
				return;
			}
			await cronClient.run({ jobId: resolved.id, mode: "force" });
			await sendText(ctx, `Запуск инициирован: ${resolved.id}.`);
			return;
		}

		if (
			sub === "stop" ||
			sub === "start" ||
			sub === "enable" ||
			sub === "disable"
		) {
			if (!rest) {
				await sendText(ctx, `Использование: /cron ${sub} <id|name>`);
				return;
			}
			const resolved = await resolveCronJobTarget(rest);
			if (resolved.error === "not_found") {
				await sendText(ctx, `Не найдена задача для ${rest}.`);
				return;
			}
			if (resolved.error === "ambiguous") {
				await sendText(ctx, "Найдено несколько совпадений. Укажите ID задачи.");
				return;
			}
			if (resolved.error) {
				await sendText(ctx, "Cron не настроен.");
				return;
			}
			const enabled = sub === "start" || sub === "enable";
			const updated = await cronClient.update({
				id: resolved.id,
				patch: { enabled },
			});
			await sendText(
				ctx,
				updated ? `Обновлено: ${formatCronJob(updated)}` : "Обновлено.",
			);
			return;
		}

		if (sub === "remove" || sub === "delete") {
			if (!rest) {
				await sendText(ctx, `Использование: /cron ${sub} <id|name>`);
				return;
			}
			const resolved = await resolveCronJobTarget(rest);
			if (resolved.error === "not_found") {
				await sendText(ctx, `Не найдена задача для ${rest}.`);
				return;
			}
			if (resolved.error === "ambiguous") {
				await sendText(ctx, "Найдено несколько совпадений. Укажите ID задачи.");
				return;
			}
			if (resolved.error) {
				await sendText(ctx, "Cron не настроен.");
				return;
			}
			await cronClient.remove({ jobId: resolved.id });
			await sendText(ctx, `Удалено: ${resolved.id}.`);
			return;
		}

		if (sub === "edit") {
			const editParts = rest.split(" ");
			const target = editParts.shift()?.trim() ?? "";
			const mode = editParts.shift()?.trim()?.toLowerCase() ?? "";
			if (!target || !mode) {
				await sendText(
					ctx,
					"Использование: /cron edit <id|name> cron <expr> [tz] | /cron edit <id|name> every <minutes>",
				);
				return;
			}
			const resolved = await resolveCronJobTarget(target);
			if (resolved.error === "not_found") {
				await sendText(ctx, `Не найдена задача для ${target}.`);
				return;
			}
			if (resolved.error === "ambiguous") {
				await sendText(ctx, "Найдено несколько совпадений. Укажите ID задачи.");
				return;
			}
			if (resolved.error) {
				await sendText(ctx, "Cron не настроен.");
				return;
			}
			if (mode === "every") {
				const minutesRaw = editParts[0] ?? "";
				const minutes = Number.parseInt(minutesRaw, 10);
				if (!Number.isFinite(minutes) || minutes <= 0) {
					await sendText(ctx, "Некорректное число минут для режима every.");
					return;
				}
				const updated = await cronClient.update({
					id: resolved.id,
					patch: { schedule: { kind: "every", everyMs: minutes * 60_000 } },
				});
				await sendText(
					ctx,
					updated ? `Обновлено: ${formatCronJob(updated)}` : "Обновлено.",
				);
				return;
			}
			if (mode === "cron") {
				const tz = editParts[editParts.length - 1];
				const expr =
					editParts.length > 1
						? editParts.slice(0, -1).join(" ")
						: editParts.join(" ");
				if (!expr.trim()) {
					await sendText(ctx, "Не задано cron-выражение.");
					return;
				}
				const updated = await cronClient.update({
					id: resolved.id,
					patch: {
						schedule: {
							kind: "cron",
							expr: expr.trim(),
							tz: tz?.includes("/") ? tz : undefined,
						},
					},
				});
				await sendText(
					ctx,
					updated ? `Обновлено: ${formatCronJob(updated)}` : "Обновлено.",
				);
				return;
			}
			await sendText(
				ctx,
				"Неизвестный режим редактирования. Используйте 'cron' или 'every'.",
			);
			return;
		}

		await sendText(
			ctx,
			"Неизвестная подкоманда /cron. Используйте /cron help.",
		);
	});

	async function handleStatus(ctx: {
		reply: (text: string) => Promise<unknown>;
	}) {
		const uptimeSeconds = getUptimeSeconds?.() ?? 0;
		const uptime = formatUptime(uptimeSeconds);
		let trackerStatus = "ок";
		try {
			await withTimeout(trackerHealthCheck(), 5_000, "trackerHealthCheck");
		} catch (error) {
			trackerStatus = `ошибка: ${String(error)}`;
		}

		const lines = [
			"Статус:",
			`— аптайм: ${uptime}`,
			`— модель: ${getActiveModelRef()}`,
			`— yandex-tracker: ${trackerStatus}`,
			`— jira: ${jiraEnabled ? "ок" : "не настроен"}`,
			`— figma: ${figmaEnabled ? "ок" : "не настроена"}`,
			`— yandex-wiki: ${wikiEnabled ? "ок" : "не настроена"}`,
			`— posthog: ${posthogEnabled ? "ок" : "не настроен"}`,
			`— веб-поиск: ${webSearchEnabled ? "включён" : "выключен"}`,
			`— память: ${memoryEnabled ? "ок" : "не настроена"}`,
		];
		await sendText(ctx, lines.join("\n"));
	}

	bot.command("status", (ctx) => {
		setLogContext(ctx, { command: "/status", message_type: "command" });
		return handleStatus(ctx);
	});

	bot.command("whoami", (ctx) => {
		setLogContext(ctx, { command: "/whoami", message_type: "command" });
		return sendText(
			ctx,
			"Я Omni, персональный ассистент для задач, аналитики и поиска информации.",
		);
	});

	async function safeAnswerCallback(ctx: {
		answerCallbackQuery: () => Promise<unknown>;
	}) {
		try {
			await ctx.answerCallbackQuery();
		} catch (error) {
			logDebug("callback_query answer failed", { error: String(error) });
		}
	}

	async function refreshInlineKeyboard(ctx: {
		editMessageReplyMarkup: (options: {
			reply_markup: InlineKeyboard;
		}) => Promise<unknown>;
	}) {
		try {
			await ctx.editMessageReplyMarkup({
				reply_markup: startKeyboard,
			});
		} catch (error) {
			logDebug("callback_query refresh keyboard failed", {
				error: String(error),
			});
		}
	}

	bot.callbackQuery(HELP_STATUS_CMD_RE, async (ctx) => {
		setLogContext(ctx, { message_type: "callback" });
		await safeAnswerCallback(ctx);
		const command = ctx.match?.[1];
		if (command === "help") {
			setLogContext(ctx, { command: "cmd:help" });
			await handleHelp(ctx);
			await refreshInlineKeyboard(ctx);
			return;
		}
		if (command === "commands") {
			setLogContext(ctx, { command: "cmd:commands" });
			await handleCommands(ctx);
			await refreshInlineKeyboard(ctx);
			return;
		}
		if (command === "status") {
			setLogContext(ctx, { command: "cmd:status" });
			await handleStatus(ctx);
			await refreshInlineKeyboard(ctx);
		}
	});

	bot.on("callback_query:data", async (ctx) => {
		setLogContext(ctx, { message_type: "callback" });
		await safeAnswerCallback(ctx);
	});
}
