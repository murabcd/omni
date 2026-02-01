import type { CandidateIssue } from "../context/chat-state-types.js";
import { buildSystemPrompt } from "./system-prompt.js";

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
		? ["Current Date & Time:", options.currentDateTime.trim(), ""].join("\n")
		: "";
	const runtimeBlock = options.runtimeLine?.trim()
		? ["Runtime:", options.runtimeLine.trim(), ""].join("\n")
		: "";

	const toolSections: string[] = [
		"Tool Use:",
		"- Use the appropriate tool for the task. Summarize results in Russian and do not invent facts.",
		"- If a tool is blocked with approval_required, ask the user to run /approve <tool> and retry.",
		"- Always include required params for each tool.",
	];

	if (options.toolLines.includes("yandex_tracker_search")) {
		toolSections.push(
			"- Use `yandex_tracker_search` for Yandex Tracker keyword queries, `issue_get` for specific issues.",
			"- If search returns ambiguous=true with candidates, ask the user to pick the correct issue key (list up to 3).",
		);
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
			"- Use browser tools (`browser_open`, `browser_snapshot`, `browser_click`, `browser_get`, `browser_screenshot`) for website checks, UI validation, and screenshots.",
			"- Do not claim that HTML screenshots are unavailable; use `browser_screenshot` instead.",
		);
	}

	if (
		options.toolLines.includes("memory_read") ||
		options.toolLines.includes("memory_append") ||
		options.toolLines.includes("memory_write") ||
		options.toolLines.includes("memory_search")
	) {
		toolSections.push(
			"- Use `memory_read` to recall, `memory_append` to store durable facts, and `memory_search` to find older notes.",
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
