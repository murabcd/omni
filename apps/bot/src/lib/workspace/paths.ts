const WORKSPACE_ROOT = "workspaces";

function sanitizeKeyPart(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return "unknown";
	return trimmed.replace(/[^\w.-]+/g, "_");
}

export function resolveWorkspaceId(value?: string): string {
	return sanitizeKeyPart(value ?? "");
}

export function workspaceBaseKey(workspaceId: string): string {
	return `${WORKSPACE_ROOT}/${resolveWorkspaceId(workspaceId)}`;
}

export function workspaceFileKey(
	workspaceId: string,
	filePath: string,
): string {
	const normalized = filePath.replace(/^\/+/, "");
	return `${workspaceBaseKey(workspaceId)}/${normalized}`;
}

export function workspaceContextKey(
	workspaceId: string,
	filePath: string,
): string {
	const normalized = filePath.replace(/^\/+/, "");
	return `${workspaceBaseKey(workspaceId)}/context/${normalized}`;
}

export function memoryDailyPath(date: string): string {
	return `memory/${date}.md`;
}

export function sessionHistoryKey(
	workspaceId: string,
	sessionKey: string,
): string {
	const safeSession = sanitizeKeyPart(sessionKey);
	return `${workspaceBaseKey(workspaceId)}/sessions/${safeSession}.jsonl`;
}
