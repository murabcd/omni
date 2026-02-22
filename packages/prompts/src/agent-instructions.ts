import { buildSystemPrompt } from "./system-prompt.js";

export type CandidateIssue = {
	key: string | null;
	summary: string;
	score: number;
};

export type AgentInstructionOptions = {
	question: string;
	modelRef: string;
	modelName: string;
	reasoning: string;
	toolLines: string;
	recentCandidates?: CandidateIssue[];
	history?: string;
	userName?: string;
	systemPrompt?: string;
	globalSoul?: string;
	channelSoul?: string;
	projectContext?: Array<{ path: string; content: string }>;
	workspaceSnapshot?: {
		agents?: string;
		soul?: string;
		memoryCore?: string;
		memoryCorePath?: string;
		memoryToday?: string;
		memoryYesterday?: string;
		memoryTodayPath?: string;
		memoryYesterdayPath?: string;
		contextFiles?: Array<{ path: string; content: string }>;
	};
	currentDateTime?: string;
	runtimeLine?: string;
	skillsPrompt?: string;
	promptMode?: "full" | "minimal" | "none";
	uiCatalogPrompt?: string;
};

function buildSoulBlock(params: {
	globalSoul?: string;
	channelSoul?: string;
	systemPrompt?: string;
	workspaceSoul?: string;
}): string {
	const sections: string[] = [];
	const globalSoul = params.workspaceSoul?.trim() || params.globalSoul?.trim();
	if (globalSoul) {
		sections.push("SOUL (global):", globalSoul);
	}
	const channelSoul = (params.channelSoul ?? params.systemPrompt)?.trim();
	if (channelSoul) {
		sections.push("SOUL (channel):", channelSoul);
	}
	return sections.join("\n");
}

function buildWorkspaceBlock(options: AgentInstructionOptions): string {
	const snapshot = options.workspaceSnapshot;
	if (!snapshot) return "";
	const blocks: string[] = [];
	if (snapshot.agents?.trim()) {
		blocks.push("## AGENTS.md", snapshot.agents.trim(), "");
	}
	if (snapshot.memoryCore?.trim()) {
		const path = snapshot.memoryCorePath ?? "memory/core.md";
		blocks.push(`## ${path}`, snapshot.memoryCore.trim(), "");
	}
	if (snapshot.memoryToday?.trim()) {
		const path = snapshot.memoryTodayPath ?? "memory/today.md";
		blocks.push(`## ${path}`, snapshot.memoryToday.trim(), "");
	}
	if (snapshot.memoryYesterday?.trim()) {
		const path = snapshot.memoryYesterdayPath ?? "memory/yesterday.md";
		blocks.push(`## ${path}`, snapshot.memoryYesterday.trim(), "");
	}
	const contextFiles = snapshot.contextFiles ?? [];
	for (const entry of contextFiles) {
		if (!entry.path || !entry.content) continue;
		blocks.push(`## context/${entry.path}`, entry.content.trim(), "");
	}
	if (blocks.length === 0) return "";
	return ["# Workspace Context", ...blocks].join("\n");
}

function buildToolSections(options: {
	toolLines: string;
	uiCatalogPrompt?: string;
}): string[] {
	const toolSections: string[] = [
		"Tool Use:",
		"- Use the appropriate tool for the task. Summarize results in Russian and do not invent facts.",
		"- If a tool is blocked with approval_required, ask the user to run /approve <tool> and retry.",
		"- Always include required params for each tool.",
		"- If the user pastes error logs or stack traces, explain locally and do not call tools unless explicitly asked.",
	];

	if (options.toolLines.includes("yandex_tracker_search")) {
		toolSections.push(
			"- Use `yandex_tracker_search` for Yandex Tracker keyword queries.",
			"- If search returns ambiguous=true with candidates, ask the user to pick the correct issue key (list up to 3).",
		);
		if (options.toolLines.includes("issue_get")) {
			toolSections.push(
				"- Use `issue_get` for specific issues when a key is provided.",
			);
		}
	}

	if (options.toolLines.includes("jira_search")) {
		toolSections.push(
			"- Use `jira_search` for Jira keyword queries, `jira_issue_get` for specific issues, `jira_sprint_issues` for sprints.",
		);
	}

	if (options.toolLines.includes("web_search")) {
		toolSections.push(
			"- Use `web_search` for up-to-date information (news, prices, public facts). Include a short Sources list with URLs.",
		);
	}

	if (options.toolLines.includes("firecrawl_")) {
		toolSections.push(
			"- Use Firecrawl tools for web research and source gathering; summarize findings and include a short Sources list with URLs.",
			"- For async Firecrawl tools (`firecrawl_crawl`, `firecrawl_batch_scrape`, `firecrawl_extract`), call `firecrawl_poll` until results are ready.",
			"- If the output is a list (companies/events/speakers) or the user requests a CSV, call `research_export_csv`.",
		);
	}

	if (options.toolLines.includes("browser_open")) {
		toolSections.push(
			"- Use browser tools (`browser_open`, `browser_snapshot`, `browser_click`, `browser_get`, `browser_screenshot`, `browser_state_save`, `browser_state_load`) for website checks, UI validation, and screenshots.",
			"- If `browser_open` returns `authRequired: true`, tell the user login is required and provide the `authUrl` so they can authenticate.",
			"- For authenticated sites, login once, then call `browser_state_save` and reuse it with `browser_state_load` to persist sessions.",
			"- Do not claim that HTML screenshots are unavailable; use `browser_screenshot` instead.",
		);
	}

	if (options.toolLines.includes("mermaid_render_svg")) {
		toolSections.push(
			"- For Mermaid diagrams, call `mermaid_render_svg` and respond with the rendered image only. Do not include image URLs unless the user explicitly asks for a link.",
			'- If the user asks for a diagram or says "mermaid", render it (do not reply with raw Mermaid code unless they explicitly ask for code).',
			"- Use `mermaid_render_ascii` only when the user wants plain-text diagrams.",
			"- Default theme is github-dark unless the user asks for a different theme.",
			"- Do not generate alternative diagram variants unless the user explicitly asks for another version.",
		);
	}

	if (options.toolLines.includes("ui_publish")) {
		toolSections.push(
			"- For UI mockups or interface requests, call `ui_publish` with a JSON tree and optional data.",
			"- Build any UI using the available catalog components; do not invent component names.",
			"- UI quality rules: use a distinctive display font plus a refined body font; avoid generic defaults. Use a cohesive palette with a dominant color and a sharp accent; avoid timid schemes. Include one signature element (hero, data viz, timeline, or unique card system). Allow asymmetry/overlap or a grid-break moment; avoid cookie-cutter layouts. Add atmosphere via subtle texture/pattern or depth (no flat default background). If unsure, choose a direction and execute it decisively rather than staying neutral.",
			"- Responsive layout rules: always design for desktop, tablet, and phone without asking; default to single-column on small screens; avoid horizontal stacks unless necessary; limit tables to 4–6 columns or use badges/short labels; keep headings and labels short; prefer compact charts with short labels.",
			"- The UI tree MUST be a flat spec with `root` and `elements` (no nested children objects).",
			"- Each element must be `{ type, props, children? }` and children is an array of element keys.",
			"- `visible` is a top-level element field, not inside props.",
			"- Use only the props listed in the UI catalog; do not invent props.",
			"- Actions support confirmation and callbacks: `{ name, params?, confirm?, onSuccess?, onError? }`.",
			"UI tree format:",
			"{\n  \"root\": \"root-key\",\n  \"elements\": {\n    \"root-key\": {\n      \"type\": \"Card\",\n      \"props\": { ... },\n      \"children\": [\"child-1\", \"child-2\"]\n    }\n  }\n}",
			"JSONL patch format (optional, SpecStream / RFC 6902):",
			"- Each line is a patch: {\"op\":\"add|remove|replace|move|copy|test\",\"path\":\"/root|/elements/<key>|/elements/<key>/props/...\",\"value\":...,\"from\":...}",
			"- Set root: {\"op\":\"add\",\"path\":\"/root\",\"value\":\"root-key\"}",
			"- Add element: {\"op\":\"add\",\"path\":\"/elements/<key>\",\"value\":{...element...}}",
			"- If using JSONL patches, pass them to `ui_publish` as `patches` (string with newlines); `tree` is optional.",
		);
		if (options.uiCatalogPrompt?.trim()) {
			toolSections.push(`UI catalog:\n${options.uiCatalogPrompt}`);
		}
	}

	if (options.toolLines.includes("subagent_")) {
		const usesOrchestrate = options.toolLines.includes("subagent_orchestrate");
		const instruction = usesOrchestrate
			? "- Use subagent tools for context-heavy tasks (research, codebase exploration, analytics). Prefer `subagent_orchestrate` to route and run multiple subagents in parallel when the right source is unclear. Otherwise, call `subagent_route` first, then call the suggested `subagent_*` tool with a clear task. Each tool returns a concise summary."
			: "- Use subagent tools for context-heavy tasks (research, codebase exploration, analytics). First call `subagent_route` to pick the right subagent, then call the suggested `subagent_*` tool with a clear task. The tool returns a concise summary.";
		toolSections.push(instruction);
	}

	if (
		options.toolLines.includes("memory_read") ||
		options.toolLines.includes("memory_append") ||
		options.toolLines.includes("memory_write") ||
		options.toolLines.includes("memory_search")
	) {
		toolSections.push(
			"- Use `memory_read` to recall, `memory_append` to store durable facts in memory/core.md, and `memory_search` to find older notes (memory/notes.md and daily logs).",
		);
	}

	if (options.toolLines.includes("wiki_page_get")) {
		toolSections.push(
			"- Use Yandex Wiki tools for docs: `wiki_page_get`/`wiki_page_get_by_id` to read, `wiki_page_create`/`wiki_page_update`/`wiki_page_append_content` to write.",
		);
	}

	if (options.toolLines.includes("figma_file_get")) {
		toolSections.push(
			"- Use Figma tools for design docs: `figma_file_get`/`figma_file_nodes_get` to read file structure, `figma_file_comments_list` for feedback, `figma_project_files_list` to list project files. If the user shares a figma.com link, extract file key/node id from the URL.",
		);
	}

	if (options.toolLines.includes("google_public_doc_read")) {
		toolSections.push(
			"- Use `google_public_doc_read`/`google_public_sheet_read`/`google_public_slides_read` for publicly shared Google Docs/Sheets/Slides links (no OAuth).",
		);
	}

	if (options.toolLines.includes("gemini_image_generate")) {
		toolSections.push(
			"- Use `gemini_image_generate` to create images from a text prompt. If the tool returns images, include a brief caption and mention the image is in the tool output.",
		);
	}

	if (
		options.toolLines.includes("posthog") ||
		options.toolLines.includes("insights") ||
		options.toolLines.includes("survey")
	) {
		toolSections.push(
			"- Use PostHog tools for analytics: insights, surveys, experiments, feature flags, dashboards.",
		);
	}

	if (
		options.toolLines.includes("cron_schedule") ||
		options.toolLines.includes("cron_list")
	) {
		toolSections.push(
			"- Use cron tools to schedule recurring reports or reminders. Ask for missing cadence/time/timezone; default timezone is Europe/Moscow, but confirm if user mentions a different location/timezone.",
		);
	}

	return toolSections;
}

export function buildToolInstructions(options: {
	toolLines: string;
	uiCatalogPrompt?: string;
}): string {
	const toolSections = buildToolSections(options);
	return [
		...toolSections,
		"",
		"Available tools:",
		options.toolLines || "(none)",
	].join("\n");
}

export function buildAgentInstructions(
	options: AgentInstructionOptions,
): string {
	const promptMode = options.promptMode ?? "full";
	const recentBlock = options.recentCandidates?.length
		? [
				"Recent candidates (most relevant first):",
				...options.recentCandidates
					.filter((item) => item.key)
					.map((item) =>
						`${item.key} — ${item.summary || "(no summary)"}`.trim(),
					),
				"",
				"Rule: If the user refers to these candidates, do NOT run yandex_tracker_search again.",
				"Instead, use issue_get and issue_get_comments for the candidate keys.",
				"",
			].join("\n")
		: "";

	const soulBlock = buildSoulBlock({
		globalSoul: options.globalSoul,
		channelSoul: options.channelSoul,
		systemPrompt: options.systemPrompt,
		workspaceSoul: options.workspaceSnapshot?.soul,
	});
	const projectContext = (options.projectContext ?? [])
		.map((entry) => ({
			path: entry.path?.trim() ?? "",
			content: entry.content?.trim() ?? "",
		}))
		.filter((entry) => entry.path && entry.content);
	const projectContextBlock = projectContext.length
		? [
				"# Project Context",
				"These files are injected to provide identity and workspace context.",
				"",
				...projectContext.flatMap((entry) => [
					`## ${entry.path}`,
					"",
					entry.content,
					"",
				]),
			].join("\n")
		: "";
	const workspaceBlock = buildWorkspaceBlock(options);
	const skillsPrompt = options.skillsPrompt?.trim();
	const skillsBlock = skillsPrompt
		? [
				"Skills (reference):",
				"Use the appropriate tools based on these skill areas.",
				skillsPrompt,
				"",
			].join("\n")
		: "";
	const timeBlock = options.currentDateTime?.trim()
		? ["Current Date & Time:", options.currentDateTime.trim(), ""].join(
				"\n",
			)
		: "";
	const runtimeBlock = options.runtimeLine?.trim()
		? ["Runtime:", options.runtimeLine.trim(), ""].join("\n")
		: "";

	const toolSections = buildToolSections({
		toolLines: options.toolLines,
		uiCatalogPrompt: options.uiCatalogPrompt,
	});

	if (promptMode === "none") {
		return `User: ${options.question}`;
	}

	if (promptMode === "minimal") {
		return [
			buildSystemPrompt({
				modelRef: options.modelRef,
				modelName: options.modelName,
				reasoning: options.reasoning,
			}),
			soulBlock ? `\n${soulBlock}` : "",
			workspaceBlock ? `\n${workspaceBlock}` : "",
			...toolSections,
			"",
			"Available tools:",
			options.toolLines || "(none)",
			"",
			`User: ${options.question}`,
		].join("\n");
	}

	return [
		buildSystemPrompt({
			modelRef: options.modelRef,
			modelName: options.modelName,
			reasoning: options.reasoning,
		}),
		soulBlock ? `\n${soulBlock}` : "",
		workspaceBlock ? `\n${workspaceBlock}` : "",
		...toolSections,
		"",
		"Available tools:",
		options.toolLines || "(none)",
		"",
		skillsBlock,
		timeBlock,
		runtimeBlock,
		projectContextBlock,
		options.history ?? "",
		options.userName ? `User name: ${options.userName}` : "",
		recentBlock,
		`User: ${options.question}`,
	].join("\n");
}

export type IssueInstructionOptions = {
	question: string;
	modelRef: string;
	modelName: string;
	reasoning: string;
	issueKey: string;
	issueText: string;
	commentsText: string;
	extraContext?: string;
	userName?: string;
	globalSoul?: string;
	channelSoul?: string;
	systemPrompt?: string;
};

export function buildIssueAgentInstructions(
	options: IssueInstructionOptions,
): string {
	const soulBlock = buildSoulBlock(options);
	return [
		buildSystemPrompt({
			modelRef: options.modelRef,
			modelName: options.modelName,
			reasoning: options.reasoning,
		}),
		soulBlock ? `\n${soulBlock}` : "",
		"Context:",
		`Issue key: ${options.issueKey}`,
		"Issue data (issue_get):",
		options.issueText || "(empty)",
		"Comments (issue_get_comments):",
		options.commentsText || "(empty)",
		options.extraContext ? "Additional context:" : "",
		options.extraContext ? options.extraContext : "",
		"Rules:",
		"- Use the provided issue data and comments to answer.",
		"- Do not ask for issue_id; it is already provided.",
		"- If price/status/terms are not present in data, say they are not recorded.",
		options.userName ? `User name: ${options.userName}` : "",
		`User: ${options.question}`,
	].join("\n");
}
