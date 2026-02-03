import type { TextStore } from "./text-store.js";

type WorkerTextStoreConfig = {
	baseUrl: string;
	secret: string;
	timeoutMs: number;
};

async function callWorker<T>(
	config: WorkerTextStoreConfig,
	path: string,
	body: Record<string, unknown>,
): Promise<T> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
	try {
		const response = await fetch(`${config.baseUrl}${path}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-omni-tool-secret": config.secret,
			},
			body: JSON.stringify(body),
			signal: controller.signal,
		});
		const text = await response.text();
		if (!response.ok) {
			throw new Error(
				`worker_store_error:${response.status}:${response.statusText}:${text}`,
			);
		}
		if (!text.trim()) return {} as T;
		return JSON.parse(text) as T;
	} finally {
		clearTimeout(timeout);
	}
}

export function createWorkerTextStore(
	config: WorkerTextStoreConfig,
): TextStore {
	const baseUrl = config.baseUrl.replace(/\/+$/, "");
	const resolved = { ...config, baseUrl };

	return {
		getText: async (key) => {
			const payload = await callWorker<{ text?: string | null }>(
				resolved,
				"/tool-storage/get",
				{ key },
			);
			return payload?.text ?? null;
		},
		putText: async (key, text, options) => {
			await callWorker(resolved, "/tool-storage/put", {
				key,
				text,
				contentType: options?.contentType,
			});
		},
		appendText: async (key, text, options) => {
			await callWorker(resolved, "/tool-storage/append", {
				key,
				text,
				separator: options?.separator,
			});
		},
		list: async (prefix) => {
			const payload = await callWorker<{ keys?: string[] }>(
				resolved,
				"/tool-storage/list",
				{ prefix },
			);
			return Array.isArray(payload?.keys) ? payload.keys : [];
		},
		delete: async (key) => {
			await callWorker(resolved, "/tool-storage/delete", { key });
		},
	};
}
