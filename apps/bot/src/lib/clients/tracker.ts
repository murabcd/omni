import type { BotContext } from "../bot/types.js";
import {
	expandTermVariants,
	extractKeywords,
	normalizeForMatch,
} from "../text/normalize.js";

type Logger = {
	info: (payload: Record<string, unknown>) => void;
	error: (payload: Record<string, unknown>) => void;
};

type GetLogContext = (ctx: BotContext) => Record<string, unknown>;

type SetLogContext = (
	ctx: BotContext,
	payload: Record<string, unknown>,
) => void;

export type TrackerToolResult = unknown;

export type TrackerClientConfig = {
	token: string;
	cloudOrgId?: string;
	orgId?: string;
	apiBaseUrl: string;
	commentsCacheTtlMs: number;
	commentsCacheMax: number;
	commentsFetchConcurrency: number;
	logger: Logger;
	getLogContext: GetLogContext;
	setLogContext: SetLogContext;
	logDebug: (event: string, payload?: Record<string, unknown>) => void;
};

export type TrackerClient = {
	trackerCallTool: <T = TrackerToolResult>(
		toolName: string,
		args: Record<string, unknown>,
		timeoutMs: number,
		ctx?: BotContext,
	) => Promise<T>;
	trackerHealthCheck: () => Promise<Record<string, unknown>>;
	getLastTrackerCallAt: () => number | null;
	fetchCommentsWithBudget: (
		keys: string[],
		commentsByIssue: Record<string, { text: string; truncated: boolean }>,
		deadlineMs: number,
		stats: { fetched: number; cacheHits: number },
		ctx?: BotContext,
	) => Promise<void>;
};

export function createTrackerClient(
	config: TrackerClientConfig,
): TrackerClient {
	const commentsCache = new Map<
		string,
		{ at: number; value: { text: string; truncated: boolean } }
	>();
	let lastTrackerCallAt: number | null = null;

	function trackerHeaders(): Record<string, string> {
		const headers: Record<string, string> = {
			Authorization: `OAuth ${config.token}`,
		};
		if (config.cloudOrgId) {
			headers["X-Cloud-Org-Id"] = config.cloudOrgId;
		} else if (config.orgId) {
			headers["X-Org-Id"] = config.orgId;
		}
		return headers;
	}

	function buildTrackerUrl(pathname: string, query?: Record<string, string>) {
		const base = new URL(config.apiBaseUrl);
		const basePath = base.pathname.endsWith("/")
			? base.pathname.slice(0, -1)
			: base.pathname;
		const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
		base.pathname = `${basePath}${path}`;
		const url = base;
		if (query) {
			for (const [key, value] of Object.entries(query)) {
				if (value !== undefined && value !== null && value !== "") {
					url.searchParams.set(key, value);
				}
			}
		}
		return url.toString();
	}

	async function trackerRequest<T>(
		method: string,
		pathname: string,
		options: {
			query?: Record<string, string>;
			body?: unknown;
			timeoutMs?: number;
		} = {},
	): Promise<T> {
		const controller = new AbortController();
		const timeoutMs = options.timeoutMs ?? 8_000;
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const headers = trackerHeaders();
			const init: RequestInit = {
				method,
				headers,
				signal: controller.signal,
			};
			if (options.body !== undefined) {
				headers["Content-Type"] = "application/json";
				init.body = JSON.stringify(options.body);
			}
			const url = buildTrackerUrl(pathname, options.query);
			const response = await fetch(url, init);
			const text = await response.text();
			if (!response.ok) {
				throw new Error(
					`tracker_error:${response.status}:${response.statusText}:${text}`,
				);
			}
			if (!text.trim()) return undefined as T;
			try {
				return JSON.parse(text) as T;
			} catch {
				return text as T;
			}
		} finally {
			clearTimeout(timeout);
		}
	}

	async function trackerIssuesFind(options: {
		query: string;
		perPage?: number;
		page?: number;
		timeoutMs?: number;
	}) {
		if (!options.query) return [];
		return trackerRequest<Array<Record<string, unknown>>>(
			"POST",
			"/v3/issues/_search",
			{
				query: {
					perPage: String(options.perPage ?? 100),
					page: String(options.page ?? 1),
				},
				body: { query: options.query },
				timeoutMs: options.timeoutMs,
			},
		);
	}

	async function trackerIssueGet(issueId: string, timeoutMs?: number) {
		if (!issueId) throw new Error("missing_issue_id");
		return trackerRequest<Record<string, unknown>>(
			"GET",
			`/v3/issues/${encodeURIComponent(issueId)}`,
			{ timeoutMs },
		);
	}

	async function trackerIssueGetComments(issueId: string, timeoutMs?: number) {
		if (!issueId) throw new Error("missing_issue_id");
		return trackerRequest<Array<Record<string, unknown>>>(
			"GET",
			`/v3/issues/${encodeURIComponent(issueId)}/comments`,
			{ timeoutMs },
		);
	}

	async function trackerHealthCheck() {
		return trackerRequest<Record<string, unknown>>("GET", "/v3/myself");
	}

	function getCachedComments(
		issueId: string,
	): { text: string; truncated: boolean } | null {
		const cached = commentsCache.get(issueId);
		if (!cached) return null;
		if (Date.now() - cached.at > config.commentsCacheTtlMs) {
			commentsCache.delete(issueId);
			return null;
		}
		return cached.value;
	}

	function setCachedComments(
		issueId: string,
		value: { text: string; truncated: boolean },
	) {
		commentsCache.set(issueId, { at: Date.now(), value });
		if (commentsCache.size <= config.commentsCacheMax) return;
		let oldestKey: string | null = null;
		let oldestAt = Number.POSITIVE_INFINITY;
		for (const [key, entry] of commentsCache.entries()) {
			if (entry.at < oldestAt) {
				oldestAt = entry.at;
				oldestKey = key;
			}
		}
		if (oldestKey) commentsCache.delete(oldestKey);
	}

	function extractIssueKey(args: Record<string, unknown>): string | undefined {
		const raw = args.issue_id ?? args.issueId ?? args.key;
		return typeof raw === "string" && raw.trim().length > 0
			? raw.trim()
			: undefined;
	}

	function logTrackerAudit(
		ctx: BotContext | undefined,
		toolName: string,
		args: Record<string, unknown>,
		outcome: "success" | "error",
		error?: string,
		durationMs?: number,
	) {
		const context = ctx ? config.getLogContext(ctx) : {};
		const issueKey = extractIssueKey(args);
		const query = typeof args.query === "string" ? args.query : undefined;
		const payload = {
			event: "tracker_tool",
			outcome,
			tool: toolName,
			issue_key: issueKey,
			query_len: query ? query.length : undefined,
			request_id: context.request_id,
			chat_id: context.chat_id,
			user_id: context.user_id,
			username: context.username,
			duration_ms: durationMs,
			error,
		};
		const level = outcome === "error" ? "error" : "info";
		config.logger[level](payload);
	}

	async function trackerCallTool<T = TrackerToolResult>(
		toolName: string,
		args: Record<string, unknown>,
		timeoutMs: number,
		ctx?: BotContext,
	): Promise<T> {
		lastTrackerCallAt = Date.now();
		if (ctx) {
			config.setLogContext(ctx, {
				tool: toolName,
				issue_key: extractIssueKey(args),
			});
		}
		const startedAt = Date.now();
		try {
			switch (toolName) {
				case "issues_find": {
					const query = String(args.query ?? "");
					const perPage = Number(args.per_page ?? args.perPage ?? 100);
					const page = Number(args.page ?? 1);
					const result = await trackerIssuesFind({
						query,
						perPage: Number.isFinite(perPage) ? perPage : 100,
						page: Number.isFinite(page) ? page : 1,
						timeoutMs,
					});
					logTrackerAudit(
						ctx,
						toolName,
						args,
						"success",
						undefined,
						Date.now() - startedAt,
					);
					return result as T;
				}
				case "issue_get": {
					const issueId = String(args.issue_id ?? "");
					const result = await trackerIssueGet(issueId, timeoutMs);
					logTrackerAudit(
						ctx,
						toolName,
						args,
						"success",
						undefined,
						Date.now() - startedAt,
					);
					return result as T;
				}
				case "issue_get_comments": {
					const issueId = String(args.issue_id ?? "");
					const result = await trackerIssueGetComments(issueId, timeoutMs);
					logTrackerAudit(
						ctx,
						toolName,
						args,
						"success",
						undefined,
						Date.now() - startedAt,
					);
					return result as T;
				}
				case "issue_get_url": {
					const issueId = String(args.issue_id ?? "");
					logTrackerAudit(
						ctx,
						toolName,
						args,
						"success",
						undefined,
						Date.now() - startedAt,
					);
					return `https://tracker.yandex.ru/${issueId}` as unknown as T;
				}
				default:
					throw new Error(`unknown_tool:${toolName}`);
			}
		} catch (error) {
			logTrackerAudit(
				ctx,
				toolName,
				args,
				"error",
				String(error),
				Date.now() - startedAt,
			);
			throw error;
		}
	}

	async function fetchCommentsWithBudget(
		keys: string[],
		commentsByIssue: Record<string, { text: string; truncated: boolean }>,
		deadlineMs: number,
		stats: { fetched: number; cacheHits: number },
		ctx?: BotContext,
	) {
		if (!keys.length) return;
		let cursor = 0;
		const concurrency = Math.max(1, config.commentsFetchConcurrency);

		const worker = async () => {
			while (true) {
				if (Date.now() > deadlineMs) return;
				const index = cursor;
				cursor += 1;
				if (index >= keys.length) return;
				const key = keys[index];
				if (!key || commentsByIssue[key]) continue;
				const cached = getCachedComments(key);
				if (cached) {
					stats.cacheHits += 1;
					commentsByIssue[key] = cached;
					continue;
				}
				try {
					const commentResult = await trackerCallTool(
						"issue_get_comments",
						{ issue_id: key },
						8_000,
						ctx,
					);
					stats.fetched += 1;
					const extracted = extractCommentsText(commentResult);
					commentsByIssue[key] = extracted;
					setCachedComments(key, extracted);
				} catch (error) {
					config.logDebug("issue_get_comments error", {
						key,
						error: String(error),
					});
				}
			}
		};

		await Promise.all(Array.from({ length: concurrency }, () => worker()));
	}

	return {
		trackerCallTool,
		trackerHealthCheck,
		getLastTrackerCallAt: () => lastTrackerCallAt,
		fetchCommentsWithBudget,
	};
}

export function normalizeIssuesResult(result: TrackerToolResult): {
	issues: Array<Record<string, unknown>>;
} {
	const direct = result as {
		result?: Array<Record<string, unknown>>;
		issues?: Array<Record<string, unknown>>;
	};
	if (Array.isArray(direct.result)) return { issues: direct.result };
	if (Array.isArray(direct.issues)) return { issues: direct.issues };
	if (Array.isArray(result)) {
		return { issues: result as Array<Record<string, unknown>> };
	}
	return { issues: [] };
}

export type RankedIssue = {
	issue: Record<string, unknown>;
	score: number;
	key: string | null;
	index: number;
};

export function getIssueField(
	issue: Record<string, unknown>,
	keys: string[],
): string {
	for (const key of keys) {
		const value = issue[key];
		if (typeof value === "string" && value.trim()) {
			return value;
		}
	}
	return "";
}

export function rankIssues(
	issues: Array<Record<string, unknown>>,
	question: string,
): RankedIssue[] {
	const terms = extractKeywords(question, 10);
	const ranked = issues
		.map((issue, index) => {
			const score = scoreIssue(issue, terms);
			if (score === null) return null;
			const key = getIssueField(issue, ["key"]);
			return {
				issue,
				score,
				key: key || null,
				index,
			} as RankedIssue;
		})
		.filter((item): item is RankedIssue => Boolean(item))
		.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			return a.index - b.index;
		});
	return ranked;
}

export function matchesKeywords(text: string, keywords: string[]): boolean {
	const normalizedText = normalizeForMatch(text);
	return (
		keywords.length === 0 ||
		keywords.some((word) => normalizedText.includes(normalizeForMatch(word)))
	);
}

export function extractCommentsText(result: TrackerToolResult): {
	text: string;
	truncated: boolean;
} {
	let comments: string[] = [];
	const direct = result as Array<Record<string, unknown>> | null;
	if (Array.isArray(direct)) {
		comments = direct
			.map((item) => {
				const text =
					(item.text as string | undefined) ??
					(item.comment as string | undefined) ??
					(item.body as string | undefined);
				return typeof text === "string" ? text : "";
			})
			.filter((value) => value.length > 0);
	}

	const combined = comments.join("\n");
	const limit = 8000;
	if (combined.length > limit) {
		return { text: `${combined.slice(0, limit)}…`, truncated: true };
	}
	return { text: combined, truncated: false };
}

export function buildIssuesQuery(question: string, queue: string): string {
	const terms = extractKeywords(question);
	if (!terms.length) {
		const safe = question.replaceAll('"', "");
		return `Queue:${queue} AND (Summary: "${safe}" OR Description: "${safe}")`;
	}
	const expanded = terms.flatMap((term) => expandTermVariants(term));
	const unique = Array.from(new Set(expanded));
	const orTerms = unique.flatMap((term) => {
		const safe = term.replaceAll('"', "");
		return [`Summary: "${safe}"`, `Description: "${safe}"`];
	});
	return `Queue:${queue} AND (${orTerms.join(" OR ")})`;
}

function scoreIssue(
	issue: Record<string, unknown>,
	terms: string[],
): number | null {
	if (!terms.length) return 0;
	const summary = normalizeForMatch(getIssueField(issue, ["summary", "title"]));
	const description = normalizeForMatch(getIssueField(issue, ["description"]));
	const tags = Array.isArray(issue.tags)
		? normalizeForMatch(issue.tags.map((tag) => String(tag)).join(" "))
		: "";
	const key = normalizeForMatch(getIssueField(issue, ["key"]));

	let score = 0;
	for (const term of terms) {
		const normalized = normalizeForMatch(term);
		if (!normalized) continue;
		if (summary.includes(normalized)) score += 5;
		if (description.includes(normalized)) score += 2;
		if (tags.includes(normalized)) score += 1;
		if (key.includes(normalized)) score += 10;
	}
	return score;
}
