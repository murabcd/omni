import type { TextStore } from "../storage/text-store.js";
import { truncateText } from "../text/normalize.js";
import {
	memoryDailyPath,
	workspaceBaseKey,
	workspaceContextKey,
	workspaceFileKey,
} from "./paths.js";
import type {
	WorkspaceDefaults,
	WorkspaceFile,
	WorkspaceSnapshot,
} from "./types.js";

const WORKSPACE_FILES = {
	agents: "AGENTS.md",
	soul: "SOUL.md",
};

const MAX_DAILY_MEMORY_CHARS = 4000;
const MAX_CONTEXT_FILE_CHARS = 4000;

function formatDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function formatYesterday(date: Date): string {
	const copy = new Date(date);
	copy.setUTCDate(copy.getUTCDate() - 1);
	return formatDate(copy);
}

async function ensureFile(
	store: TextStore,
	key: string,
	content: string,
): Promise<boolean> {
	const existing = await store.getText(key);
	if (existing != null) return false;
	await store.putText(key, content);
	return true;
}

export type WorkspaceManager = {
	ensureDefaults: (workspaceId: string) => Promise<void>;
	readFile: (workspaceId: string, path: string) => Promise<string | null>;
	writeFile: (
		workspaceId: string,
		path: string,
		content: string,
	) => Promise<void>;
	appendFile: (
		workspaceId: string,
		path: string,
		content: string,
	) => Promise<void>;
	loadSnapshot: (workspaceId: string, now?: Date) => Promise<WorkspaceSnapshot>;
	listContextFiles: (workspaceId: string) => Promise<WorkspaceFile[]>;
};

export function createWorkspaceManager(params: {
	store: TextStore;
	defaults: WorkspaceDefaults;
	logger?: (event: {
		event: string;
		workspaceId: string;
		key?: string;
	}) => void;
}): WorkspaceManager {
	const store = params.store;
	const defaults = params.defaults;
	const logger = params.logger;

	const ensureDefaults = async (workspaceId: string) => {
		const baseKey = workspaceBaseKey(workspaceId);
		if (defaults.agents) {
			const key = workspaceFileKey(workspaceId, WORKSPACE_FILES.agents);
			if (await ensureFile(store, key, defaults.agents)) {
				logger?.({ event: "workspace_seed_agents", workspaceId, key });
			}
		}
		if (defaults.soul) {
			const key = workspaceFileKey(workspaceId, WORKSPACE_FILES.soul);
			if (await ensureFile(store, key, defaults.soul)) {
				logger?.({ event: "workspace_seed_soul", workspaceId, key });
			}
		}
		for (const file of defaults.contextFiles ?? []) {
			const key = workspaceContextKey(workspaceId, file.path);
			if (await ensureFile(store, key, file.content)) {
				logger?.({ event: "workspace_seed_context", workspaceId, key });
			}
		}
		logger?.({ event: "workspace_ready", workspaceId, key: baseKey });
	};

	const readFile = async (workspaceId: string, path: string) => {
		const key = workspaceFileKey(workspaceId, path);
		return store.getText(key);
	};

	const writeFile = async (
		workspaceId: string,
		path: string,
		content: string,
	) => {
		const key = workspaceFileKey(workspaceId, path);
		await store.putText(key, content);
	};

	const appendFile = async (
		workspaceId: string,
		path: string,
		content: string,
	) => {
		const key = workspaceFileKey(workspaceId, path);
		await store.appendText(key, content);
	};

	const listContextFiles = async (workspaceId: string) => {
		const baseKey = `${workspaceBaseKey(workspaceId)}/context/`;
		const keys = await store.list(baseKey);
		const files: WorkspaceFile[] = [];
		for (const key of keys) {
			const content = await store.getText(key);
			if (!content) continue;
			const relPath = key.replace(`${baseKey}`, "");
			files.push({
				path: relPath,
				content: truncateText(content, MAX_CONTEXT_FILE_CHARS),
			});
		}
		return files;
	};

	const loadSnapshot = async (
		workspaceId: string,
		now: Date = new Date(),
	): Promise<WorkspaceSnapshot> => {
		await ensureDefaults(workspaceId);
		const today = memoryDailyPath(formatDate(now));
		const yesterday = memoryDailyPath(formatYesterday(now));
		const [agents, soul, memoryToday, memoryYesterday, contextFiles] =
			await Promise.all([
				readFile(workspaceId, WORKSPACE_FILES.agents),
				readFile(workspaceId, WORKSPACE_FILES.soul),
				readFile(workspaceId, today),
				readFile(workspaceId, yesterday),
				listContextFiles(workspaceId),
			]);
		return {
			agents: agents?.trim() || undefined,
			soul: soul?.trim() || undefined,
			memoryToday: memoryToday
				? truncateText(memoryToday.trim(), MAX_DAILY_MEMORY_CHARS)
				: undefined,
			memoryYesterday: memoryYesterday
				? truncateText(memoryYesterday.trim(), MAX_DAILY_MEMORY_CHARS)
				: undefined,
			memoryTodayPath: today,
			memoryYesterdayPath: yesterday,
			contextFiles,
		};
	};

	return {
		ensureDefaults,
		readFile,
		writeFile,
		appendFile,
		loadSnapshot,
		listContextFiles,
	};
}

export const WorkspacePaths = WORKSPACE_FILES;
