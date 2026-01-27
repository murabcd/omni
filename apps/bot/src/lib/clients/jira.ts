import { extractJiraText, type JiraIssue } from "../jira.js";

export type JiraClientConfig = {
	baseUrl: string;
	email: string;
	apiToken: string;
	commentsCacheTtlMs: number;
	commentsCacheMax: number;
	commentsFetchConcurrency: number;
	logDebug: (event: string, payload?: Record<string, unknown>) => void;
};

export type JiraClient = {
	jiraIssuesFind: (options: {
		jql: string;
		maxResults?: number;
		fields?: string[];
		timeoutMs?: number;
	}) => Promise<JiraIssue[]>;
	jiraIssueGet: (issueKey: string, timeoutMs?: number) => Promise<JiraIssue>;
	jiraIssueGetComments: (
		options: { issueKey: string; maxResults?: number },
		timeoutMs?: number,
	) => Promise<{ text: string; truncated: boolean }>;
	jiraSprintFindByName: (
		boardId: number,
		name: string,
	) => Promise<{ id: number; name: string } | undefined>;
	jiraSprintIssues: (
		sprintId: number,
		maxResults?: number,
	) => Promise<
		Array<{
			key: string;
			summary: string;
			status: string;
			assignee: string;
			dueDate: string;
			priority: string;
		}>
	>;
	fetchCommentsWithBudget: (
		keys: string[],
		commentsByIssue: Record<string, { text: string; truncated: boolean }>,
		deadlineMs: number,
		stats: { fetched: number; cacheHits: number },
	) => Promise<void>;
};

export function createJiraClient(config: JiraClientConfig): JiraClient {
	const jiraCommentsCache = new Map<
		string,
		{ at: number; value: { text: string; truncated: boolean } }
	>();

	function jiraHeaders(): Record<string, string> {
		const token = Buffer.from(`${config.email}:${config.apiToken}`).toString(
			"base64",
		);
		return {
			Authorization: `Basic ${token}`,
			Accept: "application/json",
		};
	}

	function buildJiraUrl(pathname: string, query?: Record<string, string>) {
		const base = new URL(config.baseUrl);
		const basePath = base.pathname.endsWith("/")
			? base.pathname.slice(0, -1)
			: base.pathname;
		const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
		base.pathname = `${basePath}${path}`;
		if (query) {
			for (const [key, value] of Object.entries(query)) {
				if (value !== undefined && value !== null && value !== "") {
					base.searchParams.set(key, value);
				}
			}
		}
		return base.toString();
	}

	async function jiraRequest<T>(
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
			const headers = jiraHeaders();
			const init: RequestInit = {
				method,
				headers,
				signal: controller.signal,
			};
			if (options.body !== undefined) {
				headers["Content-Type"] = "application/json";
				init.body = JSON.stringify(options.body);
			}
			const url = buildJiraUrl(pathname, options.query);
			const response = await fetch(url, init);
			const text = await response.text();
			if (!response.ok) {
				throw new Error(
					`jira_error:${response.status}:${response.statusText}:${text}`,
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

	function getCachedComments(
		issueKey: string,
	): { text: string; truncated: boolean } | null {
		const cached = jiraCommentsCache.get(issueKey);
		if (!cached) return null;
		if (Date.now() - cached.at > config.commentsCacheTtlMs) {
			jiraCommentsCache.delete(issueKey);
			return null;
		}
		return cached.value;
	}

	function setCachedComments(
		issueKey: string,
		value: { text: string; truncated: boolean },
	) {
		jiraCommentsCache.set(issueKey, { at: Date.now(), value });
		if (jiraCommentsCache.size <= config.commentsCacheMax) return;
		let oldestKey: string | null = null;
		let oldestAt = Number.POSITIVE_INFINITY;
		for (const [key, entry] of jiraCommentsCache.entries()) {
			if (entry.at < oldestAt) {
				oldestAt = entry.at;
				oldestKey = key;
			}
		}
		if (oldestKey) jiraCommentsCache.delete(oldestKey);
	}

	type JiraSearchResponse = {
		issues?: JiraIssue[];
	};

	type JiraCommentsResponse = {
		comments?: Array<{
			body?: unknown;
		}>;
	};

	type JiraSprintResponse = {
		values?: Array<{
			id: number;
			name: string;
			state?: string;
			startDate?: string;
			endDate?: string;
			completeDate?: string;
		}>;
		isLast?: boolean;
		startAt?: number;
		maxResults?: number;
	};

	type JiraSprintIssue = {
		key?: string;
		fields?: {
			summary?: string;
			status?: { name?: string };
			assignee?: { displayName?: string };
			duedate?: string;
			priority?: { name?: string };
		};
	};

	async function jiraIssuesFind(options: {
		jql: string;
		maxResults?: number;
		fields?: string[];
		timeoutMs?: number;
	}) {
		if (!options.jql) return [];
		const fields = options.fields ?? ["summary", "description"];
		const payload = {
			jql: options.jql,
			maxResults: options.maxResults ?? 50,
			fields,
		};
		const response = await jiraRequest<JiraSearchResponse>(
			"POST",
			"/rest/api/3/search/jql",
			{ body: payload, timeoutMs: options.timeoutMs },
		);
		return response.issues ?? [];
	}

	async function jiraIssueGet(issueKey: string, timeoutMs?: number) {
		if (!issueKey) throw new Error("missing_issue_key");
		return jiraRequest<JiraIssue>(
			"GET",
			`/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
			{
				query: { fields: "summary,description" },
				timeoutMs,
			},
		);
	}

	async function jiraIssueGetComments(
		options: { issueKey: string; maxResults?: number },
		timeoutMs?: number,
	): Promise<{ text: string; truncated: boolean }> {
		if (!options.issueKey) throw new Error("missing_issue_key");
		const response = await jiraRequest<JiraCommentsResponse>(
			"GET",
			`/rest/api/3/issue/${encodeURIComponent(options.issueKey)}/comment`,
			{
				query: { maxResults: String(options.maxResults ?? 100) },
				timeoutMs,
			},
		);
		const comments = response.comments ?? [];
		const texts = comments.map((comment) => extractJiraText(comment.body));
		const joined = texts.join("\n\n").trim();
		const truncated = joined.length > 4000;
		return { text: joined.slice(0, 4000), truncated };
	}

	async function jiraSprintsList(
		boardId: number,
		timeoutMs?: number,
	): Promise<JiraSprintResponse["values"]> {
		const results: NonNullable<JiraSprintResponse["values"]> = [];
		let startAt = 0;
		const maxResults = 50;
		while (true) {
			const response = await jiraRequest<JiraSprintResponse>(
				"GET",
				`/rest/agile/1.0/board/${encodeURIComponent(String(boardId))}/sprint`,
				{
					query: {
						startAt: String(startAt),
						maxResults: String(maxResults),
						state: "active,future,closed",
					},
					timeoutMs,
				},
			);
			const values = response.values ?? [];
			results.push(...values);
			if (response.isLast || values.length === 0) break;
			startAt += maxResults;
		}
		return results;
	}

	function normalizeSprintName(value: string) {
		return value
			.trim()
			.replaceAll("–", "-")
			.replaceAll("—", "-")
			.replaceAll(/\s+/g, " ")
			.toLowerCase();
	}

	async function jiraSprintFindByName(boardId: number, name: string) {
		const target = normalizeSprintName(name);
		const sprints = (await jiraSprintsList(boardId)) ?? [];
		const exact = sprints.find(
			(sprint) => normalizeSprintName(sprint.name ?? "") === target,
		);
		if (exact) return exact;
		return sprints.find((sprint) =>
			normalizeSprintName(sprint.name ?? "").includes(target),
		);
	}

	async function jiraSprintIssues(sprintId: number, maxResults?: number) {
		const results: JiraSprintIssue[] = [];
		let startAt = 0;
		const pageSize = Math.min(Math.max(maxResults ?? 50, 1), 100);
		while (results.length < (maxResults ?? Number.POSITIVE_INFINITY)) {
			const response = await jiraRequest<{ issues?: JiraSprintIssue[] }>(
				"GET",
				`/rest/agile/1.0/sprint/${encodeURIComponent(String(sprintId))}/issue`,
				{
					query: {
						startAt: String(startAt),
						maxResults: String(pageSize),
						fields: "summary,status,assignee,duedate,priority",
					},
					timeoutMs: 8_000,
				},
			);
			const batch = response.issues ?? [];
			results.push(...batch);
			if (batch.length < pageSize) break;
			startAt += pageSize;
			if (maxResults && results.length >= maxResults) break;
		}
		return results.slice(0, maxResults ?? results.length).map((issue) => ({
			key: issue.key ?? "",
			summary:
				typeof issue.fields?.summary === "string" ? issue.fields.summary : "",
			status: issue.fields?.status?.name ?? "",
			assignee: issue.fields?.assignee?.displayName ?? "",
			dueDate: issue.fields?.duedate ?? "",
			priority: issue.fields?.priority?.name ?? "",
		}));
	}

	async function fetchCommentsWithBudget(
		keys: string[],
		commentsByIssue: Record<string, { text: string; truncated: boolean }>,
		deadlineMs: number,
		stats: { fetched: number; cacheHits: number },
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
					const commentResult = await jiraIssueGetComments({ issueKey: key });
					stats.fetched += 1;
					commentsByIssue[key] = commentResult;
					setCachedComments(key, commentResult);
				} catch (error) {
					config.logDebug("jira_issue_get_comments error", {
						key,
						error: String(error),
					});
				}
			}
		};

		await Promise.all(Array.from({ length: concurrency }, () => worker()));
	}

	return {
		jiraIssuesFind,
		jiraIssueGet,
		jiraIssueGetComments,
		jiraSprintFindByName,
		jiraSprintIssues,
		fetchCommentsWithBudget,
	};
}
