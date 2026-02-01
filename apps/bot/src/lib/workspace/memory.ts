import { memoryDailyPath } from "./paths.js";

const MEMORY_DIR = "memory/";

function formatDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export function resolveMemoryPath(
	input: string | undefined,
	now: Date,
): string {
	const trimmed = (input ?? "").trim().replace(/^\/+/, "");
	if (!trimmed) return memoryDailyPath(formatDate(now));
	if (trimmed === "memory" || trimmed === "memory/") {
		return memoryDailyPath(formatDate(now));
	}
	if (trimmed.toLowerCase() === "today") {
		return memoryDailyPath(formatDate(now));
	}
	if (trimmed.toLowerCase() === "yesterday") {
		const copy = new Date(now);
		copy.setUTCDate(copy.getUTCDate() - 1);
		return memoryDailyPath(formatDate(copy));
	}
	return trimmed;
}

export function isAllowedMemoryPath(path: string): boolean {
	return path.startsWith(MEMORY_DIR);
}
