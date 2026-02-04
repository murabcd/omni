import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createBot } from "./bot.js";
import { createFsTextStore } from "./lib/storage/fs-store.js";
import { createWorkerImageStore } from "./lib/storage/worker-image-store.js";
import { createWorkerTextStore } from "./lib/storage/worker-text-store.js";
import { buildWorkspaceDefaults } from "./lib/workspace/defaults.js";
import { loadModelsConfig } from "./models.js";
import { loadSkills } from "./skills.js";

dotenv.config();

const modelsConfig = await loadModelsConfig();
const runtimeSkills = await loadSkills();

const DEBUG_LOG_FILE = process.env.DEBUG_LOG_FILE ?? "";
const SOUL_FILE_PATH = path.resolve("config/SOUL.md");
const PROJECT_CONTEXT_ENV = process.env.PROJECT_CONTEXT;
const PROJECT_CONTEXT_FILES = ["config/SOUL.md"];
const TOOL_SERVICE_SECRET = process.env.TOOL_SERVICE_SECRET ?? "";
const WORKER_STORAGE_URL = process.env.WORKER_STORAGE_URL ?? "";
const WORKER_STORAGE_TIMEOUT_MS = Number.parseInt(
	process.env.WORKER_STORAGE_TIMEOUT_MS ?? "20000",
	10,
);
const WORKER_MEDIA_URL = process.env.WORKER_MEDIA_URL ?? WORKER_STORAGE_URL;
const WORKER_MEDIA_TIMEOUT_MS = Number.parseInt(
	process.env.WORKER_MEDIA_TIMEOUT_MS ?? "20000",
	10,
);

try {
	const soul = fs.readFileSync(SOUL_FILE_PATH, "utf8").trim();
	if (soul) {
		process.env.SOUL_PROMPT = `${soul}\n`;
	}
} catch {
	// ignore missing SOUL.md in local dev
}

if (!PROJECT_CONTEXT_ENV) {
	const entries: Array<{ path: string; content: string }> = [];
	for (const filePath of PROJECT_CONTEXT_FILES) {
		try {
			const content = fs.readFileSync(path.resolve(filePath), "utf8").trim();
			if (content) {
				entries.push({ path: filePath, content });
			}
		} catch {
			// ignore missing context files in local dev
		}
	}
	if (entries.length > 0) {
		process.env.PROJECT_CONTEXT = JSON.stringify(entries);
	}
}

function parseProjectContext(raw: string | undefined) {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function createDebugAppender(filePath: string) {
	if (!filePath) return undefined;
	return (line: string) => {
		try {
			const fullPath = path.isAbsolute(filePath)
				? filePath
				: path.join(process.cwd(), filePath);
			fs.appendFileSync(fullPath, `${line}\n`);
		} catch {
			// ignore log file errors to avoid breaking runtime
		}
	};
}

const onDebugLog = createDebugAppender(DEBUG_LOG_FILE);

const workspaceStore =
	WORKER_STORAGE_URL && TOOL_SERVICE_SECRET
		? createWorkerTextStore({
				baseUrl: WORKER_STORAGE_URL,
				secret: TOOL_SERVICE_SECRET,
				timeoutMs:
					Number.isFinite(WORKER_STORAGE_TIMEOUT_MS) &&
					WORKER_STORAGE_TIMEOUT_MS > 0
						? WORKER_STORAGE_TIMEOUT_MS
						: 20000,
			})
		: createFsTextStore({ baseDir: "data/workspace" });
const imageStore =
	WORKER_MEDIA_URL && TOOL_SERVICE_SECRET
		? createWorkerImageStore({
				baseUrl: WORKER_MEDIA_URL,
				secret: TOOL_SERVICE_SECRET,
				timeoutMs:
					Number.isFinite(WORKER_MEDIA_TIMEOUT_MS) &&
					WORKER_MEDIA_TIMEOUT_MS > 0
						? WORKER_MEDIA_TIMEOUT_MS
						: 20000,
			})
		: undefined;

const localSessions = new Map<string, { timeZone?: string }>();
const sessionClient = {
	get: async ({ key }: { key: string }) => {
		return { entry: localSessions.get(key) };
	},
	patch: async ({
		key,
		timeZone,
	}: {
		key: string;
		timeZone?: string | null;
	}) => {
		const entry = localSessions.get(key) ?? {};
		if (timeZone == null) {
			delete entry.timeZone;
		} else {
			entry.timeZone = timeZone;
		}
		localSessions.set(key, entry);
		return { ok: true, entry };
	},
};

const { bot, allowedUpdates } = await createBot({
	env: process.env,
	modelsConfig,
	runtimeSkills,
	getUptimeSeconds: () => process.uptime(),
	onDebugLog,
	sessionClient,
	workspaceStore,
	imageStore,
	uiPublishUrl: process.env.UI_PUBLISH_URL,
	uiPublishToken: process.env.UI_PUBLISH_TOKEN,
	workspaceDefaults: buildWorkspaceDefaults({
		soul: process.env.SOUL_PROMPT,
		projectContext: parseProjectContext(process.env.PROJECT_CONTEXT),
	}),
});

process.once("SIGINT", () => {
	bot.stop();
});
process.once("SIGTERM", () => {
	bot.stop();
});

let stopRequested = false;
process.once("SIGINT", () => {
	stopRequested = true;
});
process.once("SIGTERM", () => {
	stopRequested = true;
});

function isGetUpdatesConflict(error: unknown) {
	if (!error || typeof error !== "object") return false;
	const typed = error as {
		error_code?: number;
		errorCode?: number;
		description?: string;
		method?: string;
		message?: string;
	};
	const code = typed.error_code ?? typed.errorCode;
	if (code !== 409) return false;
	const haystack = [typed.description, typed.method, typed.message]
		.filter((value): value is string => typeof value === "string")
		.join(" ")
		.toLowerCase();
	return haystack.includes("getupdates") || haystack.includes("conflict");
}

function isNetworkError(error: unknown) {
	const message =
		error && typeof error === "object" && "message" in error
			? String((error as { message?: unknown }).message ?? "")
			: String(error ?? "");
	const lower = message.toLowerCase();
	return (
		lower.includes("network") ||
		lower.includes("timeout") ||
		lower.includes("socket") ||
		lower.includes("econnreset") ||
		lower.includes("econnrefused") ||
		lower.includes("fetch failed")
	);
}

async function sleep(ms: number) {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoff(attempt: number) {
	const initialMs = 2000;
	const maxMs = 30_000;
	const factor = 1.8;
	const jitter = 0.25;
	const base = Math.min(maxMs, initialMs * factor ** Math.max(0, attempt - 1));
	const jittered = base * (1 + (Math.random() * 2 - 1) * jitter);
	return Math.max(0, Math.round(jittered));
}

async function startBotWithRetry() {
	let attempts = 0;
	while (!stopRequested) {
		try {
			await bot.start({ allowed_updates: allowedUpdates });
			return;
		} catch (error) {
			if (stopRequested) return;
			if (!isGetUpdatesConflict(error) && !isNetworkError(error)) {
				throw error;
			}
			attempts += 1;
			const delayMs = computeBackoff(attempts);
			console.error(
				`[bot] polling error: ${String(error)}; retrying in ${delayMs}ms`,
			);
			await sleep(delayMs);
		}
	}
}

await startBotWithRetry();
