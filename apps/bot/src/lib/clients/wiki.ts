export type WikiClientConfig = {
	token: string;
	apiBaseUrl: string;
	cloudOrgId?: string;
	logDebug: (event: string, payload?: Record<string, unknown>) => void;
};

export type WikiClient = {
	wikiPageGet: (options: {
		slug: string;
		fields?: string;
		raiseOnRedirect?: boolean;
		revisionId?: number;
		timeoutMs?: number;
	}) => Promise<Record<string, unknown>>;
	wikiPageGetById: (options: {
		id: number;
		fields?: string;
		raiseOnRedirect?: boolean;
		followRedirects?: boolean;
		revisionId?: number;
		timeoutMs?: number;
	}) => Promise<Record<string, unknown>>;
	wikiPageCreate: (options: {
		pageType: string;
		slug: string;
		title: string;
		content?: string;
		gridFormat?: string;
		cloudPage?: Record<string, unknown>;
		fields?: string;
		isSilent?: boolean;
		timeoutMs?: number;
	}) => Promise<Record<string, unknown>>;
	wikiPageUpdate: (options: {
		id: number;
		title?: string;
		content?: string;
		redirect?: Record<string, unknown>;
		allowMerge?: boolean;
		fields?: string;
		isSilent?: boolean;
		timeoutMs?: number;
	}) => Promise<Record<string, unknown>>;
	wikiPageAppendContent: (options: {
		id: number;
		content: string;
		body?: Record<string, unknown>;
		anchor?: Record<string, unknown>;
		section?: Record<string, unknown>;
		fields?: string;
		isSilent?: boolean;
		timeoutMs?: number;
	}) => Promise<Record<string, unknown>>;
};

export function createWikiClient(config: WikiClientConfig): WikiClient {
	function wikiHeaders(): Record<string, string> {
		const headers: Record<string, string> = {
			Accept: "application/json",
		};
		if (config.token) {
			headers.Authorization = `OAuth ${config.token}`;
		}
		if (config.cloudOrgId) {
			headers["X-Cloud-Org-Id"] = config.cloudOrgId;
		}
		return headers;
	}

	function buildWikiUrl(pathname: string, query?: Record<string, string>) {
		const base = new URL(config.apiBaseUrl);
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

	async function wikiRequest<T>(
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
			const headers = wikiHeaders();
			const init: RequestInit = {
				method,
				headers,
				signal: controller.signal,
			};
			if (options.body !== undefined) {
				headers["Content-Type"] = "application/json";
				init.body = JSON.stringify(options.body);
			}
			const url = buildWikiUrl(pathname, options.query);
			const response = await fetch(url, init);
			const text = await response.text();
			if (!response.ok) {
				throw new Error(
					`wiki_error:${response.status}:${response.statusText}:${text}`,
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

	async function wikiPageGet(options: {
		slug: string;
		fields?: string;
		raiseOnRedirect?: boolean;
		revisionId?: number;
		timeoutMs?: number;
	}) {
		const query: Record<string, string> = {
			slug: options.slug,
		};
		if (options.fields) query.fields = options.fields;
		if (options.raiseOnRedirect !== undefined) {
			query.raise_on_redirect = options.raiseOnRedirect ? "true" : "false";
		}
		if (options.revisionId) {
			query.revision_id = String(options.revisionId);
		}
		return wikiRequest<Record<string, unknown>>("GET", "/v1/pages", {
			query,
			timeoutMs: options.timeoutMs,
		});
	}

	async function wikiPageGetById(options: {
		id: number;
		fields?: string;
		raiseOnRedirect?: boolean;
		followRedirects?: boolean;
		revisionId?: number;
		timeoutMs?: number;
	}) {
		const query: Record<string, string> = {};
		if (options.fields) query.fields = options.fields;
		if (options.raiseOnRedirect !== undefined) {
			query.raise_on_redirect = options.raiseOnRedirect ? "true" : "false";
		}
		if (options.followRedirects !== undefined) {
			query.follow_redirects = options.followRedirects ? "true" : "false";
		}
		if (options.revisionId) {
			query.revision_id = String(options.revisionId);
		}
		return wikiRequest<Record<string, unknown>>(
			"GET",
			`/v1/pages/${options.id}`,
			{ query, timeoutMs: options.timeoutMs },
		);
	}

	async function wikiPageCreate(options: {
		pageType: string;
		slug: string;
		title: string;
		content?: string;
		gridFormat?: string;
		cloudPage?: Record<string, unknown>;
		fields?: string;
		isSilent?: boolean;
		timeoutMs?: number;
	}) {
		const query: Record<string, string> = {};
		if (options.fields) query.fields = options.fields;
		if (options.isSilent !== undefined) {
			query.is_silent = options.isSilent ? "true" : "false";
		}
		const body: Record<string, unknown> = {
			page_type: options.pageType,
			slug: options.slug,
			title: options.title,
		};
		if (options.content !== undefined) body.content = options.content;
		if (options.gridFormat) body.grid_format = options.gridFormat;
		if (options.cloudPage) body.cloud_page = options.cloudPage;
		return wikiRequest<Record<string, unknown>>("POST", "/v1/pages", {
			query,
			body,
			timeoutMs: options.timeoutMs,
		});
	}

	async function wikiPageUpdate(options: {
		id: number;
		title?: string;
		content?: string;
		redirect?: Record<string, unknown>;
		allowMerge?: boolean;
		fields?: string;
		isSilent?: boolean;
		timeoutMs?: number;
	}) {
		const query: Record<string, string> = {};
		if (options.allowMerge !== undefined) {
			query.allow_merge = options.allowMerge ? "true" : "false";
		}
		if (options.fields) query.fields = options.fields;
		if (options.isSilent !== undefined) {
			query.is_silent = options.isSilent ? "true" : "false";
		}
		const body: Record<string, unknown> = {};
		if (options.title !== undefined) body.title = options.title;
		if (options.content !== undefined) body.content = options.content;
		if (options.redirect !== undefined) body.redirect = options.redirect;
		return wikiRequest<Record<string, unknown>>(
			"POST",
			`/v1/pages/${options.id}`,
			{
				query,
				body,
				timeoutMs: options.timeoutMs,
			},
		);
	}

	async function wikiPageAppendContent(options: {
		id: number;
		content: string;
		body?: Record<string, unknown>;
		anchor?: Record<string, unknown>;
		section?: Record<string, unknown>;
		fields?: string;
		isSilent?: boolean;
		timeoutMs?: number;
	}) {
		const query: Record<string, string> = {};
		if (options.fields) query.fields = options.fields;
		if (options.isSilent !== undefined) {
			query.is_silent = options.isSilent ? "true" : "false";
		}
		const body: Record<string, unknown> = {
			content: options.content,
		};
		if (options.body) body.body = options.body;
		if (options.anchor) body.anchor = options.anchor;
		if (options.section) body.section = options.section;
		return wikiRequest<Record<string, unknown>>(
			"POST",
			`/v1/pages/${options.id}/append-content`,
			{
				query,
				body,
				timeoutMs: options.timeoutMs,
			},
		);
	}

	return {
		wikiPageGet,
		wikiPageGetById,
		wikiPageCreate,
		wikiPageUpdate,
		wikiPageAppendContent,
	};
}
