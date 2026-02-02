import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createBot } from "./bot.js";
import { createFsTextStore } from "./lib/storage/fs-store.js";
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
	workspaceStore: createFsTextStore({ baseDir: "data/workspace" }),
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

bot.start({ allowed_updates: allowedUpdates });
