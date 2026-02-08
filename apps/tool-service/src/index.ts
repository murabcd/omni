import "dotenv/config";
import http from "node:http";
import { PostHogAgentToolkit } from "@posthog/agent-toolkit/integrations/ai-sdk";
import type { ToolSet } from "ai";
import { createAgentToolsFactory } from "../../bot/src/lib/agent/create.js";
import type { BotContext } from "../../bot/src/lib/bot/types.js";
import { createFigmaClient } from "../../bot/src/lib/clients/figma.js";
import type { JiraClient } from "../../bot/src/lib/clients/jira.js";
import { createJiraClient } from "../../bot/src/lib/clients/jira.js";
import { createTrackerClient } from "../../bot/src/lib/clients/tracker.js";
import { createWikiClient } from "../../bot/src/lib/clients/wiki.js";
import { createLogger } from "../../bot/src/lib/logger.js";
import { filterPosthogTools } from "../../bot/src/lib/posthog-tools.js";
import type { SenderToolAccess } from "../../bot/src/lib/tools/access.js";
import type { ApprovalStore } from "../../bot/src/lib/tools/approvals.js";
import { OFFLOADED_TOOL_NAMES } from "../../bot/src/lib/tools/offloaded.js";
import type { ToolPolicy } from "../../bot/src/lib/tools/policy.js";
import { buildWorkspaceDefaults } from "../../bot/src/lib/workspace/defaults.js";
import { createWorkspaceManager } from "../../bot/src/lib/workspace/manager.js";
import { createWorkerImageStore } from "./worker-image-store.js";
import { createWorkerTextStore } from "./worker-text-store.js";

const PORT = Number.parseInt(process.env.TOOL_SERVICE_PORT ?? "8080", 10);
const TOOL_SERVICE_SECRET = process.env.TOOL_SERVICE_SECRET ?? "";
const WORKER_STORAGE_URL = process.env.WORKER_STORAGE_URL ?? "";
const WORKER_STORAGE_TIMEOUT_MS = Number.parseInt(
	process.env.WORKER_STORAGE_TIMEOUT_MS ?? "20000",
	10,
);
const WORKER_MEDIA_URL = process.env.WORKER_MEDIA_URL ?? WORKER_STORAGE_URL;
const WORKER_MEDIA_TIMEOUT_MS = Number.parseInt(
	process.env.WORKER_MEDIA_TIMEOUT_MS ?? WORKER_STORAGE_TIMEOUT_MS.toString(),
	10,
);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const TRACKER_TOKEN = process.env.TRACKER_TOKEN ?? "";
const TRACKER_CLOUD_ORG_ID = process.env.TRACKER_CLOUD_ORG_ID ?? "";
const TRACKER_ORG_ID = process.env.TRACKER_ORG_ID ?? "";
const TRACKER_API_BASE_URL =
	process.env.TRACKER_API_BASE_URL ?? "https://api.tracker.yandex.net";
const WIKI_TOKEN = process.env.WIKI_TOKEN ?? "";
const WIKI_CLOUD_ORG_ID = process.env.WIKI_CLOUD_ORG_ID ?? "";
const FIGMA_TOKEN = process.env.FIGMA_TOKEN ?? "";
const DEFAULT_TRACKER_QUEUE = process.env.DEFAULT_TRACKER_QUEUE ?? "PROJ";
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY ?? "";
const BROWSER_ENABLED = process.env.BROWSER_ENABLED === "1";
const BROWSER_ALLOWLIST = process.env.BROWSER_ALLOWLIST ?? "";
const WEB_SEARCH_ENABLED = process.env.WEB_SEARCH_ENABLED === "1";
const WEB_SEARCH_CONTEXT_SIZE = process.env.WEB_SEARCH_CONTEXT_SIZE ?? "low";
const DEBUG_LOGS = process.env.DEBUG_LOGS === "1";
const POSTHOG_PERSONAL_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY ?? "";
const POSTHOG_API_BASE_URL =
	process.env.POSTHOG_API_BASE_URL ?? "https://eu.posthog.com";
const JIRA_BASE_URL = process.env.JIRA_BASE_URL ?? "";
const JIRA_EMAIL = process.env.JIRA_EMAIL ?? "";
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN ?? "";
const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY ?? "";
const JIRA_BOARD_ID = Number.parseInt(process.env.JIRA_BOARD_ID ?? "", 10);
const COMMENTS_CACHE_TTL_MS = Number.parseInt(
	process.env.COMMENTS_CACHE_TTL_MS ?? "300000",
	10,
);
const COMMENTS_CACHE_MAX = Number.parseInt(
	process.env.COMMENTS_CACHE_MAX ?? "500",
	10,
);
const COMMENTS_FETCH_CONCURRENCY = Number.parseInt(
	process.env.COMMENTS_FETCH_CONCURRENCY ?? "4",
	10,
);
const COMMENTS_FETCH_BUDGET_MS = Number.parseInt(
	process.env.COMMENTS_FETCH_BUDGET_MS ?? "2500",
	10,
);
const SOUL_PROMPT = process.env.SOUL_PROMPT ?? "";
function parseProjectContext(raw?: string) {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw) as Array<{
			path?: unknown;
			content?: unknown;
		}>;
		if (!Array.isArray(parsed)) return [];
		return parsed
			.map((entry) => ({
				path: typeof entry?.path === "string" ? entry.path : "",
				content: typeof entry?.content === "string" ? entry.content : "",
			}))
			.filter((entry) => entry.path && entry.content);
	} catch {
		return [];
	}
}

const PROJECT_CONTEXT = parseProjectContext(process.env.PROJECT_CONTEXT);
const SERVICE_NAME = process.env.SERVICE_NAME ?? "tool-service";
const RELEASE_VERSION = process.env.RELEASE_VERSION ?? "";
const COMMIT_HASH = process.env.COMMIT_HASH ?? "";
const REGION = process.env.REGION ?? "";
const INSTANCE_ID = process.env.INSTANCE_ID ?? "";

if (!TOOL_SERVICE_SECRET.trim()) {
	throw new Error("TOOL_SERVICE_SECRET is required");
}
if (!WORKER_STORAGE_URL.trim()) {
	throw new Error("WORKER_STORAGE_URL is required");
}
if (!OPENAI_API_KEY.trim()) {
	console.warn("OPENAI_API_KEY is missing; web_search will be disabled.");
}
if (!TRACKER_TOKEN.trim()) {
	console.warn("TRACKER_TOKEN is missing; tracker tools will be disabled.");
}

const logger = createLogger({
	service: SERVICE_NAME,
	version: RELEASE_VERSION,
	commit_hash: COMMIT_HASH,
	region: REGION,
	instance_id: INSTANCE_ID,
});

const toolPolicy: ToolPolicy = {
	allow: [...OFFLOADED_TOOL_NAMES],
	deny: [],
};

const senderToolAccess: SenderToolAccess = {
	allowUserIds: new Set(),
	denyUserIds: new Set(),
	allowUserTools: new Map(),
	denyUserTools: new Map(),
	allowChatTools: new Map(),
	denyChatTools: new Map(),
};

const approvalStore: ApprovalStore = {
	isApproved: () => true,
	approve: () => undefined,
	clear: () => undefined,
};

const stubJiraClient: JiraClient = {
	jiraIssuesFind: async () => [],
	jiraIssueGet: async () => {
		throw new Error("jira_disabled");
	},
	jiraIssueGetComments: async () => ({ text: "", truncated: false }),
	jiraSprintFindByName: async () => undefined,
	jiraSprintIssues: async () => [],
	fetchCommentsWithBudget: async () => undefined,
};

const textStore = createWorkerTextStore({
	baseUrl: WORKER_STORAGE_URL,
	secret: TOOL_SERVICE_SECRET,
	timeoutMs:
		Number.isFinite(WORKER_STORAGE_TIMEOUT_MS) && WORKER_STORAGE_TIMEOUT_MS > 0
			? WORKER_STORAGE_TIMEOUT_MS
			: 20000,
});
const imageStore = createWorkerImageStore({
	baseUrl: WORKER_MEDIA_URL,
	secret: TOOL_SERVICE_SECRET,
	timeoutMs:
		Number.isFinite(WORKER_MEDIA_TIMEOUT_MS) && WORKER_MEDIA_TIMEOUT_MS > 0
			? WORKER_MEDIA_TIMEOUT_MS
			: 20000,
});

const workspaceDefaults = buildWorkspaceDefaults({
	soul: SOUL_PROMPT,
	projectContext: PROJECT_CONTEXT,
});

const workspaceManager = createWorkspaceManager({
	store: textStore,
	defaults: workspaceDefaults,
	logger: (event: { event: string; workspaceId: string; key?: string }) =>
		logger.info({
			event: event.event,
			workspace_id: event.workspaceId,
			key: event.key,
		}),
});

const trackerClient = createTrackerClient({
	token: TRACKER_TOKEN,
	cloudOrgId: TRACKER_CLOUD_ORG_ID,
	orgId: TRACKER_ORG_ID,
	apiBaseUrl: TRACKER_API_BASE_URL,
	commentsCacheTtlMs: COMMENTS_CACHE_TTL_MS,
	commentsCacheMax: COMMENTS_CACHE_MAX,
	commentsFetchConcurrency: COMMENTS_FETCH_CONCURRENCY,
	logger,
	getLogContext: (ctx: BotContext) => ctx.state?.logContext ?? {},
	setLogContext: (ctx: BotContext, payload: Record<string, unknown>) => {
		ctx.state = { ...(ctx.state ?? {}), logContext: payload };
	},
	logDebug: (event: string, payload?: Record<string, unknown>) =>
		DEBUG_LOGS && logger.info({ event, ...(payload ?? {}) }),
});

const wikiClient = createWikiClient({
	token: WIKI_TOKEN,
	apiBaseUrl: "https://api.wiki.yandex.net",
	cloudOrgId: WIKI_CLOUD_ORG_ID,
	logDebug: (event: string, payload?: Record<string, unknown>) =>
		DEBUG_LOGS && logger.info({ event, ...(payload ?? {}) }),
});

const figmaClient = createFigmaClient({
	token: FIGMA_TOKEN,
	apiBaseUrl: "https://api.figma.com",
	logDebug: (event: string, payload?: Record<string, unknown>) =>
		DEBUG_LOGS && logger.info({ event, ...(payload ?? {}) }),
});

const jiraClient =
	JIRA_BASE_URL && JIRA_EMAIL && JIRA_API_TOKEN
		? createJiraClient({
				baseUrl: JIRA_BASE_URL,
				email: JIRA_EMAIL,
				apiToken: JIRA_API_TOKEN,
				commentsCacheTtlMs: COMMENTS_CACHE_TTL_MS,
				commentsCacheMax: COMMENTS_CACHE_MAX,
				commentsFetchConcurrency: COMMENTS_FETCH_CONCURRENCY,
				logDebug: (event: string, payload?: Record<string, unknown>) =>
					DEBUG_LOGS && logger.info({ event, ...(payload ?? {}) }),
			})
		: stubJiraClient;

const posthogToolkit = POSTHOG_PERSONAL_API_KEY
	? new PostHogAgentToolkit({
			posthogPersonalApiKey: POSTHOG_PERSONAL_API_KEY,
			posthogApiBaseUrl: POSTHOG_API_BASE_URL,
		})
	: null;
let posthogToolsPromise: Promise<ToolSet> | null = null;

const createAgentTools = createAgentToolsFactory({
	toolConflictLogger: (event: Record<string, unknown>) => logger.info(event),
	toolPolicy,
	resolveChatToolPolicy: () => toolPolicy,
	toolRateLimiter: {
		check: () => ({ allowed: true, resetMs: Date.now() + 60_000 }),
	},
	approvalRequired: new Set(),
	approvalStore,
	senderToolAccess,
	logger,
	logDebug: (event: string, payload?: Record<string, unknown>) =>
		DEBUG_LOGS && logger.info({ event, ...(payload ?? {}) }),
	debugLogs: DEBUG_LOGS,
	webSearchEnabled: WEB_SEARCH_ENABLED,
	webSearchContextSize: WEB_SEARCH_CONTEXT_SIZE,
	firecrawlEnabled: Boolean(FIRECRAWL_API_KEY),
	browserEnabled: BROWSER_ENABLED,
	browserAllowlist: BROWSER_ALLOWLIST.split(",")
		.map((value) => value.trim())
		.filter(Boolean),
	defaultTrackerQueue: DEFAULT_TRACKER_QUEUE,
	cronStatusTimezone: "UTC",
	jiraProjectKey: JIRA_PROJECT_KEY,
	jiraBoardId: Number.isFinite(JIRA_BOARD_ID) ? JIRA_BOARD_ID : 0,
	jiraEnabled: Boolean(JIRA_BASE_URL && JIRA_EMAIL && JIRA_API_TOKEN),
	wikiEnabled: Boolean(WIKI_TOKEN),
	figmaEnabled: Boolean(FIGMA_TOKEN),
	posthogPersonalApiKey: POSTHOG_PERSONAL_API_KEY,
	getPosthogTools: async (): Promise<ToolSet> => {
		if (!posthogToolkit) return {};
		if (!posthogToolsPromise) {
			posthogToolsPromise = (async () =>
				filterPosthogTools(
					(await posthogToolkit.getTools()) as unknown as ToolSet,
				))();
		}
		return posthogToolsPromise;
	},
	geminiApiKey: "",
	trackerClient,
	wikiClient,
	figmaClient,
	jiraClient,
	logJiraAudit: () => undefined,
	workspaceManager,
	sessionStore: undefined,
	commentsFetchBudgetMs: COMMENTS_FETCH_BUDGET_MS,
	imageStore,
	geminiImageSize: "1K",
});

type ToolRequest = {
	tool?: string;
	input?: Record<string, unknown>;
	context?: {
		requestId?: string;
		updateId?: number;
		chatId?: string;
		chatType?: string;
		userId?: string;
		username?: string;
		sessionKey?: string;
	};
};

type ToolCatalogEntry = {
	name: string;
	description?: string;
	parameters?: Record<string, unknown>;
};

async function handleToolCall(body: ToolRequest): Promise<unknown> {
	const toolName = body.tool?.trim() ?? "";
	if (!toolName) {
		return { error: "missing_tool" };
	}
	const normalizedInput = { ...(body.input ?? {}) } as Record<string, unknown>;
	if (
		toolName === "yandex_tracker_search" ||
		toolName === "yandex_tracker_find_issue" ||
		toolName === "jira_search"
	) {
		const rawQuestion =
			normalizedInput.question ??
			normalizedInput.query ??
			normalizedInput.text ??
			normalizedInput.search ??
			normalizedInput.prompt ??
			normalizedInput.q;
		if (typeof rawQuestion === "string") {
			normalizedInput.question = rawQuestion;
		} else if (Array.isArray(rawQuestion)) {
			normalizedInput.question = rawQuestion
				.map((item) => String(item))
				.join(" ");
		} else if (rawQuestion && typeof rawQuestion === "object") {
			const nested =
				(rawQuestion as { text?: unknown; query?: unknown; value?: unknown })
					.text ??
				(rawQuestion as { text?: unknown; query?: unknown; value?: unknown })
					.query ??
				(rawQuestion as { text?: unknown; query?: unknown; value?: unknown })
					.value;
			if (typeof nested === "string") {
				normalizedInput.question = nested;
			}
		}
		if (typeof normalizedInput.question !== "string") {
			return { error: "missing_question" };
		}
		delete normalizedInput.query;
		delete normalizedInput.text;
		delete normalizedInput.search;
		delete normalizedInput.prompt;
		delete normalizedInput.q;
	}
	const ctx = {
		chat: {
			id: body.context?.chatId ? Number(body.context.chatId) : undefined,
			type: body.context?.chatType ?? "private",
		},
		from: {
			id: body.context?.userId ? Number(body.context.userId) : undefined,
		},
		state: {
			logContext: {
				request_id: body.context?.requestId,
				update_id: body.context?.updateId,
				chat_id: body.context?.chatId,
				user_id: body.context?.userId,
				username: body.context?.username,
			},
		},
	} as unknown as BotContext;

	const tools = await createAgentTools({
		chatId: body.context?.chatId,
		ctx,
		webSearchEnabled: WEB_SEARCH_ENABLED,
	});
	const toolDef = tools[toolName];
	if (!toolDef?.execute) {
		return { error: "tool_not_found" };
	}
	return await toolDef.execute(normalizedInput, {
		toolCallId: body.context?.requestId ?? "tool-service",
		messages: [],
	});
}

async function listToolCatalog(): Promise<ToolCatalogEntry[]> {
	const tools = await createAgentTools();
	return Object.entries(tools).map(([name, toolDef]) => {
		const description =
			typeof toolDef?.description === "string"
				? toolDef.description
				: undefined;
		const parameters = (toolDef as { parameters?: unknown }).parameters;
		return {
			name,
			description,
			parameters:
				parameters && typeof parameters === "object"
					? (parameters as Record<string, unknown>)
					: undefined,
		};
	});
}

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url ?? "/", `http://${req.headers.host ?? ""}`);
	if (url.pathname === "/health") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ ok: true }));
		return;
	}
	if (url.pathname === "/catalog" && req.method === "GET") {
		const secret = req.headers["x-omni-tool-secret"];
		if (!secret || secret !== TOOL_SERVICE_SECRET) {
			res.writeHead(403, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "forbidden" }));
			return;
		}
		try {
			const tools = await listToolCatalog();
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ tools }));
		} catch (error) {
			res.writeHead(500, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: String(error) }));
		}
		return;
	}
	if (url.pathname !== "/tool" || req.method !== "POST") {
		res.writeHead(404, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "not_found" }));
		return;
	}
	const secret = req.headers["x-omni-tool-secret"];
	if (!secret || secret !== TOOL_SERVICE_SECRET) {
		res.writeHead(403, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "forbidden" }));
		return;
	}

	const startedAt = Date.now();
	let body: ToolRequest = {};
	let raw = "";
	for await (const chunk of req) {
		raw += chunk;
	}
	try {
		body = raw ? (JSON.parse(raw) as ToolRequest) : {};
	} catch {
		res.writeHead(400, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "invalid_json" }));
		return;
	}

	try {
		const result = await handleToolCall(body);
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify(result));
		logger.info({
			event: "tool_service_call",
			tool: body.tool,
			request_id: body.context?.requestId,
			chat_id: body.context?.chatId,
			user_id: body.context?.userId,
			outcome: "success",
			duration_ms: Date.now() - startedAt,
		});
	} catch (error) {
		res.writeHead(500, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: String(error) }));
		logger.error({
			event: "tool_service_call",
			tool: body.tool,
			request_id: body.context?.requestId,
			chat_id: body.context?.chatId,
			user_id: body.context?.userId,
			outcome: "error",
			error: { message: String(error) },
			duration_ms: Date.now() - startedAt,
		});
	}
});

server.listen(PORT, () => {
	logger.info({ event: "tool_service_listen", port: PORT });
});
