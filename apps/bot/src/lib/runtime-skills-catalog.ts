import type { RuntimeSkill } from "../skills-core.js";
import { POSTHOG_READONLY_TOOL_NAMES } from "./posthog-tools.js";

export function buildBuiltinRuntimeSkills(): RuntimeSkill[] {
	const skills: RuntimeSkill[] = [
		{
			name: "web_search",
			description: "Search the web for up-to-date information.",
			tool: "web.web_search",
		},
		{
			name: "jira_search",
			description: "Search Jira issues in a project.",
			tool: "jira.jira_search",
		},
		{
			name: "jira_sprint_issues",
			description: "List Jira issues for a sprint by name or id.",
			tool: "jira.jira_sprint_issues",
		},
		{
			name: "jira_issues_find",
			description: "Search Jira issues using JQL.",
			tool: "jira.jira_issues_find",
		},
		{
			name: "jira_issue_get",
			description: "Get Jira issue by key (e.g., FL-123).",
			tool: "jira.jira_issue_get",
		},
		{
			name: "jira_issue_get_comments",
			description: "Get comments for a Jira issue by key.",
			tool: "jira.jira_issue_get_comments",
		},
		{
			name: "memory_read",
			description: "Read a memory file.",
			tool: "memory.memory_read",
		},
		{
			name: "memory_append",
			description: "Append text to a memory file.",
			tool: "memory.memory_append",
		},
		{
			name: "memory_search",
			description: "Search memory files for a query string.",
			tool: "memory.memory_search",
		},
		{
			name: "memory_write",
			description: "Replace a memory file.",
			tool: "memory.memory_write",
		},
		{
			name: "session_history",
			description: "Read recent conversation history.",
			tool: "memory.session_history",
		},
	];

	for (const name of POSTHOG_READONLY_TOOL_NAMES) {
		skills.push({
			name,
			description: "PostHog read-only tool",
			tool: `posthog.${name}`,
		});
	}

	return skills;
}
