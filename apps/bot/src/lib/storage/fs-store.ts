import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { TextStore } from "./text-store.js";

type FsStoreOptions = {
	baseDir: string;
};

async function ensureDir(filePath: string) {
	const dir = path.dirname(filePath);
	await fs.mkdir(dir, { recursive: true });
}

export function createFsTextStore(options: FsStoreOptions): TextStore {
	const baseDir = options.baseDir;
	const resolvePath = (key: string) => path.join(baseDir, key);

	return {
		getText: async (key) => {
			try {
				return await fs.readFile(resolvePath(key), "utf8");
			} catch {
				return null;
			}
		},
		putText: async (key, text) => {
			const filePath = resolvePath(key);
			await ensureDir(filePath);
			await fs.writeFile(filePath, text, "utf8");
		},
		appendText: async (key, text, options) => {
			const filePath = resolvePath(key);
			await ensureDir(filePath);
			const separator = options?.separator ?? "\n";
			let existing = "";
			try {
				existing = await fs.readFile(filePath, "utf8");
			} catch {
				// ignore missing file
			}
			const next = existing
				? `${existing}${existing.endsWith("\n") ? "" : separator}${text}`
				: text;
			await fs.writeFile(filePath, next, "utf8");
		},
		list: async (prefix) => {
			const resolvedPrefix = resolvePath(prefix);
			const results: string[] = [];
			const walk = async (dir: string, relBase: string) => {
				let entries: Dirent[];
				try {
					entries = await fs.readdir(dir, { withFileTypes: true });
				} catch {
					return;
				}
				for (const entry of entries) {
					const fullPath = path.join(dir, entry.name);
					const relPath = path.join(relBase, entry.name);
					if (entry.isDirectory()) {
						await walk(fullPath, relPath);
					} else {
						results.push(relPath);
					}
				}
			};
			await walk(resolvedPrefix, prefix);
			return results;
		},
		delete: async (key) => {
			try {
				await fs.unlink(resolvePath(key));
			} catch {
				// ignore missing file
			}
		},
	};
}
