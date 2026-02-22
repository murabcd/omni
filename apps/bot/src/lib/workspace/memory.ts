import path from "node:path";
import { memoryDailyPath } from "./paths.js";

const MEMORY_DIR = "memory/";
const CORE_MEMORY = "memory/core.md";
const NOTES_MEMORY = "memory/notes.md";
const CONVERSATIONS_MEMORY = "memory/conversations.jsonl";

function formatDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function stripLeadingSlashes(value: string): string {
	let next = value;
	while (next.startsWith("/")) next = next.slice(1);
	return next;
}

function normalizeMemoryPath(value: string): string {
	const normalized = path.posix.normalize(
		stripLeadingSlashes(value.replaceAll("\\", "/")),
	);
	return normalized === "." ? "" : normalized;
}

export function resolveMemoryPath(
	input: string | undefined,
	now: Date,
): string {
	const trimmed = (input ?? "").trim();
	const normalized = normalizeMemoryPath(trimmed);
	const lower = normalized.toLowerCase();
	if (!lower) return memoryDailyPath(formatDate(now));
	if (lower === "memory" || lower === "memory/") {
		return memoryDailyPath(formatDate(now));
	}
	if (lower === "today") {
		return memoryDailyPath(formatDate(now));
	}
	if (lower === "yesterday") {
		const copy = new Date(now);
		copy.setUTCDate(copy.getUTCDate() - 1);
		return memoryDailyPath(formatDate(copy));
	}
	if (lower === "memory/today") {
		return memoryDailyPath(formatDate(now));
	}
	if (lower === "memory/yesterday") {
		const copy = new Date(now);
		copy.setUTCDate(copy.getUTCDate() - 1);
		return memoryDailyPath(formatDate(copy));
	}
	if (lower === "core" || lower === "core.md" || lower === CORE_MEMORY) {
		return CORE_MEMORY;
	}
	if (lower === "memory/core") {
		return CORE_MEMORY;
	}
	if (lower === "notes" || lower === "notes.md" || lower === NOTES_MEMORY) {
		return NOTES_MEMORY;
	}
	if (lower === "memory/notes") {
		return NOTES_MEMORY;
	}
	if (
		lower === "conversations" ||
		lower === "conversations.jsonl" ||
		lower === CONVERSATIONS_MEMORY
	) {
		return CONVERSATIONS_MEMORY;
	}
	if (lower === "memory/conversations") {
		return CONVERSATIONS_MEMORY;
	}
	return normalized;
}

export function isAllowedMemoryPath(path: string): boolean {
	return normalizeMemoryPath(path).startsWith(MEMORY_DIR);
}
