import type { WorkspaceDefaults, WorkspaceFile } from "./types.js";

const DEFAULT_AGENTS = [
	"# AGENTS.md",
	"",
	"You are Omni — a personal assistant.",
	"",
	"Rules:",
	"- Read context from AGENTS.md and SOUL.md.",
	"- Put durable facts in memory/core.md and details in memory/notes.md.",
	"- Put current notes in memory/YYYY-MM-DD.md.",
	"- If you change AGENTS.md or SOUL.md, tell the user.",
].join("\n");

export function buildWorkspaceDefaults(params?: {
	soul?: string;
	projectContext?: WorkspaceFile[];
	agents?: string;
}): WorkspaceDefaults {
	const contextFiles =
		params?.projectContext?.filter((entry) => entry.path && entry.content) ??
		[];
	return {
		agents: params?.agents?.trim() || DEFAULT_AGENTS,
		soul: params?.soul?.trim() || "",
		contextFiles,
	};
}
