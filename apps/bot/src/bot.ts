import fs from "node:fs/promises";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { sequentialize } from "@grammyjs/runner";
import { apiThrottler } from "@grammyjs/transformer-throttler";
import { buildAgentInstructions } from "@omni/prompts";
import { PostHogAgentToolkit } from "@posthog/agent-toolkit/integrations/ai-sdk";
import {
	convertToModelMessages,
	type ToolLoopAgent,
	type ToolSet,
	tool,
	experimental_transcribe as transcribe,
	type UIMessageChunk,
} from "ai";
import { regex } from "arkregex";
import { API_CONSTANTS, Bot, InlineKeyboard, InputFile } from "grammy";
import { z } from "zod";
import {
	type AgentToolCall,
	type AgentToolResult,
	buildUserUIMessage,
	createAgentFactory,
	createAgentStreamWithTools,
	createAgentToolsFactory,
} from "./lib/agent/create.js";
import { createOrchestrationHelpers } from "./lib/agent/orchestration.js";
import {
	createIssueAgent,
	createMultiIssueAgent,
} from "./lib/agents/issue-agent.js";
import {
	buildSubagentToolset,
	type OrchestrationAgentId,
	routeRequest,
	runOrchestration,
} from "./lib/agents/orchestrator.js";
import {
	buildJiraTools,
	buildMemoryTools as buildMemorySubagentTools,
	buildPosthogTools,
	buildTrackerTools,
	buildWebTools,
} from "./lib/agents/subagents/index.js";
import {
	type AttachmentCandidate,
	buildAttachmentPrompt,
	extractGoogleLinks,
	isSupportedAttachment,
	normalizeTrackerAttachment,
	parseConsent,
} from "./lib/attachments.js";
import { createAccessHelpers, isGroupChat } from "./lib/bot/access.js";
import { registerCommands } from "./lib/bot/commands.js";
import { createInboundDedupe } from "./lib/bot/inbound-dedupe.js";
import {
	createLogHelpers,
	createRequestLoggerMiddleware,
} from "./lib/bot/logging.js";
import { createTelegramHelpers } from "./lib/bot/telegram.js";
import type { BotContext, QueueTurnPayload } from "./lib/bot/types.js";
import {
	type ChannelConfig,
	filterSkillsForChannel,
	isUserAllowedForChannel,
	parseChannelConfig,
	shouldRequireMentionForChannel,
} from "./lib/channels.js";
import { createFigmaClient } from "./lib/clients/figma.js";
import { createJiraClient } from "./lib/clients/jira.js";
import {
	createTrackerClient,
	extractCommentsText,
	type TrackerToolResult,
} from "./lib/clients/tracker.js";
import { createWikiClient } from "./lib/clients/wiki.js";
import { mapWithConcurrency } from "./lib/concurrency.js";
import { type BotEnv, loadBotEnv } from "./lib/config/env.js";
import {
	type ChatStateStore,
	createInMemoryChatStateStore,
} from "./lib/context/chat-state.js";
import type {
	ChatState,
	PendingAttachmentRequest,
} from "./lib/context/chat-state-types.js";
import {
	appendHistoryMessage,
	clearHistoryMessages as clearSessionHistory,
	formatHistoryForPrompt,
	loadHistoryMessages,
} from "./lib/context/session-history.js";
import { buildSessionKey } from "./lib/context/session-key.js";
import {
	type FilePart,
	isDocxDocument,
	isPdfDocument,
	toFilePart,
} from "./lib/files.js";
import type { ImageStore } from "./lib/image-store.js";
import { type ImageFilePart, toImageFilePart } from "./lib/images.js";
import { normalizeJiraIssue } from "./lib/jira.js";
import { createLogger } from "./lib/logger.js";
import {
	filterPosthogTools,
	POSTHOG_READONLY_TOOL_NAMES,
} from "./lib/posthog-tools.js";
import { buildSkillsPrompt } from "./lib/prompts/skills-prompt.js";
import { formatUserDateTime } from "./lib/prompts/time.js";
import type { TextStore } from "./lib/storage/text-store.js";
import { decideTaskMode, extractTaskOverride } from "./lib/tasks/router.js";
import { markdownToTelegramChunks } from "./lib/telegram/format.js";
import {
	extractIssueKeysFromText,
	truncateText,
} from "./lib/text/normalize.js";
import { createToolStatusHandler } from "./lib/tool-status.js";
import { parseSenderToolAccess } from "./lib/tools/access.js";
import {
	createApprovalStore,
	listApprovals,
	parseApprovalList,
} from "./lib/tools/approvals.js";
import {
	filterToolMapByPolicy,
	filterToolMetasByPolicy,
	mergeToolPolicies,
	parseToolPolicyVariants,
} from "./lib/tools/policy.js";
import {
	createToolRateLimiter,
	parseToolRateLimits,
} from "./lib/tools/rate-limit.js";
import {
	createToolRegistry,
	normalizeToolName,
	type ToolConflict,
	type ToolMeta,
} from "./lib/tools/registry.js";
import { createToolServiceClient } from "./lib/tools/tool-service.js";
import { omniUiCatalogPrompt } from "./lib/ui/catalog.js";
import { buildWorkspaceDefaults } from "./lib/workspace/defaults.js";
import {
	createWorkspaceManager,
	type WorkspaceManager,
} from "./lib/workspace/manager.js";
import { resolveWorkspaceId } from "./lib/workspace/paths.js";
import type { WorkspaceDefaults } from "./lib/workspace/types.js";
import {
	type ModelsFile,
	normalizeModelRef,
	selectModel,
} from "./models-core.js";
import { type RuntimeSkill, resolveToolRef } from "./skills-core.js";

const TRACKER_URL_RE = regex.as(
	"https?://(?:www\\.)?tracker\\.yandex\\.ru/(?<key>[A-Z][A-Z0-9]+-\\d+)\\b",
	"gi",
);
const JIRA_URL_RE = regex.as(
	"https?://\\S+/browse/(?<key>[A-Z][A-Z0-9]+-\\d+)\\b",
	"gi",
);
const FIGMA_URL_RE = regex.as("https?://\\S*figma\\.com/(file|design)/", "i");
const ISSUE_KEY_RE = regex("\\b[A-Z]{2,10}-\\d+\\b", "g");
const TRAILING_SLASH_RE = regex("/+$");

export type { BotEnv } from "./lib/config/env.js";

export type CreateBotOptions = {
	env: BotEnv;
	modelsConfig: ModelsFile;
	runtimeSkills?: RuntimeSkill[];
	getUptimeSeconds?: () => number;
	onDebugLog?: (line: string) => void;
	imageStore?: ImageStore;
	workspaceStore?: TextStore;
	uiStore?: TextStore;
	createUiUrl?: (id: string) => string;
	uiPublishUrl?: string;
	uiPublishToken?: string;
	workspaceDefaults?: WorkspaceDefaults;
	queueTurn?: (payload: QueueTurnPayload) => Promise<void>;
	onToolEvent?: (event: {
		toolName: string;
		toolCallId?: string;
		durationMs: number;
		error?: string;
		chatId?: string;
		chatType?: string;
		userId?: string;
		sessionKey?: string;
		turnDepth?: number;
	}) => Promise<void> | void;
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
	sessionClient?: {
		get: (params: { key: string }) => Promise<unknown>;
		patch: (params: {
			key: string;
			timeZone?: string | null;
		}) => Promise<unknown>;
	};
	chatStateStore?: ChatStateStore;
};

export async function createBot(options: CreateBotOptions) {
	const env = options.env;
	const envConfig = loadBotEnv(env);
	const {
		BOT_TOKEN,
		TRACKER_TOKEN,
		TRACKER_CLOUD_ORG_ID,
		TRACKER_ORG_ID,
		WIKI_TOKEN,
		WIKI_CLOUD_ORG_ID,
		FIGMA_TOKEN,
		JIRA_BASE_URL,
		JIRA_EMAIL,
		JIRA_API_TOKEN,
		JIRA_PROJECT_KEY,
		JIRA_BOARD_ID,
		POSTHOG_PERSONAL_API_KEY,
		POSTHOG_API_BASE_URL,
		OPENAI_API_KEY,
		GEMINI_API_KEY,
		OPENAI_MODEL,
		SOUL_PROMPT,
		PROJECT_CONTEXT,
		ALLOWED_TG_IDS,
		CRON_STATUS_TIMEZONE,
		DEFAULT_TRACKER_QUEUE,
		DEFAULT_ISSUE_PREFIX,
		DEBUG_LOGS,
		TRACKER_API_BASE_URL,
		HISTORY_MAX_MESSAGES,
		COMMENTS_CACHE_TTL_MS,
		COMMENTS_CACHE_MAX,
		COMMENTS_FETCH_CONCURRENCY,
		COMMENTS_FETCH_BUDGET_MS,
		TELEGRAM_TIMEOUT_SECONDS,
		TELEGRAM_TEXT_CHUNK_LIMIT,
		TELEGRAM_LINK_PREVIEW,
		TELEGRAM_ABORT_ON_NEW_MESSAGE,
		ALLOWED_TG_GROUPS,
		TELEGRAM_GROUP_REQUIRE_MENTION,
		IMAGE_MAX_BYTES,
		DOCUMENT_MAX_BYTES,
		ATTACHMENT_MAX_BYTES,
		GEMINI_IMAGE_SIZE,
		WEB_SEARCH_ENABLED,
		WEB_SEARCH_CONTEXT_SIZE,
		BROWSER_ENABLED,
		BROWSER_ALLOWLIST,
		FIRECRAWL_API_KEY,
		TOOL_RATE_LIMITS,
		TOOL_APPROVAL_REQUIRED,
		TOOL_APPROVAL_TTL_MS,
		TOOL_APPROVAL_STORE_PATH,
		TOOL_ALLOWLIST_USER_IDS,
		TOOL_DENYLIST_USER_IDS,
		TOOL_ALLOWLIST_USER_TOOLS,
		TOOL_DENYLIST_USER_TOOLS,
		TOOL_ALLOWLIST_CHAT_TOOLS,
		TOOL_DENYLIST_CHAT_TOOLS,
		TASKS_ENABLED,
		TASK_AUTO_URL_THRESHOLD,
		TASK_AUTO_MIN_CHARS,
		TASK_AUTO_KEYWORDS,
		TASK_PROGRESS_MIN_MS,
		UI_SCREENSHOT_ENABLED,
		TOOL_SERVICE_URL,
		TOOL_SERVICE_SECRET,
		TOOL_SERVICE_TIMEOUT_MS,
		ORCHESTRATION_ALLOW_AGENTS,
		ORCHESTRATION_DENY_AGENTS,
		ORCHESTRATION_SUBAGENT_MAX_STEPS,
		ORCHESTRATION_SUBAGENT_MAX_TOOL_CALLS,
		ORCHESTRATION_SUBAGENT_TIMEOUT_MS,
		ORCHESTRATION_PARALLELISM,
		AGENT_DEFAULT_MAX_STEPS,
		AGENT_DEFAULT_TIMEOUT_MS,
		AGENT_CONFIG_OVERRIDES,
		SUBAGENT_MODEL_PROVIDER,
		SUBAGENT_MODEL_ID,
		INBOUND_DEDUPE_TTL_MS,
		INBOUND_DEDUPE_MAX,
		SERVICE_NAME,
		RELEASE_VERSION,
		COMMIT_HASH,
		REGION,
		INSTANCE_ID,
		ADMIN_UI_BASE_URL,
	} = envConfig;

	const baseAdminUiUrl = ADMIN_UI_BASE_URL.trim();
	const realtimeCallUrl = baseAdminUiUrl
		? `${baseAdminUiUrl.replace(TRAILING_SLASH_RE, "")}/realtime`
		: "";

	const sessionClient = options.sessionClient;
	const taskClient = options.taskClient;
	const chatStateStore =
		options.chatStateStore ?? createInMemoryChatStateStore();
	const ATTACHMENT_MAX_COUNT = 3;
	const ATTACHMENT_CONSENT_TTL_MS = 10 * 60 * 1000;
	const toolPolicies = parseToolPolicyVariants(env);
	const toolPolicy = toolPolicies.base;
	const toolPolicyDm = toolPolicies.dm;
	const toolPolicyGroup = toolPolicies.group;
	const toolRateLimiter = createToolRateLimiter(
		parseToolRateLimits(TOOL_RATE_LIMITS),
	);
	const approvalRequired = new Set(parseApprovalList(TOOL_APPROVAL_REQUIRED));
	const approvalStore = createApprovalStore(
		Number.isFinite(TOOL_APPROVAL_TTL_MS) && TOOL_APPROVAL_TTL_MS > 0
			? TOOL_APPROVAL_TTL_MS
			: 10 * 60 * 1000,
		{ filePath: TOOL_APPROVAL_STORE_PATH },
	);
	const taskAutoKeywords = TASK_AUTO_KEYWORDS.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
	const senderToolAccess = parseSenderToolAccess({
		allowUserIds: TOOL_ALLOWLIST_USER_IDS,
		denyUserIds: TOOL_DENYLIST_USER_IDS,
		allowUserTools: TOOL_ALLOWLIST_USER_TOOLS,
		denyUserTools: TOOL_DENYLIST_USER_TOOLS,
		allowChatTools: TOOL_ALLOWLIST_CHAT_TOOLS,
		denyChatTools: TOOL_DENYLIST_CHAT_TOOLS,
	});

	const posthogToolkit = POSTHOG_PERSONAL_API_KEY
		? new PostHogAgentToolkit({
				posthogPersonalApiKey: POSTHOG_PERSONAL_API_KEY,
				posthogApiBaseUrl: POSTHOG_API_BASE_URL,
			})
		: null;
	let posthogToolsPromise: Promise<ToolSet> | null = null;
	const logger = createLogger({
		service: SERVICE_NAME,
		version: RELEASE_VERSION,
		commit_hash: COMMIT_HASH,
		region: REGION,
		instance_id: INSTANCE_ID,
	});
	const workspaceStore = options.workspaceStore;
	const workspaceDefaults =
		options.workspaceDefaults ??
		buildWorkspaceDefaults({
			soul: SOUL_PROMPT,
			projectContext: PROJECT_CONTEXT,
		});
	const workspaceManager: WorkspaceManager | null = workspaceStore
		? createWorkspaceManager({
				store: workspaceStore,
				defaults: workspaceDefaults,
				logger: (event) =>
					logger.info({
						event: event.event,
						workspace_id: event.workspaceId,
						key: event.key,
					}),
			})
		: null;
	const toolServiceClient =
		TOOL_SERVICE_URL && TOOL_SERVICE_SECRET
			? createToolServiceClient({
					url: TOOL_SERVICE_URL,
					secret: TOOL_SERVICE_SECRET,
					timeoutMs:
						Number.isFinite(TOOL_SERVICE_TIMEOUT_MS) &&
						TOOL_SERVICE_TIMEOUT_MS > 0
							? TOOL_SERVICE_TIMEOUT_MS
							: 20000,
					logger,
				})
			: null;
	if (!toolServiceClient) {
		logger.error({
			event: "tool_service_missing",
			reason: "TOOL_SERVICE_URL or TOOL_SERVICE_SECRET is empty",
		});
	}

	if (!BOT_TOKEN) throw new Error("BOT_TOKEN is unset");
	if (!TRACKER_TOKEN) throw new Error("TRACKER_TOKEN is unset");
	if (!TRACKER_CLOUD_ORG_ID && !TRACKER_ORG_ID) {
		throw new Error("TRACKER_CLOUD_ORG_ID or TRACKER_ORG_ID is unset");
	}
	if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is unset");
	if (!ALLOWED_TG_IDS.trim()) {
		throw new Error("ALLOWED_TG_IDS must be set for production use");
	}

	const bot = new Bot<BotContext>(BOT_TOKEN, {
		client: {
			timeoutSeconds: Number.isFinite(TELEGRAM_TIMEOUT_SECONDS)
				? TELEGRAM_TIMEOUT_SECONDS
				: 60,
		},
	});

	const modelsConfig = options.modelsConfig;
	let selectedModel: ReturnType<typeof selectModel>;
	try {
		selectedModel = selectModel(modelsConfig, OPENAI_MODEL);
	} catch (error) {
		console.warn(
			`[models] Unknown OPENAI_MODEL "${OPENAI_MODEL}", falling back to primary.`,
			error,
		);
		selectedModel = selectModel(modelsConfig, null);
	}
	let activeModelRef = selectedModel.ref;
	let activeModelConfig = selectedModel.config;
	let activeModelFallbacks = selectedModel.fallbacks;
	let activeReasoningOverride: string | null = null;
	function resolveReasoning(): string {
		return activeReasoningOverride ?? activeModelConfig.reasoning ?? "standard";
	}

	async function getPosthogTools(): Promise<ToolSet> {
		if (!posthogToolkit) return {};
		if (!posthogToolsPromise) {
			posthogToolsPromise = (async () => {
				const tools = (await posthogToolkit.getTools()) as unknown as ToolSet;
				return filterPosthogTools(tools);
			})();
		}
		return posthogToolsPromise;
	}

	const runtimeSkills = options.runtimeSkills ?? [];
	const cronClient = options.cronClient;

	const toolConflictLogger = (event: {
		event: "tool_conflict";
		name: string;
		normalizedName: string;
		source: string;
		origin?: string;
		existingSource: string;
		existingOrigin?: string;
		reason: "duplicate-name";
	}) => {
		logger.error(event);
	};

	const buildToolInventory = (): {
		agentTools: ToolMeta[];
		commandTools: ToolMeta[];
		allTools: ToolMeta[];
		conflicts: ToolConflict[];
		suppressedByPolicy: string[];
	} => {
		const registry = createToolRegistry({ logger: toolConflictLogger });
		const agentTools: ToolMeta[] = [];
		const commandTools: ToolMeta[] = [];

		const register = (tool: ToolMeta, target: ToolMeta[]) => {
			const res = registry.register(tool);
			if (!res.ok) return;
			target.push(tool);
		};

		register(
			{
				name: "yandex_tracker_search",
				description: `Search Yandex Tracker issues in queue ${DEFAULT_TRACKER_QUEUE} using keywords from the question.`,
				source: "tracker",
				origin: "core",
			},
			agentTools,
		);
		register(
			{
				name: "yandex_tracker_find_issue",
				description: "Find the best matching Yandex Tracker issues.",
				source: "tracker",
				origin: "core",
			},
			agentTools,
		);
		register(
			{
				name: "yandex_tracker_issue_summary",
				description: "Summarize a Yandex Tracker issue by key.",
				source: "tracker",
				origin: "core",
			},
			agentTools,
		);

		register(
			{
				name: "google_public_doc_read",
				description: "Read a public Google Doc by shared link.",
				source: "web",
				origin: "google-public",
			},
			agentTools,
		);
		register(
			{
				name: "google_public_sheet_read",
				description: "Read a public Google Sheet by shared link.",
				source: "web",
				origin: "google-public",
			},
			agentTools,
		);
		register(
			{
				name: "google_public_slides_read",
				description: "Read a public Google Slides deck by shared link.",
				source: "web",
				origin: "google-public",
			},
			agentTools,
		);

		register(
			{
				name: "ui_publish",
				description: "Generate and publish a UI preview link.",
				source: "core",
				origin: "ui",
				duration: "long",
				cost: "medium",
				async_ok: true,
			},
			agentTools,
		);

		if (workspaceManager) {
			register(
				{
					name: "memory_read",
					description: "Read a memory file (memory/YYYY-MM-DD.md).",
					source: "memory",
					origin: "workspace",
				},
				agentTools,
			);
			register(
				{
					name: "memory_append",
					description: "Append text to a memory file.",
					source: "memory",
					origin: "workspace",
				},
				agentTools,
			);
			register(
				{
					name: "memory_write",
					description: "Replace a memory file with new content.",
					source: "memory",
					origin: "workspace",
				},
				agentTools,
			);
			register(
				{
					name: "memory_search",
					description: "Search memory files for a query string.",
					source: "memory",
					origin: "workspace",
				},
				agentTools,
			);
			register(
				{
					name: "session_history",
					description: "Read recent conversation history.",
					source: "core",
					origin: "session",
				},
				agentTools,
			);
		}

		if (FIGMA_TOKEN) {
			register(
				{
					name: "figma_me",
					description: "Get current Figma user profile.",
					source: "figma",
					origin: "figma",
				},
				agentTools,
			);
			register(
				{
					name: "figma_file_get",
					description: "Get Figma file metadata and document tree.",
					source: "figma",
					origin: "figma",
				},
				agentTools,
			);
			register(
				{
					name: "figma_file_nodes_get",
					description: "Get specific nodes from a Figma file.",
					source: "figma",
					origin: "figma",
				},
				agentTools,
			);
			register(
				{
					name: "figma_file_comments_list",
					description: "List comments for a Figma file.",
					source: "figma",
					origin: "figma",
				},
				agentTools,
			);
			register(
				{
					name: "figma_project_files_list",
					description: "List files in a Figma project.",
					source: "figma",
					origin: "figma",
				},
				agentTools,
			);
		}

		if (WIKI_TOKEN) {
			register(
				{
					name: "yandex_wiki_find_page",
					description: "Resolve a Yandex Wiki page by URL, slug, or id.",
					source: "wiki",
					origin: "yandex-wiki",
				},
				agentTools,
			);
			register(
				{
					name: "yandex_wiki_read_page",
					description: "Read a Yandex Wiki page by URL, slug, or id.",
					source: "wiki",
					origin: "yandex-wiki",
				},
				agentTools,
			);
			register(
				{
					name: "yandex_wiki_update_page",
					description: "Update a Yandex Wiki page by id.",
					source: "wiki",
					origin: "yandex-wiki",
				},
				agentTools,
			);
			register(
				{
					name: "yandex_wiki_append_page",
					description: "Append content to a Yandex Wiki page by id.",
					source: "wiki",
					origin: "yandex-wiki",
				},
				agentTools,
			);
			register(
				{
					name: "wiki_page_get",
					description: "Get Yandex Wiki page details by slug.",
					source: "wiki",
					origin: "yandex-wiki",
				},
				agentTools,
			);
			register(
				{
					name: "wiki_page_get_by_id",
					description: "Get Yandex Wiki page details by id.",
					source: "wiki",
					origin: "yandex-wiki",
				},
				agentTools,
			);
			register(
				{
					name: "wiki_page_create",
					description: "Create a new Yandex Wiki page.",
					source: "wiki",
					origin: "yandex-wiki",
				},
				agentTools,
			);
			register(
				{
					name: "wiki_page_update",
					description: "Update an existing Yandex Wiki page.",
					source: "wiki",
					origin: "yandex-wiki",
				},
				agentTools,
			);
			register(
				{
					name: "wiki_page_append_content",
					description: "Append content to an existing Yandex Wiki page.",
					source: "wiki",
					origin: "yandex-wiki",
				},
				agentTools,
			);
		}

		if (options.cronClient) {
			register(
				{
					name: "cron_schedule",
					description:
						"Schedule a recurring report or reminder and deliver it to the current chat.",
					source: "cron",
					origin: "core",
				},
				agentTools,
			);
			register(
				{
					name: "cron_list",
					description: "List scheduled cron jobs.",
					source: "cron",
					origin: "core",
				},
				agentTools,
			);
			register(
				{
					name: "cron_remove",
					description: "Remove a scheduled cron job by id or name.",
					source: "cron",
					origin: "core",
				},
				agentTools,
			);
		}

		if (WEB_SEARCH_ENABLED) {
			register(
				{
					name: "web_search",
					description:
						"Search the web for up-to-date information (OpenAI web_search).",
					source: "web",
					origin: "openai",
				},
				agentTools,
			);
		}

		if (GEMINI_API_KEY) {
			register(
				{
					name: "gemini_image_generate",
					description:
						"Generate images with Gemini 3 Pro Image Preview (Google).",
					source: "core",
					origin: "gemini",
				},
				agentTools,
			);
		}

		if (JIRA_BASE_URL && JIRA_EMAIL && JIRA_API_TOKEN) {
			register(
				{
					name: "jira_search",
					description: `Search Jira issues in project ${JIRA_PROJECT_KEY} using keywords from the question.`,
					source: "tracker",
					origin: "jira",
				},
				agentTools,
			);
			register(
				{
					name: "jira_sprint_issues",
					description: "List Jira issues for a sprint by name or id.",
					source: "tracker",
					origin: "jira",
				},
				agentTools,
			);
			register(
				{
					name: "jira_issues_find",
					description: "Search Jira issues using JQL.",
					source: "command",
					origin: "jira",
				},
				commandTools,
			);
			register(
				{
					name: "jira_issue_get",
					description: "Get Jira issue by key (e.g., FL-123).",
					source: "command",
					origin: "jira",
				},
				commandTools,
			);
			register(
				{
					name: "jira_issue_get_comments",
					description: "Get comments for a Jira issue by key.",
					source: "command",
					origin: "jira",
				},
				commandTools,
			);
		}

		if (POSTHOG_PERSONAL_API_KEY) {
			for (const name of POSTHOG_READONLY_TOOL_NAMES) {
				register(
					{
						name,
						description: "PostHog read-only tool",
						source: "posthog",
						origin: "posthog",
					},
					agentTools,
				);
			}
		}

		// memory tools are registered in agentTools only (shared list via registry)
		register(
			{
				name: "subagent_orchestrate",
				description: "Route and run multiple subagents in parallel.",
				source: "core",
				origin: "orchestration",
			},
			agentTools,
		);
		register(
			{
				name: "subagent_route",
				description: "Recommend which subagent should run for a request.",
				source: "core",
				origin: "orchestration",
			},
			agentTools,
		);
		register(
			{
				name: "subagent_tracker",
				description: "Delegate a task to the tracker subagent.",
				source: "core",
				origin: "orchestration",
			},
			agentTools,
		);
		register(
			{
				name: "subagent_jira",
				description: "Delegate a task to the Jira subagent.",
				source: "core",
				origin: "orchestration",
			},
			agentTools,
		);
		register(
			{
				name: "subagent_posthog",
				description: "Delegate a task to the PostHog subagent.",
				source: "core",
				origin: "orchestration",
			},
			agentTools,
		);
		register(
			{
				name: "subagent_web",
				description: "Delegate a task to the web research subagent.",
				source: "core",
				origin: "orchestration",
			},
			agentTools,
		);
		register(
			{
				name: "subagent_memory",
				description: "Delegate a task to the memory subagent.",
				source: "core",
				origin: "orchestration",
			},
			agentTools,
		);

		register(
			{
				name: "issues_find",
				description: "Search issues using Yandex Tracker query language.",
				source: "command",
				origin: "tracker",
			},
			commandTools,
		);
		register(
			{
				name: "issue_get",
				description: "Get issue by key (e.g., PROJ-123).",
				source: "command",
				origin: "tracker",
			},
			commandTools,
		);
		register(
			{
				name: "issue_get_comments",
				description: "Get comments for an issue by key.",
				source: "command",
				origin: "tracker",
			},
			commandTools,
		);
		register(
			{
				name: "issue_get_url",
				description: "Build public issue URL.",
				source: "command",
				origin: "tracker",
			},
			commandTools,
		);

		const allTools = registry.list();
		const allowed = filterToolMetasByPolicy(allTools, toolPolicy);
		const allowedSet = new Set(
			allowed.map((tool) => normalizeToolName(tool.name)),
		);
		const suppressedByPolicy = allTools
			.filter((tool) => !allowedSet.has(normalizeToolName(tool.name)))
			.map((tool) => tool.name);

		return {
			agentTools: agentTools.filter((tool) =>
				allowedSet.has(normalizeToolName(tool.name)),
			),
			commandTools: commandTools.filter((tool) =>
				allowedSet.has(normalizeToolName(tool.name)),
			),
			allTools: allTools.filter((tool) =>
				allowedSet.has(normalizeToolName(tool.name)),
			),
			conflicts: registry.conflicts(),
			suppressedByPolicy,
		};
	};

	const toolInventory = buildToolInventory();
	const AGENT_TOOL_LIST = toolInventory.allTools;
	const ALL_TOOL_LIST = toolInventory.allTools;
	const TOOL_CONFLICTS = toolInventory.conflicts;
	const TOOL_SUPPRESSED_BY_POLICY = toolInventory.suppressedByPolicy;

	const { getLogContext, setLogContext, setLogError, getUpdateType, logDebug } =
		createLogHelpers({
			debugEnabled: DEBUG_LOGS,
			logger,
			onDebugLog: options.onDebugLog,
		});
	const { sendText, appendSources, createTextStream, retryTelegramCall } =
		createTelegramHelpers({
			textChunkLimit: TELEGRAM_TEXT_CHUNK_LIMIT,
			logDebug,
			linkPreviewEnabled: TELEGRAM_LINK_PREVIEW,
		});
	const inboundDedupe = createInboundDedupe({
		ttlMs: INBOUND_DEDUPE_TTL_MS,
		maxPerChat: INBOUND_DEDUPE_MAX,
	});
	const inFlightByChat = new Map<string, AbortController>();

	const shouldSkipInbound = (ctx: BotContext) => {
		if (ctx.state.systemEvent) return false;
		const chatId = ctx.chat?.id?.toString() ?? "";
		const messageId = ctx.message?.message_id;
		if (!chatId || typeof messageId !== "number") return false;
		return inboundDedupe.shouldSkip(chatId, messageId);
	};

	const abortInFlight = (chatId: string, reason: string) => {
		const current = inFlightByChat.get(chatId);
		if (!current) return false;
		current.abort(new Error(reason));
		return true;
	};

	const registerInFlight = (chatId: string, controller: AbortController) => {
		inFlightByChat.set(chatId, controller);
	};

	const clearInFlight = (chatId: string, controller: AbortController) => {
		const current = inFlightByChat.get(chatId);
		if (current === controller) {
			inFlightByChat.delete(chatId);
		}
	};

	const trackerClient = createTrackerClient({
		token: TRACKER_TOKEN ?? "",
		cloudOrgId: TRACKER_CLOUD_ORG_ID,
		orgId: TRACKER_ORG_ID,
		apiBaseUrl: TRACKER_API_BASE_URL,
		commentsCacheTtlMs: COMMENTS_CACHE_TTL_MS,
		commentsCacheMax: COMMENTS_CACHE_MAX,
		commentsFetchConcurrency: COMMENTS_FETCH_CONCURRENCY,
		logger,
		getLogContext,
		setLogContext,
		logDebug,
	});
	const {
		trackerCallTool,
		trackerHealthCheck,
		getLastTrackerCallAt,
		downloadAttachment,
	} = trackerClient;

	const wikiClient = createWikiClient({
		token: WIKI_TOKEN ?? "",
		apiBaseUrl: "https://api.wiki.yandex.net",
		cloudOrgId: WIKI_CLOUD_ORG_ID,
		logDebug,
	});
	const wikiEnabled = Boolean(WIKI_TOKEN);

	const figmaClient = createFigmaClient({
		token: FIGMA_TOKEN ?? "",
		apiBaseUrl: "https://api.figma.com",
		logDebug,
	});
	const figmaEnabled = Boolean(FIGMA_TOKEN);

	const jiraClient = createJiraClient({
		baseUrl: JIRA_BASE_URL,
		email: JIRA_EMAIL,
		apiToken: JIRA_API_TOKEN,
		commentsCacheTtlMs: COMMENTS_CACHE_TTL_MS,
		commentsCacheMax: COMMENTS_CACHE_MAX,
		commentsFetchConcurrency: COMMENTS_FETCH_CONCURRENCY,
		logDebug,
	});
	const { jiraIssueGet, jiraIssueGetComments } = jiraClient;
	const jiraEnabled = Boolean(JIRA_BASE_URL && JIRA_EMAIL && JIRA_API_TOKEN);

	bot.api.config.use(apiThrottler());
	bot.use(
		sequentialize((ctx) => {
			if (ctx.chat?.id) return `telegram:${ctx.chat.id}`;
			if (ctx.from?.id) return `telegram:user:${ctx.from.id}`;
			return "telegram:unknown";
		}),
	);

	bot.use(
		createRequestLoggerMiddleware({
			logger,
			getLogContext,
			setLogContext,
			setLogError,
			getUpdateType,
		}),
	);

	const allowedIds = new Set(
		ALLOWED_TG_IDS.split(",")
			.map((value: string) => value.trim())
			.filter((value: string) => value.length > 0),
	);
	const allowedGroups = new Set(
		ALLOWED_TG_GROUPS.split(",")
			.map((value: string) => value.trim())
			.filter((value: string) => value.length > 0),
	);
	const {
		isGroupAllowed,
		isReplyToBotWithoutMention,
		isBotMentioned,
		shouldReplyAccessDenied,
	} = createAccessHelpers({ allowedGroups });

	bot.use((ctx, next) => {
		const raw = (ctx.update as { __channelConfig?: unknown }).__channelConfig;
		ctx.state.channelConfig = parseChannelConfig(raw);
		return next();
	});

	bot.use((ctx, next) => {
		const sys = (ctx.update as { __systemEvent?: unknown }).__systemEvent;
		if (sys === true) {
			ctx.state.systemEvent = true;
		}
		const depth = (ctx.update as { __turnDepth?: unknown }).__turnDepth;
		if (typeof depth === "number") {
			ctx.state.turnDepth = depth;
		}
		const taskId = (ctx.update as { __taskId?: unknown }).__taskId;
		if (typeof taskId === "string" && taskId.trim()) {
			ctx.state.taskId = taskId.trim();
		}
		return next();
	});

	bot.use((ctx, next) => {
		if (ctx.state.systemEvent) return next();
		const channelAllowlist = ctx.state.channelConfig?.allowUserIds ?? [];
		if (allowedIds.size === 0 && channelAllowlist.length === 0) return next();
		const userId = ctx.from?.id?.toString() ?? "";
		const allowed = isUserAllowedForChannel({
			userId,
			globalAllowlist: allowedIds,
			channelAllowlist,
		});
		if (!allowed) {
			setLogContext(ctx, {
				outcome: "blocked",
				status_code: 403,
			});
			if (shouldReplyAccessDenied(ctx)) {
				return sendText(ctx, "Доступ запрещен.");
			}
			return;
		}
		return next();
	});

	function resolveReasoningFor(config: typeof activeModelConfig): string {
		return activeReasoningOverride ?? config.reasoning ?? "standard";
	}

	function normalizeSubagentProvider(
		raw?: string,
	): "openai" | "google" | undefined {
		const value = raw?.trim().toLowerCase();
		if (!value) return undefined;
		if (value === "google" || value === "gemini") return "google";
		if (value === "openai") return "openai";
		return undefined;
	}

	const subagentProvider = normalizeSubagentProvider(SUBAGENT_MODEL_PROVIDER);
	const subagentModelId = SUBAGENT_MODEL_ID?.trim() || undefined;
	const googleModelFactory = GEMINI_API_KEY
		? createGoogleGenerativeAI({ apiKey: GEMINI_API_KEY })
		: null;

	const getSubagentModel = (provider: "openai" | "google", modelId: string) => {
		if (provider === "google") {
			if (!googleModelFactory) {
				throw new Error("gemini_api_key_missing");
			}
			return googleModelFactory(modelId);
		}
		return openai(modelId);
	};

	function resolveChatToolPolicy(ctx?: BotContext) {
		if (!ctx) return undefined;
		const chatPolicy = isGroupChat(ctx) ? toolPolicyGroup : toolPolicyDm;
		let merged = mergeToolPolicies(toolPolicy, chatPolicy);
		if (isGroupChat(ctx)) {
			merged = mergeToolPolicies(merged, {
				deny: ["group:web", "group:memory"],
			});
		}
		return merged;
	}

	function startTypingHeartbeat(
		ctx: BotContext,
		options: { intervalMs?: number } = {},
	) {
		const intervalMs = options.intervalMs ?? 4500;
		let stopped = false;
		const tick = async () => {
			if (stopped) return;
			try {
				await ctx.replyWithChatAction("typing");
			} catch {
				// Ignore typing failures to avoid interrupting the run.
			}
		};
		void tick();
		const timer = setInterval(() => {
			void tick();
		}, intervalMs);
		return () => {
			stopped = true;
			clearInterval(timer);
		};
	}

	function scheduleDelayedStatus(
		send: (message: string) => Promise<void> | void,
		message: string,
		delayMs: number,
	) {
		const timer = setTimeout(() => {
			void send(message);
		}, delayMs);
		return () => {
			clearTimeout(timer);
		};
	}
	const { resolveOrchestrationPolicy, buildOrchestrationSummary } =
		createOrchestrationHelpers({
			allowAgentsRaw: ORCHESTRATION_ALLOW_AGENTS,
			denyAgentsRaw: ORCHESTRATION_DENY_AGENTS,
			subagentMaxSteps: ORCHESTRATION_SUBAGENT_MAX_STEPS,
			subagentMaxToolCalls: ORCHESTRATION_SUBAGENT_MAX_TOOL_CALLS,
			subagentTimeoutMs: ORCHESTRATION_SUBAGENT_TIMEOUT_MS,
			parallelism: ORCHESTRATION_PARALLELISM,
			agentConfigOverrides: AGENT_CONFIG_OVERRIDES,
			agentDefaultMaxSteps: AGENT_DEFAULT_MAX_STEPS,
			agentDefaultTimeoutMs: AGENT_DEFAULT_TIMEOUT_MS,
			logger,
			isGroupChat,
			getActiveModelId: () => activeModelConfig.id,
		});

	function getModelConfig(ref: string) {
		return modelsConfig.models[ref];
	}

	function formatToolResult(result: TrackerToolResult): string {
		if (typeof result === "string") return result;
		if (result === null || result === undefined) return "";
		try {
			return JSON.stringify(result, null, 2);
		} catch {
			return String(result);
		}
	}

	function buildTelegramSessionKey(ctx: BotContext) {
		const chatId = ctx.chat?.id?.toString() ?? "";
		return chatId ? `telegram:${chatId}` : "";
	}

	async function getChatTimezoneOverride(ctx: BotContext) {
		if (!sessionClient) return undefined;
		const key = buildTelegramSessionKey(ctx);
		if (!key) return undefined;
		const payload = (await sessionClient.get({ key })) as {
			entry?: { timeZone?: string };
		};
		const tz = payload?.entry?.timeZone?.trim() ?? "";
		return tz || undefined;
	}

	async function resolveChatTimezone(ctx?: BotContext, chatId?: string) {
		if (!ctx && !chatId) return CRON_STATUS_TIMEZONE;
		if (!sessionClient) return CRON_STATUS_TIMEZONE;
		const key =
			ctx?.chat?.id != null
				? `telegram:${ctx.chat.id}`
				: chatId
					? `telegram:${chatId}`
					: "";
		if (!key) return CRON_STATUS_TIMEZONE;
		const payload = (await sessionClient.get({ key })) as {
			entry?: { timeZone?: string };
		};
		const tz = payload?.entry?.timeZone?.trim() ?? "";
		return tz || CRON_STATUS_TIMEZONE;
	}

	async function setChatTimezone(ctx: BotContext, timeZone: string | null) {
		if (!sessionClient) return false;
		const key = buildTelegramSessionKey(ctx);
		if (!key) return false;
		await sessionClient.patch({ key, timeZone });
		return true;
	}

	async function getAgentTools() {
		return AGENT_TOOL_LIST;
	}

	async function getCommandTools() {
		return ALL_TOOL_LIST;
	}
	const createAgentTools = createAgentToolsFactory({
		toolConflictLogger,
		toolPolicy,
		resolveChatToolPolicy,
		toolRateLimiter,
		approvalRequired,
		approvalStore,
		senderToolAccess,
		logger,
		logDebug,
		debugLogs: DEBUG_LOGS,
		webSearchEnabled: WEB_SEARCH_ENABLED,
		webSearchContextSize: WEB_SEARCH_CONTEXT_SIZE,
		firecrawlEnabled: Boolean(FIRECRAWL_API_KEY),
		browserEnabled: BROWSER_ENABLED,
		browserAllowlist: BROWSER_ALLOWLIST.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
		browserSendFile: sendBrowserScreenshot,
		sendGeneratedFile,
		uiStore: options.uiStore,
		createUiUrl: options.createUiUrl,
		uiPublishUrl: options.uiPublishUrl,
		uiPublishToken: options.uiPublishToken,
		uiScreenshotEnabled: UI_SCREENSHOT_ENABLED,
		defaultTrackerQueue: DEFAULT_TRACKER_QUEUE,
		cronStatusTimezone: CRON_STATUS_TIMEZONE,
		resolveChatTimezone,
		jiraProjectKey: JIRA_PROJECT_KEY,
		jiraBoardId: JIRA_BOARD_ID,
		jiraEnabled,
		wikiEnabled,
		figmaEnabled,
		posthogPersonalApiKey: POSTHOG_PERSONAL_API_KEY,
		getPosthogTools,
		geminiApiKey: GEMINI_API_KEY ?? "",
		cronClient,
		toolServiceClient: toolServiceClient ?? undefined,
		trackerClient,
		wikiClient,
		figmaClient,
		jiraClient,
		logJiraAudit,
		workspaceManager: workspaceManager ?? undefined,
		sessionStore: workspaceStore ?? undefined,
		commentsFetchBudgetMs: COMMENTS_FETCH_BUDGET_MS,
		imageStore: options.imageStore,
		geminiImageSize:
			GEMINI_IMAGE_SIZE === "2K" || GEMINI_IMAGE_SIZE === "4K"
				? GEMINI_IMAGE_SIZE
				: "1K",
	});

	function buildSubagentToolsForAgent(params: {
		baseTools: ToolSet;
		ctx?: BotContext;
		modelId: string;
		modelRef: string;
		modelName: string;
		reasoning: string;
		globalSoul?: string;
	}): ToolSet {
		const policy = resolveOrchestrationPolicy(params.ctx);
		const allowed = policy.allowAgents ? new Set(policy.allowAgents) : null;
		const denied = new Set<OrchestrationAgentId>(policy.denyAgents ?? []);
		const isGroup = params.ctx ? isGroupChat(params.ctx) : false;
		const shouldInclude = (agentId: OrchestrationAgentId) => {
			if (denied.has(agentId)) return false;
			if (allowed && !allowed.has(agentId)) return false;
			return true;
		};
		const toolsByAgent: Record<OrchestrationAgentId, ToolSet> = {
			tracker: buildTrackerTools(params.baseTools),
			jira: buildJiraTools(params.baseTools),
			posthog: buildPosthogTools(params.baseTools),
			web: buildWebTools(params.baseTools),
			memory: buildMemorySubagentTools(params.baseTools),
		};
		const filtered: Record<OrchestrationAgentId, ToolSet> = {
			tracker: {},
			jira: {},
			posthog: {},
			web: {},
			memory: {},
		};
		for (const [agentId, agentTools] of Object.entries(toolsByAgent) as Array<
			[OrchestrationAgentId, ToolSet]
		>) {
			if (!shouldInclude(agentId)) continue;
			if (Object.keys(agentTools).length === 0) continue;
			filtered[agentId] = agentTools;
		}
		const orchestrationTool = tool({
			description:
				"Route and run relevant subagents in parallel to answer a context-heavy request.",
			inputSchema: z.object({
				prompt: z.string().min(1).describe("User request to route and answer"),
			}),
			execute: async ({ prompt }) => {
				const plan = await routeRequest(prompt, params.modelId, isGroup);
				const result = await runOrchestration(plan, {
					prompt,
					modelId: params.modelId,
					toolsByAgent: filtered,
					isGroupChat: isGroup,
					log: (event) => logger.info(event),
					promptMode: "minimal",
					promptContext: {
						modelRef: params.modelRef,
						modelName: params.modelName,
						reasoning: params.reasoning,
						globalSoul: params.globalSoul,
					},
					getModel: getSubagentModel,
					defaultSubagentModelProvider: subagentProvider,
					defaultSubagentModelId: subagentModelId,
					allowAgents: policy.allowAgents,
					denyAgents: policy.denyAgents,
					parallelism: policy.parallelism,
					agentOverrides: policy.agentOverrides,
					defaultMaxSteps: policy.defaultMaxSteps,
					defaultTimeoutMs: policy.defaultTimeoutMs,
					budgets: policy.budgets,
					hooks: policy.hooks,
				});
				return buildOrchestrationSummary(result);
			},
		});
		const subagentTools = buildSubagentToolset({
			toolsByAgent: filtered,
			modelId: params.modelId,
			promptContext: {
				modelRef: params.modelRef,
				modelName: params.modelName,
				reasoning: params.reasoning,
				globalSoul: params.globalSoul,
			},
			getModel: getSubagentModel,
			defaultSubagentModelProvider: subagentProvider,
			defaultSubagentModelId: subagentModelId,
			budgets: policy.budgets,
			agentOverrides: policy.agentOverrides,
			defaultMaxSteps: policy.defaultMaxSteps,
			defaultTimeoutMs: policy.defaultTimeoutMs,
			hooks: policy.hooks,
		});
		const mergedSubagentTools = {
			...subagentTools,
			subagent_orchestrate: orchestrationTool,
		};
		const mergedPolicy = mergeToolPolicies(
			toolPolicy,
			resolveChatToolPolicy(params.ctx),
		);
		return filterToolMapByPolicy(mergedSubagentTools, mergedPolicy)
			.tools as ToolSet;
	}

	const createAgent = createAgentFactory({
		getAgentTools,
		createAgentTools,
		buildSubagentTools: buildSubagentToolsForAgent,
		resolveReasoningFor,
		logDebug,
		debugLogs: DEBUG_LOGS,
		webSearchEnabled: WEB_SEARCH_ENABLED,
		soulPrompt: SOUL_PROMPT,
		projectContext: PROJECT_CONTEXT,
		runtimeSkills,
		filterSkillsForChannel,
		resolveChatTimezone,
		serviceName: SERVICE_NAME,
		releaseVersion: RELEASE_VERSION,
		region: REGION,
		instanceId: INSTANCE_ID,
	});

	function isSprintQuery(text: string) {
		const lower = text.toLowerCase();
		return (
			lower.includes("sprint") ||
			lower.includes("спринт") ||
			lower.includes("board") ||
			lower.includes("доска") ||
			lower.includes("backlog")
		);
	}

	function extractExplicitIssueKeys(text: string): string[] {
		const matches = Array.from(text.matchAll(ISSUE_KEY_RE)).map((match) =>
			match[0].toUpperCase(),
		);
		const unique = new Set(matches);
		return Array.from(unique);
	}

	function extractTrackerIssueKeysFromUrls(text: string): string[] {
		const matches = Array.from(text.matchAll(TRACKER_URL_RE))
			.map((match) => match.groups?.key ?? match[1])
			.filter((value): value is string => Boolean(value))
			.map((value) => value.toUpperCase());
		return Array.from(new Set(matches));
	}

	async function buildConversationContext(params: {
		ctx: BotContext;
		chatId: string;
		workspaceId?: string;
		sessionKey?: string;
	}) {
		const workspaceId = params.workspaceId ?? resolveWorkspaceId(params.chatId);
		const sessionKey =
			params.sessionKey ??
			buildSessionKey({
				channel: "telegram",
				chatType: params.ctx.chat?.type ?? "private",
				chatId: params.chatId,
			});
		const workspaceSnapshot = workspaceManager
			? await workspaceManager.loadSnapshot(workspaceId)
			: undefined;
		const historyMessages =
			workspaceStore && Number.isFinite(HISTORY_MAX_MESSAGES)
				? await loadHistoryMessages(
						workspaceStore,
						workspaceId,
						sessionKey,
						HISTORY_MAX_MESSAGES,
					)
				: [];
		const historyText = historyMessages.length
			? formatHistoryForPrompt(historyMessages)
			: "";
		return {
			workspaceId,
			sessionKey,
			workspaceSnapshot,
			historyText,
		};
	}

	function extractJiraIssueKeysFromUrls(text: string): string[] {
		const matches = Array.from(text.matchAll(JIRA_URL_RE))
			.map((match) => match.groups?.key ?? match[1])
			.filter((value): value is string => Boolean(value))
			.map((value) => value.toUpperCase());
		return Array.from(new Set(matches));
	}

	function hasFigmaUrl(text: string): boolean {
		return FIGMA_URL_RE.test(text);
	}

	function isJiraIssueKey(key: string) {
		return key.startsWith(`${JIRA_PROJECT_KEY}-`);
	}

	function setActiveModel(refOverride: string) {
		const selected = selectModel(modelsConfig, refOverride);
		activeModelRef = selected.ref;
		activeModelConfig = selected.config;
		activeModelFallbacks = selected.fallbacks;
	}

	function normalizeReasoning(input: string): string | null {
		const value = input.trim().toLowerCase();
		if (!value) return null;
		if (["off", "low", "standard", "high"].includes(value)) return value;
		return null;
	}

	function logJiraAudit(
		ctx: BotContext | undefined,
		toolName: string,
		args: Record<string, unknown>,
		outcome: "success" | "error",
		error?: string,
		durationMs?: number,
	) {
		const context = ctx ? getLogContext(ctx) : {};
		const issueKey =
			typeof args.issueKey === "string" ? args.issueKey : undefined;
		const jql = typeof args.jql === "string" ? args.jql : undefined;
		const payload = {
			event: "jira_tool",
			outcome,
			tool: toolName,
			issue_key: issueKey,
			jql_len: jql ? jql.length : undefined,
			request_id: context.request_id,
			chat_id: context.chat_id,
			user_id: context.user_id,
			username: context.username,
			duration_ms: durationMs,
			error,
		};
		const level = outcome === "error" ? "error" : "info";
		logger[level](payload);
	}

	function withTimeout<T>(
		promise: Promise<T>,
		ms: number,
		label: string,
	): Promise<T> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error(`Timeout after ${ms}ms: ${label}`)),
				ms,
			);
			promise
				.then((value) => {
					clearTimeout(timer);
					resolve(value);
				})
				.catch((error) => {
					clearTimeout(timer);
					reject(error);
				});
		});
	}

	function formatUptime(seconds: number): string {
		const total = Math.floor(seconds);
		const days = Math.floor(total / 86400);
		const hours = Math.floor((total % 86400) / 3600);
		const mins = Math.floor((total % 3600) / 60);
		const secs = total % 60;
		if (days > 0) return `${days}d ${hours}h ${mins}m ${secs}s`;
		if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
		if (mins > 0) return `${mins}m ${secs}s`;
		return `${secs}s`;
	}

	const startKeyboard = new InlineKeyboard()
		.text("Помощь", "cmd:help")
		.text("Команды", "cmd:commands")
		.text("Статус", "cmd:status");

	const RESEARCH_READY_RE = /^(готово|поехали|начинай|старт|run|go)$/i;
	const RESEARCH_CANCEL_RE = /^(отмена|стоп|cancel|stop)$/i;

	const START_GREETING =
		"Привет!\n\n" +
		"Я Omni, персональный ассистент.\n" +
		"Помогу с задачами, аналитикой, могу искать в интернете.\n" +
		"Понимаю текст, голос, ссылки, изображения и файлы.\n" +
		"Если есть номер задачи — укажите его, например PROJ-1234.\n\n";

	const clearHistoryForContext = async (ctx: BotContext) => {
		if (!workspaceStore) return;
		const chatId = ctx.chat?.id?.toString() ?? "";
		if (!chatId) return;
		const workspaceId = resolveWorkspaceId(chatId);
		const sessionKey = buildSessionKey({
			channel: "telegram",
			chatType: ctx.chat?.type ?? "private",
			chatId,
		});
		await clearSessionHistory(workspaceStore, workspaceId, sessionKey);
	};

	registerCommands({
		bot,
		startGreeting: START_GREETING,
		startKeyboard,
		sendText,
		logDebug,
		clearHistoryMessages: clearHistoryForContext,
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
		getActiveModelRef: () => activeModelRef,
		getActiveModelFallbacks: () => activeModelFallbacks,
		resolveReasoning,
		setActiveModel,
		setActiveReasoningOverride: (value) => {
			activeReasoningOverride = value;
		},
		normalizeModelRef,
		normalizeReasoning,
		modelsConfig,
		isGroupChat,
		shouldRequireMentionForChannel,
		isReplyToBotWithoutMention,
		isBotMentioned,
		TELEGRAM_GROUP_REQUIRE_MENTION,
		taskClient,
		queueTurn: options.queueTurn,
		tasksEnabled: TASKS_ENABLED,
		withTimeout,
		trackerHealthCheck,
		formatUptime,
		getUptimeSeconds: options.getUptimeSeconds,
		getLastTrackerCallAt,
		jiraEnabled,
		figmaEnabled,
		wikiEnabled,
		posthogEnabled: Boolean(POSTHOG_PERSONAL_API_KEY),
		webSearchEnabled: WEB_SEARCH_ENABLED,
		memoryEnabled: Boolean(workspaceStore),
		realtimeCallUrl,
		chatStateStore,
		cronClient: options.cronClient,
		defaultCronTimezone: CRON_STATUS_TIMEZONE,
		getChatTimezoneOverride,
		setChatTimezone,
	});

	async function loadTelegramImageParts(
		ctx: BotContext,
	): Promise<ImageFilePart[]> {
		const photo = ctx.message?.photo?.at(-1);
		if (!photo?.file_id) return [];
		const file = await ctx.api.getFile(photo.file_id);
		if (!file.file_path) return [];
		const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
		const response = await fetch(downloadUrl);
		if (!response.ok) {
			throw new Error(`image_download_failed:${response.status}`);
		}
		const buffer = new Uint8Array(await response.arrayBuffer());
		if (buffer.byteLength > IMAGE_MAX_BYTES) {
			throw new Error(`image_too_large:${buffer.byteLength}`);
		}
		const [imagePart] = [
			toImageFilePart({
				buffer,
				contentType: response.headers.get("content-type"),
				filePath: file.file_path,
			}),
		];
		return imagePart ? [imagePart] : [];
	}

	async function loadTelegramDocumentPayload(ctx: BotContext): Promise<{
		files: FilePart[];
		extraContextParts: string[];
		skipped: Array<{ filename: string; reason: string }>;
		supported: boolean;
	}> {
		const document = ctx.message?.document;
		if (!document?.file_id) {
			return {
				files: [],
				extraContextParts: [],
				skipped: [],
				supported: false,
			};
		}
		const fileName = document.file_name;
		const isPdf = isPdfDocument({
			mimeType: document.mime_type,
			fileName,
		});
		const isDocx = isDocxDocument({
			mimeType: document.mime_type,
			fileName,
		});
		if (!isPdf && !isDocx) {
			return {
				files: [],
				extraContextParts: [],
				skipped: [],
				supported: false,
			};
		}
		const file = await ctx.api.getFile(document.file_id);
		if (!file.file_path) {
			return {
				files: [],
				extraContextParts: [],
				skipped: [],
				supported: false,
			};
		}
		const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
		const response = await fetch(downloadUrl);
		if (!response.ok) {
			throw new Error(`document_download_failed:${response.status}`);
		}
		const buffer = new Uint8Array(await response.arrayBuffer());
		if (buffer.byteLength > DOCUMENT_MAX_BYTES) {
			throw new Error(`document_too_large:${buffer.byteLength}`);
		}
		const filename =
			fileName ?? file.file_path.split("/").pop() ?? "document.pdf";
		if (isDocx) {
			const skipped: Array<{ filename: string; reason: string }> = [];
			let text = "";
			try {
				text = await convertDocxToText(buffer);
			} catch (error) {
				skipped.push({
					filename,
					reason: `extract_failed:${String(error)}`,
				});
			}
			const truncated = text ? truncateText(text, 8000) : "";
			return {
				files: [],
				extraContextParts: truncated
					? [`DOCX (${filename}):\n${truncated}`]
					: [],
				skipped,
				supported: true,
			};
		}
		return {
			files: [
				toFilePart({
					buffer,
					mediaType: "application/pdf",
					filename,
				}),
			],
			extraContextParts: [],
			skipped: [],
			supported: true,
		};
	}

	async function readGoogleDoc(url: string) {
		const parsed = new URL(url);
		if (!parsed.hostname.endsWith("docs.google.com")) {
			throw new Error("unsupported_host");
		}
		const path = parsed.pathname;
		if (path.includes("/document/d/")) {
			const id = path.split("/document/d/")[1]?.split("/")[0];
			if (!id) throw new Error("missing_doc_id");
			const exportUrl = `https://docs.google.com/document/d/${id}/export?format=txt`;
			const response = await fetch(exportUrl);
			if (!response.ok) {
				const body = await response.text();
				throw new Error(
					`doc_fetch_error:${response.status}:${response.statusText}:${body}`,
				);
			}
			const text = await response.text();
			return { type: "doc", id, text };
		}
		if (path.includes("/spreadsheets/d/")) {
			const id = path.split("/spreadsheets/d/")[1]?.split("/")[0];
			if (!id) throw new Error("missing_sheet_id");
			const gid =
				parsed.searchParams.get("gid") ??
				parsed.hash.replace("#gid=", "").trim() ??
				"0";
			const exportUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
			const response = await fetch(exportUrl);
			if (!response.ok) {
				const body = await response.text();
				throw new Error(
					`sheet_fetch_error:${response.status}:${response.statusText}:${body}`,
				);
			}
			const text = await response.text();
			return { type: "sheet", id, text };
		}
		if (path.includes("/presentation/d/")) {
			const id = path.split("/presentation/d/")[1]?.split("/")[0];
			if (!id) throw new Error("missing_slides_id");
			const exportUrl = `https://docs.google.com/presentation/d/${id}/export?format=txt`;
			const response = await fetch(exportUrl);
			if (!response.ok) {
				const body = await response.text();
				throw new Error(
					`slides_fetch_error:${response.status}:${response.statusText}:${body}`,
				);
			}
			const text = await response.text();
			return { type: "slides", id, text };
		}
		throw new Error("unsupported_google_doc");
	}

	async function convertDocxToText(buffer: Uint8Array) {
		const mammoth = await import("mammoth");
		const result = await mammoth.extractRawText({
			buffer: Buffer.from(buffer),
		});
		return result.value ?? "";
	}

	function decodeDataUrl(
		url: string,
	): { buffer: Uint8Array; mimeType?: string } | null {
		if (!url.startsWith("data:")) return null;
		const [meta, data] = url.split(",", 2);
		if (!meta || !data) return null;
		const metaMatch = meta.match(/^data:([^;]+)?;base64$/);
		if (!metaMatch) return null;
		try {
			const buffer = Buffer.from(data, "base64");
			return {
				buffer: new Uint8Array(buffer),
				mimeType: metaMatch[1],
			};
		} catch {
			return null;
		}
	}

	const ATTACHMENT_READ_CONCURRENCY = 2;

	type DocxExtractionResult = {
		files: FilePart[];
		extraContextParts: string[];
		skipped: Array<{ filename: string; reason: string }>;
	};

	async function extractDocxFromFileParts(
		files: FilePart[],
	): Promise<DocxExtractionResult> {
		const nextFiles: FilePart[] = [];
		const extraContextParts: string[] = [];
		const skipped: Array<{ filename: string; reason: string }> = [];
		for (const file of files) {
			const filename = file.filename ?? "document.docx";
			if (!isDocxDocument({ mimeType: file.mediaType, fileName: filename })) {
				nextFiles.push(file);
				continue;
			}
			const decoded = decodeDataUrl(file.url);
			if (!decoded) {
				skipped.push({ filename, reason: "decode_failed" });
				continue;
			}
			if (decoded.buffer.byteLength > DOCUMENT_MAX_BYTES) {
				skipped.push({
					filename,
					reason: `too_large:${decoded.buffer.byteLength}`,
				});
				continue;
			}
			try {
				const text = await convertDocxToText(decoded.buffer);
				const truncated = truncateText(text, 8000);
				extraContextParts.push(`DOCX (${filename}):\n${truncated}`);
			} catch (error) {
				skipped.push({ filename, reason: `extract_failed:${String(error)}` });
			}
		}
		return { files: nextFiles, extraContextParts, skipped };
	}

	async function collectAttachmentRequest(params: {
		issueKey: string;
		question: string;
		issueText: string;
		commentsText: string;
		ctx: BotContext;
	}): Promise<PendingAttachmentRequest | null> {
		let attachmentsResult: unknown = [];
		try {
			attachmentsResult = await trackerCallTool(
				"issue_get_attachments",
				{ issue_id: params.issueKey },
				8_000,
				params.ctx,
			);
		} catch (error) {
			logDebug("issue_get_attachments error", {
				issueKey: params.issueKey,
				error: String(error),
			});
		}
		const attachmentsRaw = Array.isArray(attachmentsResult)
			? (attachmentsResult as Array<Record<string, unknown>>)
			: [];
		const attachments = attachmentsRaw
			.map(normalizeTrackerAttachment)
			.filter((item): item is AttachmentCandidate => Boolean(item))
			.filter((item) => isSupportedAttachment(item))
			.slice(0, ATTACHMENT_MAX_COUNT);

		const googleLinks = extractGoogleLinks(
			`${params.issueText}\n${params.commentsText}`,
		).slice(0, ATTACHMENT_MAX_COUNT);

		if (attachments.length === 0 && googleLinks.length === 0) return null;
		return {
			issueKey: params.issueKey,
			question: params.question,
			attachments,
			googleLinks,
			createdAt: Date.now(),
		};
	}

	async function sendAttachmentFiles(params: {
		ctx: BotContext;
		files: Array<{
			buffer: Uint8Array;
			filename: string;
			mimeType: string;
		}>;
		replyToMessageId?: number;
	}) {
		const ctx = params.ctx;
		const chatId = ctx?.chat?.id;
		if (!chatId) return;
		if (!("api" in ctx) || !ctx.api?.sendDocument) return;
		for (const file of params.files) {
			try {
				await retryTelegramCall(
					() =>
						ctx.api.sendDocument(
							chatId,
							new InputFile(file.buffer, file.filename),
							params.replyToMessageId
								? { reply_to_message_id: params.replyToMessageId }
								: undefined,
						),
					"sendDocument",
				);
			} catch (error) {
				logDebug("send attachment failed", { error: String(error) });
			}
		}
	}

	async function sendGeneratedFile(params: {
		ctx?: BotContext;
		buffer: Uint8Array;
		filename: string;
		mimeType: string;
	}) {
		const ctx = params.ctx;
		const chatId = ctx?.chat?.id;
		if (!chatId) return;
		if (!("api" in ctx) || !ctx.api?.sendDocument) return;
		try {
			await retryTelegramCall(
				() =>
					ctx.api.sendDocument(
						chatId,
						new InputFile(params.buffer, params.filename),
					),
				"sendDocument",
			);
		} catch (error) {
			logDebug("send generated file failed", { error: String(error) });
		}
	}

	async function sendBrowserScreenshot(params: {
		ctx?: BotContext;
		path: string;
	}) {
		const ctx = params.ctx;
		const chatId = ctx?.chat?.id;
		if (!chatId) return;
		if (!("api" in ctx) || !ctx.api?.sendPhoto) return;
		try {
			const buffer = await fs.readFile(params.path);
			const filename = params.path.split("/").pop() ?? "screenshot.png";
			await retryTelegramCall(
				() => ctx.api.sendPhoto(chatId, new InputFile(buffer, filename)),
				"sendPhoto",
			);
			await fs.unlink(params.path).catch(() => undefined);
		} catch (error) {
			logDebug("send browser screenshot failed", { error: String(error) });
		}
	}

	type LocalChatOptions = {
		text: string;
		files?: FilePart[];
		webSearchEnabled?: boolean;
		chatId?: string;
		userId?: string;
		userName?: string;
		chatType?: "private" | "group" | "supergroup" | "channel";
		workspaceId?: string;
		sessionKey?: string;
		channelConfig?: ChannelConfig;
		systemEvent?: boolean;
		taskId?: string;
	};

	type LocalChatResult = {
		messages: string[];
	};

	type LocalChatStreamResult = {
		stream: ReadableStream<UIMessageChunk>;
	};

	const isTelegramMessageNotModified = (error: unknown) => {
		if (!error || typeof error !== "object") return false;
		const needle = "message is not modified";
		if (
			"message" in error &&
			typeof error.message === "string" &&
			error.message.includes(needle)
		) {
			return true;
		}
		if (
			"description" in error &&
			typeof error.description === "string" &&
			error.description.includes(needle)
		) {
			return true;
		}
		return false;
	};

	const isAbortError = (error: unknown) => {
		if (!error) return false;
		if (typeof error === "string") {
			const msg = error.toLowerCase();
			return msg.includes("aborted") || msg.includes("aborterror");
		}
		if (typeof error === "object") {
			if (
				"name" in error &&
				typeof (error as { name?: unknown }).name === "string" &&
				(error as { name: string }).name.toLowerCase() === "aborterror"
			) {
				return true;
			}
			if (
				"message" in error &&
				typeof (error as { message?: unknown }).message === "string"
			) {
				const msg = (error as { message: string }).message.toLowerCase();
				return msg.includes("aborted") || msg.includes("aborterror");
			}
		}
		return false;
	};

	async function streamTelegramReply(params: {
		ctx: BotContext;
		replyOptions?: Record<string, unknown>;
		stream: ReadableStream<UIMessageChunk>;
		textChunkLimit: number;
		appendSources: (text: string, sources?: Array<{ url?: string }>) => string;
	}) {
		const { ctx, replyOptions, stream, textChunkLimit, appendSources } = params;
		if (!ctx.chat?.id || !("api" in ctx) || !ctx.api?.editMessageText) {
			return null;
		}
		const limit =
			Number.isFinite(textChunkLimit) && textChunkLimit > 0
				? textChunkLimit
				: 4000;
		const sent = await ctx.reply("…", replyOptions);
		const messageId =
			sent && typeof sent === "object" && "message_id" in sent
				? (sent as { message_id?: number }).message_id
				: undefined;
		if (!messageId) return null;
		const chatId = ctx.chat.id;

		let fullText = "";
		const sources: Array<{ url?: string }> = [];
		let pendingText = "";
		let lastSentText = "";
		let editTimer: ReturnType<typeof setTimeout> | null = null;
		let editInFlight = false;
		let editStopped = false;
		const editThrottleMs = 300;

		const scheduleEdit = () => {
			if (editStopped || editTimer) return;
			editTimer = setTimeout(() => {
				void flushEdit();
			}, editThrottleMs);
		};

		const flushEdit = async () => {
			if (editStopped || editInFlight) return;
			if (editTimer) {
				clearTimeout(editTimer);
				editTimer = null;
			}
			const nextText = pendingText.trimEnd();
			if (!nextText || nextText === lastSentText) return;
			editInFlight = true;
			try {
				await retryTelegramCall(
					() => ctx.api.editMessageText(chatId, messageId, nextText),
					"editMessageText",
				);
				lastSentText = nextText;
			} catch (error) {
				if (isTelegramMessageNotModified(error)) {
					lastSentText = nextText;
				} else {
					editStopped = true;
				}
			} finally {
				editInFlight = false;
				if (!editStopped && pendingText && pendingText !== lastSentText) {
					scheduleEdit();
				}
			}
		};

		const reader = stream.getReader();
		try {
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				if (!value) continue;
				if (value.type === "text-delta") {
					const delta = (value as { delta?: string }).delta ?? "";
					if (delta) {
						fullText += delta;
						pendingText = fullText.slice(0, limit);
						scheduleEdit();
					}
				} else if (value.type === "file") {
					const file = value as {
						mediaType?: unknown;
						url?: unknown;
						filename?: unknown;
					};
					const url = typeof file.url === "string" ? file.url : "";
					const mediaType =
						typeof file.mediaType === "string" ? file.mediaType : "";
					if (url) {
						try {
							if (mediaType.startsWith("image/")) {
								await retryTelegramCall(
									() => ctx.api.sendPhoto(chatId, url),
									"sendPhoto_stream",
								);
							} else {
								await retryTelegramCall(
									() =>
										ctx.api.sendDocument(
											chatId,
											new InputFile(url, file.filename as string | undefined),
										),
									"sendDocument_stream",
								);
							}
						} catch (error) {
							logDebug("telegram stream file send failed", {
								error: String(error),
							});
						}
					}
				} else if (
					value.type === "source-url" ||
					value.type === "source-document"
				) {
					const source = value as { value?: { url?: unknown } };
					const url =
						source?.value &&
						typeof source.value.url === "string" &&
						source.value.url.trim()
							? source.value.url.trim()
							: undefined;
					if (url) sources.push({ url });
				}
			}
		} finally {
			try {
				await flushEdit();
			} catch {
				// ignore
			}
		}

		const trimmed = fullText.trim();
		if (!trimmed) {
			try {
				await retryTelegramCall(
					() =>
						ctx.api.editMessageText(chatId, messageId, "Ошибка: пустой ответ."),
					"editMessageText_empty",
				);
			} catch (error) {
				if (!isTelegramMessageNotModified(error)) {
					throw error;
				}
			}
			return { text: "", reply: "", sources: [] };
		}

		const reply = appendSources(trimmed, sources);
		const chunks = markdownToTelegramChunks(reply, limit);
		if (chunks.length === 0) {
			try {
				await retryTelegramCall(
					() => ctx.api.editMessageText(chatId, messageId, reply),
					"editMessageText_final",
				);
			} catch (error) {
				if (!isTelegramMessageNotModified(error)) {
					throw error;
				}
			}
			return { text: trimmed, reply, sources };
		}
		const first = chunks[0];
		try {
			await retryTelegramCall(
				() =>
					ctx.api.editMessageText(chatId, messageId, first.html, {
						parse_mode: "HTML",
					}),
				"editMessageText_html",
			);
		} catch (error) {
			if (!isTelegramMessageNotModified(error)) {
				try {
					await retryTelegramCall(
						() => ctx.api.editMessageText(chatId, messageId, first.text),
						"editMessageText_plain",
					);
				} catch (fallbackError) {
					if (!isTelegramMessageNotModified(fallbackError)) {
						throw fallbackError;
					}
				}
			}
		}
		if (chunks.length > 1) {
			for (const chunk of chunks.slice(1)) {
				try {
					await ctx.reply(chunk.html, {
						...(replyOptions ?? {}),
						parse_mode: "HTML",
					});
				} catch {
					await ctx.reply(chunk.text, replyOptions);
				}
			}
		}
		return { text: trimmed, reply, sources };
	}

	async function runLocalChat(
		options: LocalChatOptions,
	): Promise<LocalChatResult> {
		const messages: string[] = [];
		const chatId = options.chatId ?? "admin";
		const userId = options.userId ?? "admin";
		const chatType = options.chatType ?? "private";
		const userName = options.userName ?? "Admin";
		const text = options.text.trim();
		const files = options.files ?? [];
		const webSearchEnabled = options.webSearchEnabled;
		if (!text && files.length === 0) return { messages };

		const ctx = {
			state: {
				channelConfig: options.channelConfig,
				systemEvent: options.systemEvent,
				taskId: options.taskId,
				workspaceIdOverride: options.workspaceId,
				sessionKeyOverride: options.sessionKey,
			},
			message: {
				text,
				message_id: 1,
			},
			chat: {
				id: chatId,
				type: chatType,
			},
			from: {
				id: userId,
				first_name: userName,
			},
			me: {
				id: "omni",
			},
			reply: async (replyText: string) => {
				messages.push(replyText);
			},
			replyWithChatAction: async () => {},
		} as unknown as BotContext;

		setLogContext(ctx, {
			request_id: `admin:${chatId}:${userId}:${Date.now()}`,
			chat_id: chatId,
			user_id: userId,
			username: userName,
			update_type: "admin",
			message_type: "text",
		});

		await handleIncomingText(ctx, text, files, webSearchEnabled);
		return { messages };
	}

	async function runLocalChatStream(
		options: LocalChatOptions,
		abortSignal?: AbortSignal,
	): Promise<LocalChatStreamResult> {
		const chatId = options.chatId ?? "admin";
		const userId = options.userId ?? "admin";
		const chatType = options.chatType ?? "private";
		const userName = options.userName ?? "Admin";
		const text = options.text.trim();
		const files = options.files ?? [];
		const webSearchEnabled = options.webSearchEnabled;
		if (!text && files.length === 0) {
			return { stream: createTextStream("Empty message.") };
		}

		const ctx = {
			state: {
				channelConfig: options.channelConfig,
				systemEvent: options.systemEvent,
				taskId: options.taskId,
				workspaceIdOverride: options.workspaceId,
				sessionKeyOverride: options.sessionKey,
			},
			message: {
				text,
				message_id: 1,
			},
			chat: {
				id: chatId,
				type: chatType,
			},
			from: {
				id: userId,
				first_name: userName,
			},
			me: {
				id: "omni",
			},
			replyWithChatAction: async () => {},
		} as unknown as BotContext;

		setLogContext(ctx, {
			request_id: `admin:${chatId}:${userId}:${Date.now()}`,
			chat_id: chatId,
			user_id: userId,
			username: userName,
			update_type: "admin",
			message_type: "text",
		});

		const stream = await handleIncomingTextStream(
			ctx,
			text,
			files,
			webSearchEnabled,
			abortSignal,
		);
		return { stream };
	}

	const prepareInboundHandling = (ctx: BotContext) => {
		if (shouldSkipInbound(ctx)) return false;
		if (TELEGRAM_ABORT_ON_NEW_MESSAGE) {
			const chatId = ctx.chat?.id?.toString();
			if (chatId) {
				const aborted = abortInFlight(chatId, "new_message");
				if (aborted) {
					logDebug("aborted in-flight run", { chatId });
				}
			}
		}
		return true;
	};

	bot.on("message:text", async (ctx) => {
		setLogContext(ctx, { message_type: "text" });
		if (!prepareInboundHandling(ctx)) return;
		const text = ctx.message.text.trim();
		await handleIncomingText(ctx, text);
	});

	bot.on("message:photo", async (ctx) => {
		setLogContext(ctx, { message_type: "photo" });
		if (!prepareInboundHandling(ctx)) return;
		const caption = ctx.message.caption?.trim() ?? "";
		try {
			const files = await loadTelegramImageParts(ctx);
			await handleIncomingText(ctx, caption, files, undefined, true);
		} catch (error) {
			logDebug("photo handling error", { error: String(error) });
			setLogError(ctx, error);
			await sendText(ctx, `Ошибка: ${String(error)}`);
		}
	});

	bot.on("message:document", async (ctx) => {
		setLogContext(ctx, { message_type: "document" });
		if (!prepareInboundHandling(ctx)) return;
		const caption = ctx.message.caption?.trim() ?? "";
		try {
			const payload = await loadTelegramDocumentPayload(ctx);
			if (!payload.supported) {
				await sendText(ctx, "Поддерживаются только PDF или DOCX документы.");
				return;
			}
			if (payload.skipped.length > 0) {
				logDebug("telegram docx skipped", { items: payload.skipped });
			}
			await handleIncomingText(
				ctx,
				caption,
				payload.files,
				undefined,
				true,
				payload.extraContextParts,
			);
		} catch (error) {
			logDebug("document handling error", { error: String(error) });
			setLogError(ctx, error);
			await sendText(ctx, `Ошибка: ${String(error)}`);
		}
	});

	bot.on("message:voice", async (ctx) => {
		setLogContext(ctx, { message_type: "voice" });
		if (!prepareInboundHandling(ctx)) return;
		const voice = ctx.message.voice;
		if (!voice?.file_id) {
			await sendText(ctx, "Не удалось прочитать голосовое сообщение.");
			return;
		}
		const replyToMessageId = isGroupChat(ctx)
			? ctx.message?.message_id
			: undefined;
		const replyOptions = replyToMessageId
			? { reply_to_message_id: replyToMessageId }
			: undefined;
		const cancelStatus = scheduleDelayedStatus(
			(message) => sendText(ctx, message, replyOptions),
			"Обрабатываю голосовое сообщение…",
			2000,
		);
		try {
			if (!isGroupAllowed(ctx)) {
				cancelStatus();
				setLogContext(ctx, { outcome: "blocked", status_code: 403 });
				if (shouldReplyAccessDenied(ctx)) {
					await sendText(ctx, "Доступ запрещен.");
				}
				return;
			}
			if (
				!ctx.state.systemEvent &&
				isGroupChat(ctx) &&
				shouldRequireMentionForChannel({
					channelConfig: ctx.state.channelConfig,
					defaultRequireMention: TELEGRAM_GROUP_REQUIRE_MENTION,
				})
			) {
				const allowReply = isReplyToBotWithoutMention(ctx);
				if (!allowReply && !isBotMentioned(ctx)) {
					cancelStatus();
					setLogContext(ctx, { outcome: "blocked", status_code: 403 });
					return;
				}
			}
			const file = await ctx.api.getFile(voice.file_id);
			if (!file.file_path) {
				cancelStatus();
				await sendText(ctx, "Не удалось получить файл голосового сообщения.");
				return;
			}
			const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
			const response = await fetch(downloadUrl);
			if (!response.ok) {
				cancelStatus();
				throw new Error(`audio_download_failed:${response.status}`);
			}
			const audio = new Uint8Array(await response.arrayBuffer());
			const transcript = await transcribe({
				model: openai.transcription("gpt-4o-mini-transcribe"),
				audio,
			});
			const text = transcript.text?.trim() ?? "";
			if (!text) {
				cancelStatus();
				await sendText(ctx, "Не удалось распознать речь в сообщении.");
				return;
			}
			cancelStatus();
			logDebug("voice transcript", { length: text.length });
			await handleIncomingText(ctx, text);
		} catch (error) {
			cancelStatus();
			logDebug("voice transcription error", { error: String(error) });
			setLogError(ctx, error);
			await sendText(ctx, `Ошибка: ${String(error)}`);
		}
	});

	async function handleIncomingText(
		ctx: BotContext,
		rawText: string,
		files: FilePart[] = [],
		webSearchEnabled?: boolean,
		skipFileStatus?: boolean,
		extraContextParts: string[] = [],
	) {
		const text = rawText.trim();
		const taskOverride = extractTaskOverride(text);
		const effectiveText = taskOverride?.text ?? text;
		if (
			(!effectiveText && files.length === 0) ||
			(effectiveText.startsWith("/") && !files.length)
		) {
			return;
		}
		const replyToMessageId = isGroupChat(ctx)
			? ctx.message?.message_id
			: undefined;
		const replyOptions = replyToMessageId
			? { reply_to_message_id: replyToMessageId }
			: undefined;
		const sendReply = (message: string) => sendText(ctx, message, replyOptions);
		const isAdminChat = ctx.chat?.id?.toString() === "admin";
		let chatId = "";
		let chatState: ChatState | null = null;
		let chatStateDirty = false;
		const markChatStateDirty = () => {
			chatStateDirty = true;
		};
		const updateChatState = (updater: (state: ChatState) => void) => {
			if (!chatState) return;
			updater(chatState);
			markChatStateDirty();
		};
		const persistChatState = async () => {
			if (!chatId || !chatState || !chatStateDirty) return;
			await chatStateStore.set(chatId, chatState);
			chatStateDirty = false;
		};
		const { onToolStart, onToolStep, clearAllStatuses } =
			createToolStatusHandler(sendReply);
		let stopTyping: (() => void) | null = null;
		let cancelFileStatus: (() => void) | null = null;
		let queueFollowup: ((toolNames: string[]) => void) | null = null;
		let taskId: string | undefined;
		let runAbortController: AbortController | null = null;
		const handleToolStep = (toolNames: string[]) => {
			onToolStep?.(toolNames);
			queueFollowup?.(toolNames);
		};

		try {
			await ctx.replyWithChatAction("typing");
			if (!isGroupAllowed(ctx)) {
				setLogContext(ctx, { outcome: "blocked", status_code: 403 });
				if (shouldReplyAccessDenied(ctx)) {
					await sendText(ctx, "Доступ запрещен.");
				}
				return;
			}
			if (
				!ctx.state.systemEvent &&
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
			stopTyping = startTypingHeartbeat(ctx);
			chatId = ctx.chat?.id?.toString() ?? "";
			if (TELEGRAM_ABORT_ON_NEW_MESSAGE && chatId) {
				runAbortController = new AbortController();
				registerInFlight(chatId, runAbortController);
			}
			const { workspaceId, sessionKey, workspaceSnapshot, historyText } =
				await buildConversationContext({
					ctx,
					chatId: chatId || "unknown",
					workspaceId: ctx.state.workspaceIdOverride,
					sessionKey: ctx.state.sessionKeyOverride,
				});
			const userName = ctx.from?.first_name?.trim() || undefined;
			chatState = chatId ? await chatStateStore.get(chatId) : null;
			const turnDepth = ctx.state.turnDepth ?? 0;
			const baseChatType =
				(ctx.chat?.type as "private" | "group" | "supergroup" | "channel") ??
				"private";
			const userId = ctx.from?.id?.toString();
			const isTaskRun = Boolean(ctx.state.taskId && taskClient);
			if (
				!isTaskRun &&
				taskClient &&
				options.queueTurn &&
				TASKS_ENABLED &&
				!ctx.state.systemEvent &&
				turnDepth === 0
			) {
				const taskDecision = taskOverride
					? {
							mode: taskOverride.mode,
							reason: "override",
							tags: ["override"],
						}
					: decideTaskMode({
							text: effectiveText,
							enabled: TASKS_ENABLED,
							urlThreshold: TASK_AUTO_URL_THRESHOLD,
							minChars: TASK_AUTO_MIN_CHARS,
							keywords: taskAutoKeywords,
						});
				if (taskDecision.mode === "background") {
					try {
						const created = (await taskClient.create({
							sessionKey,
							chatId,
							chatType: baseChatType,
							text: effectiveText,
							meta: {
								reason: taskDecision.reason,
								tags: taskDecision.tags,
								source: isAdminChat ? "admin" : "telegram",
							},
						})) as { id?: string };
						const taskId = created?.id?.toString();
						await sendReply(
							`Запускаю фоновую задачу.${taskId ? ` ID: ${taskId}.` : ""}\n` +
								(taskId
									? `Статус: /task status ${taskId}`
									: "Статус: /task status <id>"),
						);
						if (taskId) {
							await options.queueTurn({
								sessionKey,
								chatId,
								chatType: baseChatType,
								text: effectiveText,
								kind: "task",
								channelConfig: ctx.state.channelConfig,
								meta: {
									taskId,
									reason: taskDecision.reason,
									tags: taskDecision.tags,
								},
							});
							return;
						}
					} catch (error) {
						logDebug("task create failed", { error: String(error) });
					}
				}
			}
			const emitToolEvent =
				typeof options.onToolEvent === "function"
					? (payload: {
							toolName: string;
							toolCallId?: string;
							durationMs: number;
							error?: string;
						}) =>
							options.onToolEvent?.({
								...payload,
								chatId,
								chatType: baseChatType,
								userId,
								sessionKey,
								turnDepth,
							})
					: null;
			taskId = ctx.state.taskId;
			let taskStep = 0;
			let lastTaskProgressAt = 0;
			const reportTaskProgress = async (params: {
				message?: string;
				percent?: number;
			}) => {
				if (!taskClient || !taskId) return;
				const nowMs = Date.now();
				if (nowMs - lastTaskProgressAt < TASK_PROGRESS_MIN_MS) return;
				lastTaskProgressAt = nowMs;
				await taskClient.progress({
					id: taskId,
					message: params.message,
					percent: params.percent,
					step: taskStep,
				});
			};
			const reportTaskStep = (toolName: string) => {
				taskStep += 1;
				const percent = Math.min(90, taskStep * 15);
				void reportTaskProgress({
					message: `Инструмент: ${toolName}`,
					percent,
				});
			};
			let followupQueued = false;
			queueFollowup = (toolNames: string[]) => {
				if (!options.queueTurn) return;
				if (followupQueued) return;
				if (turnDepth > 0) return;
				const summary = toolNames.filter(Boolean).slice(0, 6).join(", ");
				const hint = summary ? `Инструменты: ${summary}. ` : "";
				followupQueued = true;
				void options.queueTurn({
					sessionKey,
					chatId,
					chatType: baseChatType,
					text: `${hint}Продолжи выполнение запроса, опираясь на результаты инструментов.`,
					kind: "followup",
					channelConfig: ctx.state.channelConfig,
					turnDepth: turnDepth + 1,
					meta: { toolNames },
				});
			};
			const recordHistory = (role: "user" | "assistant", text: string) => {
				if (!workspaceStore) return;
				void appendHistoryMessage(workspaceStore, workspaceId, sessionKey, {
					timestamp: new Date().toISOString(),
					role,
					text,
				});
			};
			const generateAgentWithFiles = async (
				agent: ToolLoopAgent,
				prompt: string,
				agentFiles: FilePart[],
				abortSignal?: AbortSignal,
			) => {
				if (agentFiles.length === 0) {
					return agent.generate({ prompt, abortSignal });
				}
				const messages = await convertToModelMessages([
					buildUserUIMessage(prompt, agentFiles),
				]);
				return agent.generate({ messages, abortSignal });
			};
			const docxExtracted = await extractDocxFromFileParts(files);
			const filesForModel = docxExtracted.files;
			const combinedExtraContext = [
				...extraContextParts,
				...docxExtracted.extraContextParts,
			].filter(Boolean);
			if (chatState?.research?.active) {
				if (RESEARCH_CANCEL_RE.test(text)) {
					updateChatState((state) => {
						state.research = undefined;
					});
					await sendReply(
						isAdminChat
							? "Research cancelled."
							: "Ок, отменил исследование. Если захочешь начать заново — напиши /research.",
					);
					return;
				}
				if (RESEARCH_READY_RE.test(text)) {
					const notes = [...chatState.research.notes, ...combinedExtraContext];
					const pendingFiles = [...chatState.research.files, ...filesForModel];
					updateChatState((state) => {
						state.research = undefined;
					});
					const languageHint = isAdminChat
						? "Respond in English."
						: "Respond in Russian.";
					const researchPrompt = [
						"You are a research assistant.",
						languageHint,
						"Use Firecrawl tools to gather sources, then deliver a concise, structured answer.",
						"If the result is a list of companies/events/speakers, generate a CSV and call research_export_csv.",
						notes.length > 0 ? `User notes:\n${notes.join("\n")}` : "",
					]
						.filter(Boolean)
						.join("\n\n");
					cancelFileStatus =
						pendingFiles.length > 0
							? scheduleDelayedStatus(
									sendReply,
									isAdminChat ? "Processing files…" : "Обрабатываю файлы…",
									2000,
								)
							: null;
					const allowWebSearch =
						typeof webSearchEnabled === "boolean"
							? webSearchEnabled
							: WEB_SEARCH_ENABLED;
					const modelConfig = getModelConfig(activeModelRef);
					if (!modelConfig) {
						await sendReply(
							isAdminChat ? "Model not configured." : "Модель не настроена.",
						);
						return;
					}
					const agent = await createAgent(
						researchPrompt,
						activeModelRef,
						modelConfig,
						{
							chatId,
							ctx,
							webSearchEnabled: allowWebSearch,
							recentCandidates: chatState?.lastCandidates ?? [],
							history: historyText,
						},
					);
					const result = await generateAgentWithFiles(
						agent,
						researchPrompt,
						pendingFiles,
						runAbortController?.signal,
					);
					clearAllStatuses();
					const replyText = result.text?.trim();
					const sources = (result as { sources?: Array<{ url?: string }> })
						.sources;
					const reply = replyText
						? appendSources(replyText, sources)
						: replyText;
					if (reply) {
						recordHistory("user", researchPrompt);
						recordHistory("assistant", reply);
						await sendReply(reply);
					}
					return;
				}
				if (text) {
					updateChatState((state) => {
						state.research?.notes.push(text);
					});
				}
				if (combinedExtraContext.length > 0) {
					updateChatState((state) => {
						state.research?.notes.push(...combinedExtraContext);
					});
				}
				if (filesForModel.length > 0) {
					updateChatState((state) => {
						state.research?.files.push(...filesForModel);
					});
				}
				await sendReply(
					isAdminChat
						? 'Noted. Send more details or say "ready" to start.'
						: "Принял. Добавь детали или напиши «готово», и я начну.",
				);
				return;
			}
			const promptText =
				effectiveText ||
				(filesForModel.length > 0 || combinedExtraContext.length > 0
					? "Проанализируй вложенный файл."
					: effectiveText);
			const modelPrompt = combinedExtraContext.length
				? [promptText, ...combinedExtraContext].join("\n\n")
				: promptText;
			if (docxExtracted.skipped.length > 0) {
				logDebug("docx read skipped", {
					count: docxExtracted.skipped.length,
					items: docxExtracted.skipped,
				});
			}
			const pendingRequest = chatState?.pendingAttachmentRequest;
			if (pendingRequest) {
				const age = Date.now() - pendingRequest.createdAt;
				if (age > ATTACHMENT_CONSENT_TTL_MS) {
					updateChatState((state) => {
						state.pendingAttachmentRequest = undefined;
					});
				} else {
					const consent = parseConsent(text);
					if (consent) {
						updateChatState((state) => {
							state.pendingAttachmentRequest = undefined;
						});
						if (consent === "no") {
							clearAllStatuses();
							await sendReply("Ок, без вложений.");
							return;
						}
						clearAllStatuses();
						await sendReply("Ок, читаю материалы…");
						try {
							const [issueResult, commentResult] = await Promise.all([
								trackerCallTool(
									"issue_get",
									{ issue_id: pendingRequest.issueKey },
									8_000,
									ctx,
								),
								trackerCallTool(
									"issue_get_comments",
									{ issue_id: pendingRequest.issueKey },
									8_000,
									ctx,
								),
							]);
							const issueText = formatToolResult(issueResult);
							const commentsText = extractCommentsText(commentResult).text;
							const extraContextParts: string[] = [];
							const fileParts: FilePart[] = [];
							const sendFiles: Array<{
								buffer: Uint8Array;
								filename: string;
								mimeType: string;
							}> = [];
							const skippedReads: string[] = [];
							const readErrors: string[] = [];

							await mapWithConcurrency(
								pendingRequest.googleLinks,
								ATTACHMENT_READ_CONCURRENCY,
								async (link) => {
									try {
										const doc = await readGoogleDoc(link);
										const truncated = truncateText(doc.text, 8000);
										extraContextParts.push(
											`Google ${doc.type} (${link}):\n${truncated}`,
										);
									} catch (error) {
										readErrors.push(`${link} (${String(error)})`);
									}
									return null;
								},
							);

							await mapWithConcurrency(
								pendingRequest.attachments,
								ATTACHMENT_READ_CONCURRENCY,
								async (attachment) => {
									try {
										const downloaded = await downloadAttachment(
											attachment.id,
											15_000,
										);
										const filename = downloaded.filename ?? attachment.filename;
										const mimeType =
											downloaded.contentType ?? attachment.mimeType;
										sendFiles.push({
											buffer: downloaded.buffer,
											filename,
											mimeType,
										});

										if (downloaded.buffer.byteLength > ATTACHMENT_MAX_BYTES) {
											skippedReads.push(filename);
											return null;
										}
										if (
											isPdfDocument({ mimeType, fileName: filename }) &&
											downloaded.buffer.byteLength > 0
										) {
											fileParts.push(
												toFilePart({
													buffer: downloaded.buffer,
													mediaType: "application/pdf",
													filename,
												}),
											);
											return null;
										}
										if (isDocxDocument({ mimeType, fileName: filename })) {
											const text = await convertDocxToText(downloaded.buffer);
											const truncated = truncateText(text, 8000);
											extraContextParts.push(
												`DOCX (${filename}):\n${truncated}`,
											);
										}
									} catch (error) {
										readErrors.push(
											`${attachment.filename} (${String(error)})`,
										);
									}
									return null;
								},
							);

							const extraContext =
								extraContextParts.length > 0
									? extraContextParts.join("\n\n")
									: undefined;
							logDebug("attachment decisions", {
								issueKey: pendingRequest.issueKey,
								googleLinks: pendingRequest.googleLinks.length,
								attachments: pendingRequest.attachments.length,
								readFiles: fileParts.length + extraContextParts.length,
								skippedReads,
								readErrors,
							});

							const modelRefs = [
								activeModelRef,
								...activeModelFallbacks.filter((ref) => ref !== activeModelRef),
							];
							let lastError: unknown = null;
							for (const ref of modelRefs) {
								const config = getModelConfig(ref);
								if (!config) {
									logDebug("model missing", { ref });
									continue;
								}
								try {
									setLogContext(ctx, { model_ref: ref, model_id: config.id });
									const agent = await createIssueAgent({
										question: pendingRequest.question,
										modelRef: ref,
										modelName: config.label ?? config.id,
										reasoning: resolveReasoningFor(config),
										modelId: config.id,
										issueKey: pendingRequest.issueKey,
										issueText,
										commentsText,
										extraContext,
										userName,
										globalSoul: workspaceSnapshot?.soul ?? SOUL_PROMPT,
										channelSoul: ctx.state.channelConfig?.systemPrompt,
									});
									const result = await generateAgentWithFiles(
										agent,
										pendingRequest.question,
										fileParts,
										runAbortController?.signal,
									);
									const replyText = result.text?.trim();
									const sources = (
										result as { sources?: Array<{ url?: string }> }
									).sources;
									const reply = replyText
										? appendSources(replyText, sources)
										: replyText;
									if (!reply) {
										lastError = new Error("empty_response");
										continue;
									}
									recordHistory("user", pendingRequest.question);
									recordHistory("assistant", reply);
									await sendReply(reply);
									if (skippedReads.length > 0) {
										await sendReply(
											`Некоторые файлы слишком большие для чтения: ${skippedReads.join(
												", ",
											)}.`,
										);
									}
									if (readErrors.length > 0) {
										await sendReply(
											`Не удалось прочитать часть материалов: ${readErrors.join(
												", ",
											)}.`,
										);
									}
									await sendAttachmentFiles({
										ctx,
										files: sendFiles,
										replyToMessageId,
									});
									return;
								} catch (error) {
									lastError = error;
									logDebug("issue agent error", {
										ref,
										error: String(error),
									});
								}
							}
							setLogError(ctx, lastError ?? "unknown_error");
							await sendReply(`Ошибка: ${String(lastError ?? "unknown")}`);
							return;
						} catch (error) {
							setLogError(ctx, error);
							await sendReply(`Ошибка: ${String(error)}`);
							return;
						}
					} else if (text) {
						updateChatState((state) => {
							state.pendingAttachmentRequest = undefined;
						});
					}
				}
			}
			cancelFileStatus =
				!skipFileStatus &&
				(filesForModel.length > 0 || combinedExtraContext.length > 0)
					? scheduleDelayedStatus(sendReply, "Обрабатываю файл…", 2000)
					: null;
			const allowWebSearch =
				typeof webSearchEnabled === "boolean"
					? webSearchEnabled
					: WEB_SEARCH_ENABLED;
			const generateAgent = async (agent: ToolLoopAgent) =>
				generateAgentWithFiles(
					agent,
					modelPrompt,
					filesForModel,
					runAbortController?.signal,
				);
			const sprintQuery = isSprintQuery(promptText);
			const jiraKeysFromUrl = extractJiraIssueKeysFromUrls(promptText);
			const trackerKeysFromUrl = extractTrackerIssueKeysFromUrls(promptText);
			const urlIssueKeys = [...jiraKeysFromUrl, ...trackerKeysFromUrl];
			const issueKeys =
				hasFigmaUrl(promptText) && urlIssueKeys.length === 0
					? []
					: urlIssueKeys.length > 0
						? urlIssueKeys
						: sprintQuery
							? extractExplicitIssueKeys(promptText)
							: extractIssueKeysFromText(promptText, DEFAULT_ISSUE_PREFIX);
			setLogContext(ctx, {
				issue_key_count: issueKeys.length,
				issue_key: issueKeys[0],
			});
			const jiraKeys = issueKeys.filter((key) => isJiraIssueKey(key));
			const trackerKeys = issueKeys.filter((key) => !isJiraIssueKey(key));
			if (issueKeys.length > 1 && jiraKeys.length === issueKeys.length) {
				try {
					const issuesData = await Promise.all(
						jiraKeys.slice(0, 5).map(async (key) => {
							const [issueResult, commentResult] = await Promise.all([
								jiraIssueGet(key, 8_000),
								jiraIssueGetComments({ issueKey: key }, 8_000),
							]);
							return {
								key,
								issueText: JSON.stringify(
									normalizeJiraIssue(issueResult),
									null,
									2,
								),
								commentsText: commentResult.text,
							};
						}),
					);
					const modelRefs = [
						activeModelRef,
						...activeModelFallbacks.filter((ref) => ref !== activeModelRef),
					];
					let lastError: unknown = null;
					for (const ref of modelRefs) {
						const config = getModelConfig(ref);
						if (!config) continue;
						try {
							setLogContext(ctx, { model_ref: ref, model_id: config.id });
							const agent = await createMultiIssueAgent({
								question: promptText,
								modelRef: ref,
								modelName: config.label ?? config.id,
								reasoning: resolveReasoningFor(config),
								modelId: config.id,
								issues: issuesData,
								userName,
								globalSoul: workspaceSnapshot?.soul ?? SOUL_PROMPT,
								channelSoul: ctx.state.channelConfig?.systemPrompt,
							});
							const result = await generateAgent(agent);
							clearAllStatuses();
							const replyText = result.text?.trim();
							const sources = (result as { sources?: Array<{ url?: string }> })
								.sources;
							const reply = replyText
								? appendSources(replyText, sources)
								: replyText;
							if (!reply) {
								lastError = new Error("empty_response");
								continue;
							}
							updateChatState((state) => {
								state.lastCandidates = issuesData.map((issue) => ({
									key: issue.key,
									summary: "",
									score: 0,
								}));
								state.lastPrimaryKey = issuesData[0]?.key ?? null;
								state.lastUpdatedAt = Date.now();
							});
							const primaryIssue = issuesData[0];
							const issueKey = primaryIssue?.key ?? null;
							const issueText = primaryIssue?.issueText ?? "";
							const commentsText = primaryIssue?.commentsText ?? "";
							recordHistory("user", promptText);
							recordHistory("assistant", reply);
							await sendReply(reply);
							const request = await collectAttachmentRequest({
								issueKey,
								question: promptText,
								issueText,
								commentsText,
								ctx,
							});
							if (request) {
								updateChatState((state) => {
									state.pendingAttachmentRequest = request;
								});
								await sendReply(buildAttachmentPrompt(request));
							}
							return;
						} catch (error) {
							lastError = error;
							logDebug("multi issue agent error", {
								ref,
								error: String(error),
							});
						}
					}
					setLogError(ctx, lastError ?? "unknown_error");
					await sendReply(`Ошибка: ${String(lastError ?? "unknown")}`);
					return;
				} catch (error) {
					setLogError(ctx, error);
					await sendReply(`Ошибка: ${String(error)}`);
					return;
				}
			}

			if (issueKeys.length > 1 && trackerKeys.length === issueKeys.length) {
				try {
					const issuesData = await Promise.all(
						issueKeys.slice(0, 5).map(async (key) => {
							const [issueResult, commentResult] = await Promise.all([
								trackerCallTool("issue_get", { issue_id: key }, 8_000, ctx),
								trackerCallTool(
									"issue_get_comments",
									{ issue_id: key },
									8_000,
									ctx,
								),
							]);
							return {
								key,
								issueText: formatToolResult(issueResult),
								commentsText: extractCommentsText(commentResult).text,
							};
						}),
					);
					const modelRefs = [
						activeModelRef,
						...activeModelFallbacks.filter((ref) => ref !== activeModelRef),
					];
					let lastError: unknown = null;
					for (const ref of modelRefs) {
						const config = getModelConfig(ref);
						if (!config) continue;
						try {
							setLogContext(ctx, { model_ref: ref, model_id: config.id });
							const agent = await createMultiIssueAgent({
								question: promptText,
								modelRef: ref,
								modelName: config.label ?? config.id,
								reasoning: resolveReasoningFor(config),
								modelId: config.id,
								issues: issuesData,
								userName,
								globalSoul: workspaceSnapshot?.soul ?? SOUL_PROMPT,
								channelSoul: ctx.state.channelConfig?.systemPrompt,
							});
							const result = await generateAgent(agent);
							clearAllStatuses();
							const replyText = result.text?.trim();
							const sources = (result as { sources?: Array<{ url?: string }> })
								.sources;
							const reply = replyText
								? appendSources(replyText, sources)
								: replyText;
							if (!reply) {
								lastError = new Error("empty_response");
								continue;
							}
							updateChatState((state) => {
								state.lastCandidates = issuesData.map((issue) => ({
									key: issue.key,
									summary: "",
									score: 0,
								}));
								state.lastPrimaryKey = issuesData[0]?.key ?? null;
								state.lastUpdatedAt = Date.now();
							});
							recordHistory("user", promptText);
							recordHistory("assistant", reply);
							await sendReply(reply);
							return;
						} catch (error) {
							lastError = error;
							logDebug("multi issue agent error", {
								ref,
								error: String(error),
							});
						}
					}
					setLogError(ctx, lastError ?? "unknown_error");
					await sendReply(`Ошибка: ${String(lastError ?? "unknown")}`);
					return;
				} catch (error) {
					setLogError(ctx, error);
					await sendReply(`Ошибка: ${String(error)}`);
					return;
				}
			}

			const issueKey = issueKeys[0] ?? null;
			if (issueKey && isJiraIssueKey(issueKey)) {
				try {
					const [issueResult, commentResult] = await Promise.all([
						jiraIssueGet(issueKey, 8_000),
						jiraIssueGetComments({ issueKey }, 8_000),
					]);
					const issueText = JSON.stringify(
						normalizeJiraIssue(issueResult),
						null,
						2,
					);
					const commentsText = commentResult.text;

					const modelRefs = [
						activeModelRef,
						...activeModelFallbacks.filter((ref) => ref !== activeModelRef),
					];
					let lastError: unknown = null;
					for (const ref of modelRefs) {
						const config = getModelConfig(ref);
						if (!config) {
							logDebug("model missing", { ref });
							continue;
						}
						try {
							setLogContext(ctx, { model_ref: ref, model_id: config.id });
							const agent = await createIssueAgent({
								question: promptText,
								modelRef: ref,
								modelName: config.label ?? config.id,
								reasoning: resolveReasoningFor(config),
								modelId: config.id,
								issueKey,
								issueText,
								commentsText,
								userName,
								globalSoul: workspaceSnapshot?.soul ?? SOUL_PROMPT,
								channelSoul: ctx.state.channelConfig?.systemPrompt,
							});
							const result = await generateAgent(agent);
							clearAllStatuses();
							const replyText = result.text?.trim();
							const sources = (result as { sources?: Array<{ url?: string }> })
								.sources;
							const reply = replyText
								? appendSources(replyText, sources)
								: replyText;
							if (!reply) {
								lastError = new Error("empty_response");
								continue;
							}
							updateChatState((state) => {
								state.lastCandidates = [
									{ key: issueKey, summary: "", score: 0 },
								];
								state.lastPrimaryKey = issueKey;
								state.lastUpdatedAt = Date.now();
							});
							recordHistory("user", promptText);
							recordHistory("assistant", reply);
							await sendReply(reply);
							return;
						} catch (error) {
							lastError = error;
							logDebug("issue agent error", { ref, error: String(error) });
						}
					}
					setLogError(ctx, lastError ?? "unknown_error");
					await sendReply(`Ошибка: ${String(lastError ?? "unknown")}`);
					return;
				} catch (error) {
					setLogError(ctx, error);
					await sendReply(`Ошибка: ${String(error)}`);
					return;
				}
			}

			if (issueKey && trackerKeys.length === issueKeys.length) {
				try {
					const [issueResult, commentResult] = await Promise.all([
						trackerCallTool("issue_get", { issue_id: issueKey }, 8_000, ctx),
						trackerCallTool(
							"issue_get_comments",
							{ issue_id: issueKey },
							8_000,
							ctx,
						),
					]);
					const issueText = formatToolResult(issueResult);
					const commentsText = extractCommentsText(commentResult).text;

					const modelRefs = [
						activeModelRef,
						...activeModelFallbacks.filter((ref) => ref !== activeModelRef),
					];
					let lastError: unknown = null;
					for (const ref of modelRefs) {
						const config = getModelConfig(ref);
						if (!config) {
							logDebug("model missing", { ref });
							continue;
						}
						try {
							setLogContext(ctx, { model_ref: ref, model_id: config.id });
							const agent = await createIssueAgent({
								question: promptText,
								modelRef: ref,
								modelName: config.label ?? config.id,
								reasoning: resolveReasoningFor(config),
								modelId: config.id,
								issueKey,
								issueText,
								commentsText,
								userName,
								globalSoul: workspaceSnapshot?.soul ?? SOUL_PROMPT,
								channelSoul: ctx.state.channelConfig?.systemPrompt,
							});
							const result = await generateAgent(agent);
							clearAllStatuses();
							const replyText = result.text?.trim();
							const sources = (result as { sources?: Array<{ url?: string }> })
								.sources;
							const reply = replyText
								? appendSources(replyText, sources)
								: replyText;
							if (!reply) {
								lastError = new Error("empty_response");
								continue;
							}
							updateChatState((state) => {
								state.lastCandidates = [
									{ key: issueKey, summary: "", score: 0 },
								];
								state.lastPrimaryKey = issueKey;
								state.lastUpdatedAt = Date.now();
							});
							recordHistory("user", promptText);
							recordHistory("assistant", reply);
							await sendReply(reply);
							return;
						} catch (error) {
							lastError = error;
							logDebug("issue agent error", { ref, error: String(error) });
						}
					}
					setLogError(ctx, lastError ?? "unknown_error");
					await sendReply(`Ошибка: ${String(lastError ?? "unknown")}`);
					return;
				} catch (error) {
					setLogError(ctx, error);
					await sendReply(`Ошибка: ${String(error)}`);
					return;
				}
			}

			const modelRefs = [
				activeModelRef,
				...activeModelFallbacks.filter((ref) => ref !== activeModelRef),
			];
			let lastError: unknown = null;
			for (const ref of modelRefs) {
				const config = getModelConfig(ref);
				if (!config) {
					logDebug("model missing", { ref });
					continue;
				}
				try {
					setLogContext(ctx, { model_ref: ref, model_id: config.id });
					const agent = await createAgent(modelPrompt, ref, config, {
						onCandidates: (candidates) => {
							updateChatState((state) => {
								state.lastCandidates = candidates;
								state.lastPrimaryKey = candidates[0]?.key ?? null;
								state.lastUpdatedAt = Date.now();
							});
						},
						recentCandidates: chatState?.lastCandidates,
						history: historyText,
						workspaceSnapshot,
						chatId,
						userName,
						onToolStart: (toolName) => {
							onToolStart?.(toolName);
							reportTaskStep(toolName);
						},
						onToolStep: handleToolStep,
						onToolResult: emitToolEvent ?? undefined,
						ctx,
						webSearchEnabled: allowWebSearch,
					});
					const stream = createAgentStreamWithTools(
						agent,
						modelPrompt,
						filesForModel,
						handleToolStep,
					);
					const streamed = await streamTelegramReply({
						ctx,
						replyOptions,
						stream,
						textChunkLimit: TELEGRAM_TEXT_CHUNK_LIMIT,
						appendSources,
					});
					if (streamed) {
						clearAllStatuses();
						const reply = streamed.reply;
						if (!reply) {
							lastError = new Error("empty_response");
							continue;
						}
						recordHistory("user", promptText);
						recordHistory("assistant", reply);
						if (taskClient && taskId) {
							await taskClient.complete({
								id: taskId,
								result: { text: reply },
							});
						}
						return;
					}

					const result = await generateAgent(agent);
					clearAllStatuses();
					if (DEBUG_LOGS) {
						const steps =
							(
								result as {
									steps?: Array<{
										toolCalls?: Array<AgentToolCall>;
										toolResults?: Array<AgentToolResult>;
									}>;
								}
							).steps ?? [];
						const toolCalls = steps.flatMap((step) =>
							(step.toolCalls ?? [])
								.map((call) => call?.toolName)
								.filter((name): name is string => Boolean(name)),
						);
						const toolResults = steps.flatMap((step) =>
							(step.toolResults ?? [])
								.map((result) => result?.toolName)
								.filter((name): name is string => Boolean(name)),
						);
						logDebug("agent steps", {
							count: steps.length,
							toolCalls,
							toolResults,
							ref,
						});
					}
					const replyText = result.text?.trim();
					const sources = (result as { sources?: Array<{ url?: string }> })
						.sources;
					const reply = replyText
						? appendSources(replyText, sources)
						: replyText;
					if (!reply) {
						lastError = new Error("empty_response");
						continue;
					}
					recordHistory("user", promptText);
					recordHistory("assistant", reply);
					await sendReply(reply);
					if (taskClient && taskId) {
						await taskClient.complete({
							id: taskId,
							result: { text: reply },
						});
					}
					return;
				} catch (error) {
					lastError = error;
					logDebug("agent error", { ref, error: String(error) });
				}
			}
			setLogError(ctx, lastError ?? "unknown_error");
			await sendReply(`Ошибка: ${String(lastError ?? "unknown")}`);
		} catch (error) {
			clearAllStatuses();
			if (runAbortController?.signal.aborted && isAbortError(error)) {
				logDebug("request aborted", { chatId, error: String(error) });
				return;
			}
			setLogError(ctx, error);
			if (taskClient && taskId) {
				await taskClient.fail({ id: taskId, error: String(error) });
			}
			await sendReply(`Ошибка: ${String(error)}`);
		} finally {
			await persistChatState();
			clearAllStatuses();
			cancelFileStatus?.();
			stopTyping?.();
			if (runAbortController && chatId) {
				clearInFlight(chatId, runAbortController);
			}
		}
	}

	async function handleIncomingTextStream(
		ctx: BotContext,
		rawText: string,
		files: FilePart[] = [],
		webSearchEnabled?: boolean,
		abortSignal?: AbortSignal,
	): Promise<ReadableStream<UIMessageChunk>> {
		const modelNotConfigured = "Модель не настроена.";
		let chatId = "";
		let chatState: ChatState | null = null;
		let taskId: string | undefined;
		const updateChatState = (updater: (state: ChatState) => void) => {
			if (!chatId || !chatState) return;
			updater(chatState);
			void chatStateStore.set(chatId, chatState);
		};
		const text = rawText.trim();
		const taskOverride = extractTaskOverride(text);
		const effectiveText = taskOverride?.text ?? text;
		if (
			(!effectiveText && files.length === 0) ||
			(effectiveText.startsWith("/") && !files.length)
		) {
			return createTextStream("Команды здесь не поддерживаются.");
		}

		try {
			await ctx.replyWithChatAction("typing");
			if (!isGroupAllowed(ctx)) {
				setLogContext(ctx, { outcome: "blocked", status_code: 403 });
				if (shouldReplyAccessDenied(ctx)) {
					return createTextStream("Доступ запрещен.");
				}
				return createTextStream("");
			}
			if (
				!ctx.state.systemEvent &&
				isGroupChat(ctx) &&
				shouldRequireMentionForChannel({
					channelConfig: ctx.state.channelConfig,
					defaultRequireMention: TELEGRAM_GROUP_REQUIRE_MENTION,
				})
			) {
				const allowReply = isReplyToBotWithoutMention(ctx);
				if (!allowReply && !isBotMentioned(ctx)) {
					setLogContext(ctx, { outcome: "blocked", status_code: 403 });
					return createTextStream("Нужно упоминание.");
				}
			}
			chatId = ctx.chat?.id?.toString() ?? "";
			const { workspaceId, sessionKey, workspaceSnapshot, historyText } =
				await buildConversationContext({
					ctx,
					chatId: chatId || "unknown",
					workspaceId: ctx.state.workspaceIdOverride,
					sessionKey: ctx.state.sessionKeyOverride,
				});
			const userName = ctx.from?.first_name?.trim() || undefined;
			chatState = chatId ? await chatStateStore.get(chatId) : null;
			const turnDepth = ctx.state.turnDepth ?? 0;
			const baseChatType =
				(ctx.chat?.type as "private" | "group" | "supergroup" | "channel") ??
				"private";
			const userId = ctx.from?.id?.toString();
			const isTaskRun = Boolean(ctx.state.taskId && taskClient);
			if (
				!isTaskRun &&
				taskClient &&
				options.queueTurn &&
				TASKS_ENABLED &&
				!ctx.state.systemEvent &&
				turnDepth === 0
			) {
				const taskDecision = taskOverride
					? {
							mode: taskOverride.mode,
							reason: "override",
							tags: ["override"],
						}
					: decideTaskMode({
							text: effectiveText,
							enabled: TASKS_ENABLED,
							urlThreshold: TASK_AUTO_URL_THRESHOLD,
							minChars: TASK_AUTO_MIN_CHARS,
							keywords: taskAutoKeywords,
						});
				if (taskDecision.mode === "background") {
					try {
						const created = (await taskClient.create({
							sessionKey,
							chatId,
							chatType: baseChatType,
							text: effectiveText,
							meta: {
								reason: taskDecision.reason,
								tags: taskDecision.tags,
								source: chatId === "admin" ? "admin" : "telegram",
							},
						})) as { id?: string };
						const createdId = created?.id?.toString();
						if (createdId) {
							await options.queueTurn({
								sessionKey,
								chatId,
								chatType: baseChatType,
								text: effectiveText,
								kind: "task",
								channelConfig: ctx.state.channelConfig,
								meta: {
									taskId: createdId,
									reason: taskDecision.reason,
									tags: taskDecision.tags,
								},
							});
						}
						const msg =
							`Запускаю фоновую задачу.${createdId ? ` ID: ${createdId}.` : ""}` +
							(createdId ? ` Статус: /task status ${createdId}` : "");
						return createTextStream(msg);
					} catch (error) {
						logDebug("task create failed (stream)", {
							error: String(error),
						});
					}
				}
			}
			const emitToolEvent =
				typeof options.onToolEvent === "function"
					? (payload: {
							toolName: string;
							toolCallId?: string;
							durationMs: number;
							error?: string;
						}) =>
							options.onToolEvent?.({
								...payload,
								chatId,
								chatType: baseChatType,
								userId,
								sessionKey,
								turnDepth,
							})
					: null;
			taskId = ctx.state.taskId;
			let taskStep = 0;
			let lastTaskProgressAt = 0;
			const reportTaskProgress = async (params: {
				message?: string;
				percent?: number;
			}) => {
				if (!taskClient || !taskId) return;
				const nowMs = Date.now();
				if (nowMs - lastTaskProgressAt < TASK_PROGRESS_MIN_MS) return;
				lastTaskProgressAt = nowMs;
				await taskClient.progress({
					id: taskId,
					message: params.message,
					percent: params.percent,
					step: taskStep,
				});
			};
			const reportTaskStep = (toolName: string) => {
				taskStep += 1;
				const percent = Math.min(90, taskStep * 15);
				void reportTaskProgress({
					message: `Инструмент: ${toolName}`,
					percent,
				});
			};
			let followupQueued = false;
			const queueFollowup = (toolNames: string[]) => {
				if (!options.queueTurn) return;
				if (followupQueued) return;
				if (turnDepth > 0) return;
				const summary = toolNames.filter(Boolean).slice(0, 6).join(", ");
				const hint = summary ? `Инструменты: ${summary}. ` : "";
				followupQueued = true;
				void options.queueTurn({
					sessionKey,
					chatId,
					chatType: baseChatType,
					text: `${hint}Продолжи выполнение запроса, опираясь на результаты инструментов.`,
					kind: "followup",
					channelConfig: ctx.state.channelConfig,
					turnDepth: turnDepth + 1,
					meta: { toolNames },
				});
			};
			const handleToolStep = (toolNames: string[]) => {
				queueFollowup(toolNames);
			};
			const recordHistory = (role: "user" | "assistant", text: string) => {
				if (!workspaceStore) return;
				void appendHistoryMessage(workspaceStore, workspaceId, sessionKey, {
					timestamp: new Date().toISOString(),
					role,
					text,
				});
			};
			const docxExtracted = await extractDocxFromFileParts(files);
			const filesForModel = docxExtracted.files;
			const combinedExtraContext =
				docxExtracted.extraContextParts.filter(Boolean);
			const promptText =
				effectiveText ||
				(filesForModel.length > 0 || combinedExtraContext.length > 0
					? "Проанализируй вложенный файл."
					: effectiveText);
			const modelPrompt = combinedExtraContext.length
				? [promptText, ...combinedExtraContext].join("\n\n")
				: promptText;
			if (docxExtracted.skipped.length > 0) {
				logDebug("docx read skipped (stream)", {
					count: docxExtracted.skipped.length,
					items: docxExtracted.skipped,
				});
			}
			const allowWebSearch =
				typeof webSearchEnabled === "boolean"
					? webSearchEnabled
					: WEB_SEARCH_ENABLED;
			const sprintQuery = isSprintQuery(promptText);
			const jiraKeysFromUrl = extractJiraIssueKeysFromUrls(promptText);
			const trackerKeysFromUrl = extractTrackerIssueKeysFromUrls(promptText);
			const urlIssueKeys = [...jiraKeysFromUrl, ...trackerKeysFromUrl];
			const issueKeys =
				hasFigmaUrl(promptText) && urlIssueKeys.length === 0
					? []
					: urlIssueKeys.length > 0
						? urlIssueKeys
						: sprintQuery
							? extractExplicitIssueKeys(promptText)
							: extractIssueKeysFromText(promptText, DEFAULT_ISSUE_PREFIX);
			setLogContext(ctx, {
				issue_key_count: issueKeys.length,
				issue_key: issueKeys[0],
			});
			const jiraKeys = issueKeys.filter((key) => isJiraIssueKey(key));
			const trackerKeys = issueKeys.filter((key) => !isJiraIssueKey(key));

			if (issueKeys.length > 1 && jiraKeys.length === issueKeys.length) {
				const issuesData = await Promise.all(
					jiraKeys.slice(0, 5).map(async (key) => {
						const [issueResult, commentResult] = await Promise.all([
							jiraIssueGet(key, 8_000),
							jiraIssueGetComments({ issueKey: key }, 8_000),
						]);
						return {
							key,
							issueText: JSON.stringify(
								normalizeJiraIssue(issueResult),
								null,
								2,
							),
							commentsText: commentResult.text,
						};
					}),
				);
				const config = getModelConfig(activeModelRef);
				if (!config) {
					return createTextStream(modelNotConfigured);
				}
				setLogContext(ctx, { model_ref: activeModelRef, model_id: config.id });
				const agent = await createMultiIssueAgent({
					question: promptText,
					modelRef: activeModelRef,
					modelName: config.label ?? config.id,
					reasoning: resolveReasoningFor(config),
					modelId: config.id,
					issues: issuesData,
					userName,
					globalSoul: workspaceSnapshot?.soul ?? SOUL_PROMPT,
					channelSoul: ctx.state.channelConfig?.systemPrompt,
				});
				updateChatState((state) => {
					state.lastCandidates = issuesData.map((issue) => ({
						key: issue.key,
						summary: "",
						score: 0,
					}));
					state.lastPrimaryKey = issuesData[0]?.key ?? null;
					state.lastUpdatedAt = Date.now();
				});
				recordHistory("user", promptText);
				return createAgentStreamWithTools(
					agent,
					modelPrompt,
					filesForModel,
					handleToolStep,
					abortSignal,
				);
			}

			if (issueKeys.length > 1 && trackerKeys.length === issueKeys.length) {
				const issuesData = await Promise.all(
					issueKeys.slice(0, 5).map(async (key) => {
						const [issueResult, commentResult] = await Promise.all([
							trackerCallTool("issue_get", { issue_id: key }, 8_000, ctx),
							trackerCallTool(
								"issue_get_comments",
								{ issue_id: key },
								8_000,
								ctx,
							),
						]);
						return {
							key,
							issueText: formatToolResult(issueResult),
							commentsText: extractCommentsText(commentResult).text,
						};
					}),
				);
				const config = getModelConfig(activeModelRef);
				if (!config) {
					return createTextStream(modelNotConfigured);
				}
				setLogContext(ctx, { model_ref: activeModelRef, model_id: config.id });
				const agent = await createMultiIssueAgent({
					question: promptText,
					modelRef: activeModelRef,
					modelName: config.label ?? config.id,
					reasoning: resolveReasoningFor(config),
					modelId: config.id,
					issues: issuesData,
					userName,
					globalSoul: workspaceSnapshot?.soul ?? SOUL_PROMPT,
					channelSoul: ctx.state.channelConfig?.systemPrompt,
				});
				updateChatState((state) => {
					state.lastCandidates = issuesData.map((issue) => ({
						key: issue.key,
						summary: "",
						score: 0,
					}));
					state.lastPrimaryKey = issuesData[0]?.key ?? null;
					state.lastUpdatedAt = Date.now();
				});
				recordHistory("user", promptText);
				return createAgentStreamWithTools(
					agent,
					modelPrompt,
					filesForModel,
					handleToolStep,
					abortSignal,
				);
			}

			const issueKey = issueKeys[0] ?? null;
			if (issueKey && isJiraIssueKey(issueKey)) {
				const [issueResult, commentResult] = await Promise.all([
					jiraIssueGet(issueKey, 8_000),
					jiraIssueGetComments({ issueKey }, 8_000),
				]);
				const issueText = JSON.stringify(
					normalizeJiraIssue(issueResult),
					null,
					2,
				);
				const commentsText = commentResult.text;
				const config = getModelConfig(activeModelRef);
				if (!config) {
					return createTextStream(modelNotConfigured);
				}
				setLogContext(ctx, { model_ref: activeModelRef, model_id: config.id });
				const agent = await createIssueAgent({
					question: promptText,
					modelRef: activeModelRef,
					modelName: config.label ?? config.id,
					reasoning: resolveReasoningFor(config),
					modelId: config.id,
					issueKey,
					issueText,
					commentsText,
					userName,
					globalSoul: workspaceSnapshot?.soul ?? SOUL_PROMPT,
					channelSoul: ctx.state.channelConfig?.systemPrompt,
				});
				updateChatState((state) => {
					state.lastCandidates = [{ key: issueKey, summary: "", score: 0 }];
					state.lastPrimaryKey = issueKey;
					state.lastUpdatedAt = Date.now();
				});
				recordHistory("user", promptText);
				return createAgentStreamWithTools(
					agent,
					modelPrompt,
					filesForModel,
					handleToolStep,
					abortSignal,
				);
			}

			if (issueKey && trackerKeys.length === issueKeys.length) {
				const [issueResult, commentResult] = await Promise.all([
					trackerCallTool("issue_get", { issue_id: issueKey }, 8_000, ctx),
					trackerCallTool(
						"issue_get_comments",
						{ issue_id: issueKey },
						8_000,
						ctx,
					),
				]);
				const issueText = formatToolResult(issueResult);
				const commentsText = extractCommentsText(commentResult).text;
				const config = getModelConfig(activeModelRef);
				if (!config) {
					return createTextStream(modelNotConfigured);
				}
				setLogContext(ctx, { model_ref: activeModelRef, model_id: config.id });
				const agent = await createIssueAgent({
					question: promptText,
					modelRef: activeModelRef,
					modelName: config.label ?? config.id,
					reasoning: resolveReasoningFor(config),
					modelId: config.id,
					issueKey,
					issueText,
					commentsText,
					userName,
					globalSoul: workspaceSnapshot?.soul ?? SOUL_PROMPT,
					channelSoul: ctx.state.channelConfig?.systemPrompt,
				});
				updateChatState((state) => {
					state.lastCandidates = [{ key: issueKey, summary: "", score: 0 }];
					state.lastPrimaryKey = issueKey;
					state.lastUpdatedAt = Date.now();
				});
				recordHistory("user", promptText);
				return createAgentStreamWithTools(
					agent,
					modelPrompt,
					filesForModel,
					handleToolStep,
					abortSignal,
				);
			}

			const config = getModelConfig(activeModelRef);
			if (!config) {
				return createTextStream(modelNotConfigured);
			}
			setLogContext(ctx, { model_ref: activeModelRef, model_id: config.id });
			const agent = await createAgent(modelPrompt, activeModelRef, config, {
				onCandidates: (candidates) => {
					updateChatState((state) => {
						state.lastCandidates = candidates;
						state.lastPrimaryKey = candidates[0]?.key ?? null;
						state.lastUpdatedAt = Date.now();
					});
				},
				recentCandidates: chatState?.lastCandidates,
				history: historyText,
				workspaceSnapshot,
				chatId,
				userName,
				onToolStart: (toolName) => {
					reportTaskStep(toolName);
				},
				onToolResult: emitToolEvent ?? undefined,
				ctx,
				webSearchEnabled: allowWebSearch,
			});
			recordHistory("user", promptText);
			return createAgentStreamWithTools(
				agent,
				modelPrompt,
				filesForModel,
				handleToolStep,
				abortSignal,
			);
		} catch (error) {
			setLogError(ctx, error);
			if (taskClient && taskId) {
				await taskClient.fail({ id: taskId, error: String(error) });
			}
			return createTextStream(`Ошибка: ${String(error)}`);
		}
	}

	bot.on("message", (ctx) => {
		if (!prepareInboundHandling(ctx)) return;
		if (
			!ctx.state.systemEvent &&
			isGroupChat(ctx) &&
			shouldRequireMentionForChannel({
				channelConfig: ctx.state.channelConfig,
				defaultRequireMention: TELEGRAM_GROUP_REQUIRE_MENTION,
			})
		) {
			if (!isReplyToBotWithoutMention(ctx) && !isBotMentioned(ctx)) {
				return;
			}
		}
		if (
			ctx.message?.new_chat_members ||
			ctx.message?.left_chat_member ||
			ctx.message?.new_chat_title ||
			ctx.message?.new_chat_photo ||
			ctx.message?.delete_chat_photo ||
			ctx.message?.group_chat_created ||
			ctx.message?.supergroup_chat_created ||
			ctx.message?.channel_chat_created ||
			ctx.message?.message_auto_delete_timer_changed ||
			ctx.message?.pinned_message ||
			ctx.message?.migrate_from_chat_id ||
			ctx.message?.migrate_to_chat_id
		) {
			return;
		}
		setLogContext(ctx, { message_type: "other" });
		return sendText(
			ctx,
			"Попробуйте /tools, чтобы увидеть доступные инструменты.",
		);
	});

	const allowedUpdates = [...API_CONSTANTS.DEFAULT_UPDATE_TYPES];

	async function buildPromptReport(params?: {
		chatId?: string;
		channelConfig?: {
			systemPrompt?: string;
			requireMention?: boolean;
			allowUserIds?: string[];
			skillsAllowlist?: string[];
			skillsDenylist?: string[];
		};
		question?: string;
		promptMode?: "full" | "minimal" | "none";
	}) {
		const question = params?.question ?? "Prompt report";
		const modelRef = activeModelRef;
		const modelConfig = activeModelConfig;
		const allowWebSearch = WEB_SEARCH_ENABLED;
		const webSearchMeta = {
			name: "web_search",
			description:
				"Search the web for up-to-date information (OpenAI web_search).",
			source: "web",
			origin: "openai",
		} as const;
		const baseTools = AGENT_TOOL_LIST;
		const filteredTools = allowWebSearch
			? baseTools.some((tool) => tool.name === "web_search")
				? baseTools
				: [...baseTools, webSearchMeta]
			: baseTools.filter((tool) => tool.name !== "web_search");
		const toolLines = filteredTools
			.map((toolItem) => {
				const desc = toolItem.description ? ` - ${toolItem.description}` : "";
				return `${toolItem.name}${desc}`;
			})
			.join("\n");
		const timeZone = await resolveChatTimezone(undefined, params?.chatId);
		const currentDateTime = timeZone
			? `${formatUserDateTime(new Date(), timeZone)} (${timeZone})`
			: "";
		const runtimeLine = [
			SERVICE_NAME ? `service=${SERVICE_NAME}` : "",
			RELEASE_VERSION ? `version=${RELEASE_VERSION}` : "",
			REGION ? `region=${REGION}` : "",
			INSTANCE_ID ? `instance=${INSTANCE_ID}` : "",
			modelConfig.label ? `model=${modelConfig.label}` : "",
			modelRef ? `ref=${modelRef}` : "",
			"channel=telegram",
		]
			.filter(Boolean)
			.join(" | ");
		const channelConfig = params?.channelConfig;
		const normalizedChannelConfig = channelConfig
			? {
					id: "prompt-report",
					enabled: true,
					...channelConfig,
				}
			: undefined;
		const skillsForChannel = filterSkillsForChannel({
			skills: runtimeSkills,
			channelConfig: normalizedChannelConfig,
		});
		const skillsPrompt = buildSkillsPrompt(skillsForChannel);
		const prompt = buildAgentInstructions({
			question,
			modelRef,
			modelName: modelConfig.label ?? modelConfig.id,
			reasoning: resolveReasoningFor(modelConfig),
			toolLines,
			globalSoul: SOUL_PROMPT,
			channelSoul: channelConfig?.systemPrompt,
			projectContext: PROJECT_CONTEXT,
			currentDateTime,
			runtimeLine,
			skillsPrompt,
			promptMode: params?.promptMode ?? "full",
			uiCatalogPrompt: omniUiCatalogPrompt,
		});
		const projectContextFiles = (PROJECT_CONTEXT ?? []).map((entry) => ({
			path: entry.path,
			chars: entry.content.length,
		}));
		const projectContextChars = projectContextFiles.reduce(
			(sum, file) => sum + file.chars,
			0,
		);
		return {
			generatedAt: Date.now(),
			model: {
				ref: modelRef,
				id: modelConfig.id,
				label: modelConfig.label ?? modelConfig.id,
				reasoning: resolveReasoningFor(modelConfig),
			},
			promptMode: params?.promptMode ?? "full",
			timeZone: timeZone ?? "",
			currentDateTime,
			runtimeLine,
			sizes: {
				totalChars: prompt.length,
				toolLinesChars: toolLines.length,
				toolCount: filteredTools.length,
				skillsPromptChars: skillsPrompt.length,
				projectContextChars,
				soulChars: SOUL_PROMPT.length,
			},
			projectContextFiles,
		};
	}

	return {
		bot,
		allowedUpdates,
		runLocalChat,
		runLocalChatStream,
		buildPromptReport,
	};
}
