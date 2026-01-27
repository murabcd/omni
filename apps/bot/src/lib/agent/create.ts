import { openai } from "@ai-sdk/openai";
import { supermemoryTools } from "@supermemory/tools/ai-sdk";
import {
	createAgentUIStream,
	createUIMessageStream,
	type ModelMessage,
	stepCountIs,
	ToolLoopAgent,
	type ToolSet,
	type TypedToolCall,
	type TypedToolResult,
	tool,
	type UIMessage,
	type UIMessageChunk,
} from "ai";
import { z } from "zod";
import type { ModelConfig } from "../../models-core.js";
import {
	buildCronExpr,
	findCronJob,
	formatCronJob,
	parseTime,
} from "../bot/cron.js";
import type { BotContext } from "../bot/types.js";
import type { JiraClient } from "../clients/jira.js";
import type { TrackerClient } from "../clients/tracker.js";
import {
	buildIssuesQuery,
	getIssueField,
	matchesKeywords,
	normalizeIssuesResult,
	rankIssues,
} from "../clients/tracker.js";
import type { FilePart } from "../files.js";
import { buildJiraJql, normalizeJiraIssue } from "../jira.js";
import { buildAgentInstructions } from "../prompts/agent-instructions.js";
import { extractKeywords } from "../text/normalize.js";
import {
	isToolAllowedForSender,
	type SenderToolAccess,
} from "../tools/access.js";
import type { ApprovalStore } from "../tools/approvals.js";
import { wrapToolMapWithHooks } from "../tools/hooks.js";
import {
	filterToolMapByPolicy,
	isToolAllowed,
	type ToolPolicy,
} from "../tools/policy.js";
import {
	createToolRegistry,
	normalizeToolName,
	type ToolConflictLog,
	type ToolMeta,
} from "../tools/registry.js";
import { sanitizeToolCallIdsForTranscript } from "../tools/tool-call-id.js";
import { repairToolUseResultPairing } from "../tools/transcript-repair.js";

export type AgentToolSet = Awaited<ReturnType<AgentToolsFactory>>;
export type AgentToolCall = TypedToolCall<AgentToolSet>;
export type AgentToolResult = TypedToolResult<AgentToolSet>;

export type ToolConflictLogger = (event: ToolConflictLog) => void;

type Logger = {
	info: (payload: Record<string, unknown>) => void;
};

type ToolRateLimiter = {
	check: (
		tool: string,
		chatId?: string,
		userId?: string,
	) => { allowed: boolean; resetMs: number };
};

export type AgentToolsFactory = (
	options?: CreateAgentToolsOptions,
) => Promise<ToolSet>;

export type CreateAgentToolsOptions = {
	onCandidates?: (candidates: CandidateIssue[]) => void;
	recentCandidates?: CandidateIssue[];
	history?: string;
	chatId?: string;
	ctx?: BotContext;
	webSearchEnabled?: boolean;
};

export type CandidateIssue = {
	key: string | null;
	summary: string;
	score: number;
};

export type AgentToolsDeps = {
	toolConflictLogger: ToolConflictLogger;
	toolPolicy: ToolPolicy | undefined;
	resolveChatToolPolicy: (ctx?: BotContext) => ToolPolicy | undefined;
	toolRateLimiter: ToolRateLimiter;
	approvalRequired: Set<string>;
	approvalStore: ApprovalStore;
	senderToolAccess: SenderToolAccess;
	logger: Logger;
	logDebug: (event: string, payload?: Record<string, unknown>) => void;
	debugLogs: boolean;
	webSearchEnabled: boolean;
	webSearchContextSize: string;
	defaultTrackerQueue: string;
	cronStatusTimezone: string;
	jiraProjectKey: string;
	jiraBoardId: number;
	jiraEnabled: boolean;
	posthogPersonalApiKey: string;
	getPosthogTools: () => Promise<ToolSet>;
	cronClient?: {
		list: (params?: {
			includeDisabled?: boolean;
		}) => Promise<{ jobs?: unknown[] }>;
		add: (params: Record<string, unknown>) => Promise<unknown>;
		remove: (params: { jobId: string }) => Promise<unknown>;
	};
	trackerClient: TrackerClient;
	jiraClient: JiraClient;
	logJiraAudit: (
		ctx: BotContext | undefined,
		toolName: string,
		args: Record<string, unknown>,
		outcome: "success" | "error",
		error?: string,
		durationMs?: number,
	) => void;
	supermemoryApiKey: string;
	supermemoryProjectId: string;
	supermemoryTagPrefix: string;
	commentsFetchBudgetMs: number;
};

export type AgentModelConfig = ModelConfig;

export type CreateAgentOptions = {
	onCandidates?: (candidates: CandidateIssue[]) => void;
	recentCandidates?: CandidateIssue[];
	history?: string;
	chatId?: string;
	userName?: string;
	onToolStep?: (toolNames: string[]) => Promise<void> | void;
	ctx?: BotContext;
	webSearchEnabled?: boolean;
};

export type AgentDeps = {
	getAgentTools: () => Promise<ToolMeta[]>;
	createAgentTools: AgentToolsFactory;
	resolveReasoningFor: (config: ModelConfig) => string;
	logDebug: (event: string, payload?: Record<string, unknown>) => void;
	debugLogs: boolean;
	webSearchEnabled: boolean;
	soulPrompt: string;
};

function resolveWebSearchContextSize(value: string): "low" | "medium" | "high" {
	if (value === "medium" || value === "high") return value;
	return "low";
}

function buildMemoryTools(config: {
	apiKey: string;
	projectId: string;
	tagPrefix: string;
	chatId?: string;
}) {
	if (!config.apiKey || !config.chatId) return {};
	const containerTags = [`${config.tagPrefix}${config.chatId}`];
	const options = config.projectId
		? { projectId: config.projectId, containerTags }
		: { containerTags };
	return supermemoryTools(config.apiKey, options);
}

export function createAgentToolsFactory(
	deps: AgentToolsDeps,
): AgentToolsFactory {
	return async function createAgentTools(options?: CreateAgentToolsOptions) {
		const registry = createToolRegistry({ logger: deps.toolConflictLogger });
		const toolMap: ToolSet = {};
		const registerTool = (meta: ToolMeta, toolDef: ToolSet[string]) => {
			const res = registry.register(meta);
			if (!res.ok) return;
			toolMap[meta.name] = toolDef;
		};

		const memoryTools = buildMemoryTools({
			apiKey: deps.supermemoryApiKey,
			projectId: deps.supermemoryProjectId,
			tagPrefix: deps.supermemoryTagPrefix,
			chatId: options?.chatId,
		});
		for (const [name, toolDef] of Object.entries(memoryTools)) {
			registerTool(
				{
					name,
					description: "Supermemory tool",
					source: "memory",
					origin: "supermemory",
				},
				toolDef as ToolSet[string],
			);
		}

		const webSearchContextSize = resolveWebSearchContextSize(
			deps.webSearchContextSize.trim().toLowerCase(),
		);
		const allowWebSearch =
			typeof options?.webSearchEnabled === "boolean"
				? options.webSearchEnabled
				: deps.webSearchEnabled;
		if (allowWebSearch) {
			registerTool(
				{
					name: "web_search",
					description:
						"Search the web for up-to-date information (OpenAI web_search).",
					source: "web",
					origin: "openai",
				},
				openai.tools.webSearch({
					searchContextSize: webSearchContextSize,
				}) as unknown as ToolSet[string],
			);
		}

		registerTool(
			{
				name: "tracker_search",
				description: `Search Yandex Tracker issues in queue ${deps.defaultTrackerQueue} using keywords from the question.`,
				source: "tracker",
				origin: "core",
			},
			tool({
				description: `Search Yandex Tracker issues in queue ${deps.defaultTrackerQueue} using keywords from the question.`,
				inputSchema: z.object({
					question: z.string().describe("User question or keywords"),
					queue: z
						.string()
						.optional()
						.describe(`Queue key, defaults to ${deps.defaultTrackerQueue}`),
				}),
				execute: async ({ question, queue }) => {
					const startedAt = Date.now();
					const commentStats = { fetched: 0, cacheHits: 0 };
					const queueKey = queue ?? deps.defaultTrackerQueue;
					const query = buildIssuesQuery(question, queueKey);
					const payload = {
						query,
						fields: [
							"key",
							"summary",
							"description",
							"created_at",
							"updated_at",
							"status",
							"tags",
							"priority",
							"estimation",
							"spent",
						],
						per_page: 100,
						include_description: true,
					};
					deps.logDebug("tracker_search", payload);
					try {
						const result = await deps.trackerClient.trackerCallTool(
							"issues_find",
							payload,
							8_000,
							options?.ctx,
						);
						const normalized = normalizeIssuesResult(result);
						const keywords = extractKeywords(question, 12).map((item) =>
							item.toLowerCase(),
						);
						const haveKeywords = keywords.length > 0;

						const issues = normalized.issues;
						const ranked = rankIssues(issues, question);
						const top = ranked.slice(0, 20);
						const commentsByIssue: Record<
							string,
							{ text: string; truncated: boolean }
						> = {};
						const commentDeadline = startedAt + deps.commentsFetchBudgetMs;
						await deps.trackerClient.fetchCommentsWithBudget(
							top.map((entry) => entry.key ?? ""),
							commentsByIssue,
							commentDeadline,
							commentStats,
							options?.ctx,
						);

						let selected = top;
						if (haveKeywords) {
							const matches = top.filter((entry) => {
								const summary = getIssueField(entry.issue, [
									"summary",
									"title",
								]);
								const description = getIssueField(entry.issue, ["description"]);
								const comments = entry.key
									? (commentsByIssue[entry.key]?.text ?? "")
									: "";
								const haystack = `${summary} ${description} ${comments}`;
								return matchesKeywords(haystack, keywords);
							});
							if (matches.length) {
								selected = matches;
								deps.logDebug("tracker_search filtered", {
									total: top.length,
									matches: matches.length,
								});
							}
						}

						const topCandidates = selected.slice(0, 5).map((entry) => ({
							key: entry.key,
							summary: getIssueField(entry.issue, ["summary", "title"]),
							score: entry.score,
						}));
						const topScore = selected[0]?.score ?? 0;
						const secondScore = selected[1]?.score ?? 0;
						const ambiguous =
							selected.length > 1 &&
							(topScore <= 3 || topScore - secondScore < 3);

						if (options?.onCandidates) {
							options.onCandidates(topCandidates);
						}

						deps.logDebug("tracker_search result", {
							count: issues.length,
							top: selected.map((item) => item.key).filter((key) => key),
							commentsFetched: commentStats.fetched,
							commentsCacheHits: commentStats.cacheHits,
							durationMs: Date.now() - startedAt,
							ambiguous,
						});
						return {
							issues: selected.map((item) => item.issue),
							scores: selected.map((item) => ({
								key: item.key,
								score: item.score,
							})),
							comments: commentsByIssue,
							ambiguous,
							candidates: topCandidates,
						};
					} catch (error) {
						deps.logDebug("tracker_search error", { error: String(error) });
						return { error: String(error) };
					}
				},
			}),
		);

		if (deps.cronClient) {
			registerTool(
				{
					name: "cron_schedule",
					description:
						"Schedule a recurring report or reminder and deliver it to the current chat.",
					source: "cron",
					origin: "core",
				},
				tool({
					description:
						"Create a recurring cron job that runs a prompt and sends the result to Telegram.",
					inputSchema: z.object({
						goal: z.string().describe("What should the report/reminder do?"),
						prompt: z
							.string()
							.optional()
							.describe("Optional custom prompt for the agent."),
						schedule: z.object({
							cadence: z
								.enum(["daily", "weekdays", "weekly", "every"])
								.optional(),
							time: z.string().optional().describe("Time in HH:MM (24h)."),
							timezone: z.string().optional().describe("IANA timezone."),
							dayOfWeek: z
								.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])
								.optional()
								.describe("Required for weekly cadence."),
							everyMinutes: z
								.number()
								.int()
								.positive()
								.optional()
								.describe("Required for every cadence."),
						}),
						deliverToChatId: z
							.string()
							.optional()
							.describe("Telegram chat id to deliver to."),
					}),
					execute: async (input) => {
						const chatId =
							input.deliverToChatId ?? options?.ctx?.chat?.id?.toString() ?? "";
						if (!chatId) {
							return {
								ok: false,
								message: "Missing chat id. Ask the user where to deliver.",
							};
						}
						const cadence = input.schedule.cadence ?? "daily";
						const timezone =
							input.schedule.timezone?.trim() || deps.cronStatusTimezone;
						let schedule: Record<string, unknown> | null = null;
						if (cadence === "every") {
							const everyMinutes = input.schedule.everyMinutes;
							if (!everyMinutes) {
								return {
									ok: false,
									message:
										"Need interval minutes for every cadence (e.g. every 60 minutes).",
								};
							}
							schedule = {
								kind: "every",
								everyMs: Math.max(1, everyMinutes) * 60_000,
							};
						} else {
							const time = input.schedule.time
								? parseTime(input.schedule.time)
								: null;
							if (!time) {
								return {
									ok: false,
									message: "Need time in HH:MM (e.g. 11:00).",
								};
							}
							let expr = "";
							if (cadence === "weekdays") {
								expr = buildCronExpr(time, true);
							} else if (cadence === "weekly") {
								const day = input.schedule.dayOfWeek;
								if (!day) {
									return {
										ok: false,
										message: "Need dayOfWeek for weekly cadence (mon/tue/...).",
									};
								}
								const dayMap: Record<string, string> = {
									mon: "1",
									tue: "2",
									wed: "3",
									thu: "4",
									fri: "5",
									sat: "6",
									sun: "0",
								};
								expr = `${time.minute} ${time.hour} * * ${dayMap[day] ?? "*"}`;
							} else {
								expr = buildCronExpr(time, false);
							}
							schedule = { kind: "cron", expr, tz: timezone };
						}

						const goal = input.goal.trim();
						const prompt =
							input.prompt?.trim() ||
							`Prepare a concise report: ${goal}. Include key numbers and a short insight.`;
						const job = {
							name: goal.slice(0, 80),
							description: goal,
							enabled: true,
							schedule,
							sessionTarget: "main",
							wakeMode: "next-heartbeat",
							payload: {
								kind: "agentTurn",
								message: prompt,
								deliver: true,
								channel: "telegram",
								to: chatId,
							},
						};
						const created = await deps.cronClient?.add(job);
						return {
							ok: true,
							message: created
								? `Scheduled: ${formatCronJob(created)}`
								: "Scheduled",
							job: created,
						};
					},
				}),
			);

			registerTool(
				{
					name: "cron_list",
					description: "List scheduled cron jobs.",
					source: "cron",
					origin: "core",
				},
				tool({
					description: "List scheduled cron jobs.",
					inputSchema: z.object({
						includeDisabled: z.boolean().optional(),
					}),
					execute: async ({ includeDisabled }) => {
						const payload = await deps.cronClient?.list({
							includeDisabled: includeDisabled !== false,
						});
						const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
						return {
							ok: true,
							jobs,
							message:
								jobs.length === 0
									? "No cron jobs."
									: jobs.map((job) => formatCronJob(job)),
						};
					},
				}),
			);

			registerTool(
				{
					name: "cron_remove",
					description: "Remove a scheduled cron job by id or name.",
					source: "cron",
					origin: "core",
				},
				tool({
					description: "Remove a scheduled cron job by id or name.",
					inputSchema: z.object({
						target: z.string().describe("Job id or name."),
					}),
					execute: async ({ target }) => {
						const payload = await deps.cronClient?.list({
							includeDisabled: true,
						});
						const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
						const matches = findCronJob(jobs, target);
						if (matches.length === 0) {
							return { ok: false, message: `No job found for ${target}.` };
						}
						if (matches.length > 1) {
							return {
								ok: false,
								message: "Multiple matches found. Please specify a job id.",
							};
						}
						const jobId = (matches[0] as { id?: string }).id ?? target;
						await deps.cronClient?.remove({ jobId });
						return { ok: true, message: `Removed ${jobId}.` };
					},
				}),
			);
		}

		if (deps.jiraEnabled) {
			registerTool(
				{
					name: "jira_search",
					description: `Search Jira issues in project ${deps.jiraProjectKey} using keywords from the question.`,
					source: "tracker",
					origin: "jira",
				},
				tool({
					description: `Search Jira issues in project ${deps.jiraProjectKey} using keywords from the question.`,
					inputSchema: z.object({
						question: z.string().describe("User question or keywords"),
						project: z
							.string()
							.optional()
							.describe(`Project key, defaults to ${deps.jiraProjectKey}`),
					}),
					execute: async ({ question, project }) => {
						const startedAt = Date.now();
						const commentStats = { fetched: 0, cacheHits: 0 };
						const projectKey = project ?? deps.jiraProjectKey;
						const jql = buildJiraJql(question, projectKey);
						deps.logDebug("jira_search", { jql, project: projectKey });
						try {
							const issues = await deps.jiraClient.jiraIssuesFind({
								jql,
								maxResults: 50,
								fields: ["summary", "description"],
							});
							const normalized = issues.map((issue) =>
								normalizeJiraIssue(issue),
							);
							const top = normalized.slice(0, 20);
							const commentsByIssue: Record<
								string,
								{ text: string; truncated: boolean }
							> = {};
							const commentDeadline = startedAt + deps.commentsFetchBudgetMs;
							await deps.jiraClient.fetchCommentsWithBudget(
								top.map((entry) => entry.key),
								commentsByIssue,
								commentDeadline,
								commentStats,
							);
							return {
								issues: top.map((entry) => ({
									...entry,
									comments: commentsByIssue[entry.key]?.text ?? "",
									commentsTruncated:
										commentsByIssue[entry.key]?.truncated ?? false,
								})),
								jql,
								comments: commentsByIssue,
							};
						} catch (error) {
							deps.logDebug("jira_search error", { error: String(error) });
							return { error: String(error) };
						}
					},
				}),
			);

			registerTool(
				{
					name: "jira_sprint_issues",
					description: "List Jira issues for a sprint by name or id.",
					source: "tracker",
					origin: "jira",
				},
				tool({
					description: "List Jira issues for a sprint by name or id.",
					inputSchema: z.object({
						sprintName: z.string().optional().describe("Sprint name"),
						sprintId: z.number().optional().describe("Sprint id"),
						boardId: z.number().optional().describe("Jira board id"),
						maxResults: z.number().optional().describe("Max issues"),
					}),
					execute: async ({ sprintName, sprintId, boardId, maxResults }) => {
						const startedAt = Date.now();
						const normalizedBoardId =
							typeof boardId === "number" && boardId > 0 ? boardId : undefined;
						const normalizedSprintId =
							typeof sprintId === "number" && sprintId > 0
								? sprintId
								: undefined;
						const resolvedBoardId =
							normalizedBoardId ??
							(Number.isFinite(deps.jiraBoardId) && deps.jiraBoardId > 0
								? deps.jiraBoardId
								: undefined);
						try {
							if (!normalizedSprintId && !sprintName) {
								throw new Error("missing_sprint");
							}
							if (!resolvedBoardId && !normalizedSprintId) {
								throw new Error("missing_board_id");
							}
							let resolvedSprintId = normalizedSprintId;
							let resolvedSprintName = sprintName;
							if (!resolvedSprintId && sprintName) {
								const sprint = await deps.jiraClient.jiraSprintFindByName(
									resolvedBoardId as number,
									sprintName,
								);
								if (sprint) {
									resolvedSprintId = sprint.id;
									resolvedSprintName = sprint.name;
								}
							}
							let issues: Array<{
								key: string;
								summary: string;
								status: string;
								assignee: string;
								dueDate: string;
								priority: string;
							}> = [];
							if (resolvedSprintId) {
								issues = await deps.jiraClient.jiraSprintIssues(
									resolvedSprintId as number,
									maxResults,
								);
							} else if (sprintName) {
								const safeName = sprintName.replaceAll('"', "");
								const jql = `project = ${deps.jiraProjectKey} AND sprint = "${safeName}" ORDER BY created DESC`;
								const fallback = await deps.jiraClient.jiraIssuesFind({
									jql,
									maxResults: maxResults ?? 200,
									fields: [
										"summary",
										"status",
										"assignee",
										"duedate",
										"priority",
									],
								});
								issues = fallback.map((issue) => ({
									key: issue.key ?? "",
									summary:
										typeof issue.fields?.summary === "string"
											? issue.fields.summary
											: "",
									status: issue.fields?.status?.name ?? "",
									assignee: issue.fields?.assignee?.displayName ?? "",
									dueDate: issue.fields?.duedate ?? "",
									priority: issue.fields?.priority?.name ?? "",
								}));
							} else {
								throw new Error("sprint_not_found");
							}
							deps.logJiraAudit(
								options?.ctx,
								"jira_sprint_issues",
								{
									boardId: resolvedBoardId,
									sprintId: resolvedSprintId,
									sprintName: resolvedSprintName,
								},
								"success",
								undefined,
								Date.now() - startedAt,
							);
							return {
								boardId: resolvedBoardId,
								sprintId: resolvedSprintId,
								sprintName: resolvedSprintName,
								issues,
							};
						} catch (error) {
							deps.logJiraAudit(
								options?.ctx,
								"jira_sprint_issues",
								{ boardId: resolvedBoardId, sprintId, sprintName },
								"error",
								String(error),
								Date.now() - startedAt,
							);
							throw error;
						}
					},
				}),
			);

			registerTool(
				{
					name: "jira_issues_find",
					description: "Search Jira issues using JQL.",
					source: "command",
					origin: "jira",
				},
				tool({
					description: "Search Jira issues using JQL.",
					inputSchema: z.object({
						jql: z.string().describe("JQL query"),
						maxResults: z.number().optional().describe("Max results"),
					}),
					execute: async ({ jql, maxResults }) => {
						const startedAt = Date.now();
						try {
							const issues = await deps.jiraClient.jiraIssuesFind({
								jql,
								maxResults,
								fields: ["summary", "description"],
							});
							deps.logJiraAudit(
								options?.ctx,
								"jira_issues_find",
								{ jql },
								"success",
								undefined,
								Date.now() - startedAt,
							);
							return issues.map((issue) => normalizeJiraIssue(issue));
						} catch (error) {
							deps.logJiraAudit(
								options?.ctx,
								"jira_issues_find",
								{ jql },
								"error",
								String(error),
								Date.now() - startedAt,
							);
							throw error;
						}
					},
				}),
			);

			registerTool(
				{
					name: "jira_issue_get",
					description: "Get Jira issue by key (e.g., FL-123).",
					source: "command",
					origin: "jira",
				},
				tool({
					description: "Get Jira issue by key.",
					inputSchema: z.object({
						issueKey: z.string().describe("Issue key"),
					}),
					execute: async ({ issueKey }) => {
						const startedAt = Date.now();
						try {
							const issue = await deps.jiraClient.jiraIssueGet(issueKey);
							deps.logJiraAudit(
								options?.ctx,
								"jira_issue_get",
								{ issueKey },
								"success",
								undefined,
								Date.now() - startedAt,
							);
							return normalizeJiraIssue(issue);
						} catch (error) {
							deps.logJiraAudit(
								options?.ctx,
								"jira_issue_get",
								{ issueKey },
								"error",
								String(error),
								Date.now() - startedAt,
							);
							throw error;
						}
					},
				}),
			);

			registerTool(
				{
					name: "jira_issue_get_comments",
					description: "Get comments for a Jira issue by key.",
					source: "command",
					origin: "jira",
				},
				tool({
					description: "Get comments for a Jira issue by key.",
					inputSchema: z.object({
						issueKey: z.string().describe("Issue key"),
					}),
					execute: async ({ issueKey }) => {
						const startedAt = Date.now();
						try {
							const comments = await deps.jiraClient.jiraIssueGetComments({
								issueKey,
							});
							deps.logJiraAudit(
								options?.ctx,
								"jira_issue_get_comments",
								{ issueKey },
								"success",
								undefined,
								Date.now() - startedAt,
							);
							return comments;
						} catch (error) {
							deps.logJiraAudit(
								options?.ctx,
								"jira_issue_get_comments",
								{ issueKey },
								"error",
								String(error),
								Date.now() - startedAt,
							);
							throw error;
						}
					},
				}),
			);
		}

		if (deps.posthogPersonalApiKey) {
			const posthogTools = await deps.getPosthogTools();
			for (const [name, toolDef] of Object.entries(posthogTools)) {
				registerTool(
					{
						name,
						description: "PostHog read-only tool",
						source: "posthog",
						origin: "posthog",
					},
					toolDef,
				);
			}
		}

		const filtered = filterToolMapByPolicy(toolMap, deps.toolPolicy);
		const chatPolicy = deps.resolveChatToolPolicy(options?.ctx);
		const filteredByChat = filterToolMapByPolicy(filtered.tools, chatPolicy);
		const suppressed = [...filtered.suppressed, ...filteredByChat.suppressed];
		if (deps.debugLogs && suppressed.length > 0) {
			deps.logDebug("tools suppressed by policy", {
				suppressed,
			});
		}
		const chatId = options?.ctx?.chat?.id?.toString();
		const userId = options?.ctx?.from?.id?.toString();
		const wrapped = wrapToolMapWithHooks(filteredByChat.tools as ToolSet, {
			beforeToolCall: ({ toolName, toolCallId, input }) => {
				if (chatPolicy && !isToolAllowed(toolName, chatPolicy)) {
					deps.logger.info({
						event: "tool_blocked",
						tool: toolName,
						tool_call_id: toolCallId,
						chat_id: chatId,
						user_id: userId,
						reason: "policy",
					});
					return { allow: false, reason: "policy" };
				}
				const senderCheck = isToolAllowedForSender(
					toolName,
					{ userId, chatId },
					deps.senderToolAccess,
				);
				if (!senderCheck.allowed) {
					deps.logger.info({
						event: "tool_blocked",
						tool: toolName,
						tool_call_id: toolCallId,
						chat_id: chatId,
						user_id: userId,
						reason: senderCheck.reason ?? "sender_policy",
					});
					return { allow: false, reason: "sender_policy" };
				}
				const normalized = normalizeToolName(toolName);
				if (
					deps.approvalRequired.size > 0 &&
					deps.approvalRequired.has(normalized) &&
					!deps.approvalStore.isApproved(chatId ?? "", normalized)
				) {
					deps.logger.info({
						event: "tool_approval_required",
						tool: toolName,
						tool_call_id: toolCallId,
						chat_id: chatId,
						user_id: userId,
					});
					return { allow: false, reason: "approval_required" };
				}
				const rate = deps.toolRateLimiter.check(toolName, chatId, userId);
				if (!rate.allowed) {
					deps.logger.info({
						event: "tool_rate_limited",
						tool: toolName,
						tool_call_id: toolCallId,
						chat_id: chatId,
						user_id: userId,
						reset_ms: rate.resetMs,
					});
					return { allow: false, reason: "rate_limited" };
				}
				deps.logger.info({
					event: "tool_call",
					tool: toolName,
					tool_call_id: toolCallId,
					chat_id: chatId,
					user_id: userId,
					input,
				});
			},
			afterToolCall: ({ toolName, toolCallId, durationMs, error }) => {
				deps.logger.info({
					event: "tool_result",
					tool: toolName,
					tool_call_id: toolCallId,
					chat_id: chatId,
					user_id: userId,
					duration_ms: durationMs,
					error,
				});
			},
		});
		return wrapped;
	};
}

export function createAgentFactory(deps: AgentDeps) {
	return async function createAgent(
		question: string,
		modelRef: string,
		modelConfig: ModelConfig,
		options?: CreateAgentOptions,
	) {
		const tools = await deps.getAgentTools();
		const allowWebSearch =
			typeof options?.webSearchEnabled === "boolean"
				? options.webSearchEnabled
				: deps.webSearchEnabled;
		const webSearchMeta = {
			name: "web_search",
			description:
				"Search the web for up-to-date information (OpenAI web_search).",
			source: "web",
			origin: "openai",
		} satisfies ToolMeta;
		const filteredTools = allowWebSearch
			? tools.some((tool) => tool.name === "web_search")
				? tools
				: [...tools, webSearchMeta]
			: tools.filter((tool) => tool.name !== "web_search");
		const toolLines = filteredTools
			.map((toolItem) => {
				const desc = toolItem.description ? ` - ${toolItem.description}` : "";
				return `${toolItem.name}${desc}`;
			})
			.join("\n");
		const instructions = buildAgentInstructions({
			question,
			modelRef,
			modelName: modelConfig.label ?? modelConfig.id,
			reasoning: deps.resolveReasoningFor(modelConfig),
			toolLines,
			recentCandidates: options?.recentCandidates,
			history: options?.history,
			userName: options?.userName,
			globalSoul: deps.soulPrompt,
			channelSoul: options?.ctx?.state.channelConfig?.systemPrompt,
		});
		const agentTools = await deps.createAgentTools(options);
		return new ToolLoopAgent({
			model: openai(modelConfig.id),
			instructions,
			tools: agentTools,
			stopWhen: stepCountIs(6),
			prepareCall: (params) => {
				const messages = params.messages;
				if (!Array.isArray(messages)) return params;
				const sanitized = sanitizeToolCallIdsForTranscript(
					messages as unknown as Array<Record<string, unknown>>,
				);
				const repaired = repairToolUseResultPairing(sanitized);
				if (
					deps.debugLogs &&
					(repaired.added.length > 0 ||
						repaired.droppedDuplicateCount > 0 ||
						repaired.droppedOrphanCount > 0 ||
						repaired.moved)
				) {
					deps.logDebug("transcript repair", {
						added: repaired.added.length,
						droppedDuplicate: repaired.droppedDuplicateCount,
						droppedOrphan: repaired.droppedOrphanCount,
						moved: repaired.moved,
					});
				}
				return {
					...params,
					messages: repaired.messages as unknown as ModelMessage[],
				};
			},
			onStepFinish: ({ toolCalls }) => {
				if (!options?.onToolStep) return;
				const names = (toolCalls ?? [])
					.map((call) => call?.toolName)
					.filter((name): name is string => Boolean(name));
				if (names.length > 0) {
					options.onToolStep?.(names);
				}
			},
		});
	};
}

export function createAgentStreamWithTools(
	agent: ToolLoopAgent,
	text: string,
	files?: FilePart[],
	onToolStep?: (toolNames: string[]) => Promise<void> | void,
	abortSignal?: AbortSignal,
): ReadableStream<UIMessageChunk> {
	const uiMessages = [buildUserUIMessage(text, files)];
	return createUIMessageStream<UIMessage>({
		execute: async ({ writer }) => {
			const stream = await createAgentUIStream({
				agent,
				uiMessages,
				abortSignal,
				onStepFinish: ({ toolCalls }) => {
					const names = (toolCalls ?? [])
						.map((call) => call?.toolName)
						.filter((name): name is string => Boolean(name));
					if (names.length > 0) {
						writer.write({ type: "data-tools", data: { tools: names } });
						onToolStep?.(names);
					}
				},
			});
			writer.merge(stream);
		},
	});
}

export function buildUserUIMessage(
	text: string,
	files?: FilePart[],
): UIMessage {
	const parts: UIMessage["parts"] = [];
	if (text) {
		parts.push({ type: "text", text });
	}
	for (const file of files ?? []) {
		parts.push({
			type: "file",
			mediaType: file.mediaType,
			filename: file.filename,
			url: file.url,
		});
	}
	if (parts.length === 0) {
		parts.push({ type: "text", text: "" });
	}
	return {
		id: crypto.randomUUID(),
		role: "user",
		parts,
	};
}
