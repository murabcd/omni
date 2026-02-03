import type { ImageStore, StoredImage } from "../../bot/src/lib/image-store.js";

type WorkerImageStoreConfig = {
	baseUrl: string;
	secret: string;
	timeoutMs: number;
};

async function callWorker<T>(
	config: WorkerImageStoreConfig,
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
				`worker_image_error:${response.status}:${response.statusText}:${text}`,
			);
		}
		if (!text.trim()) return {} as T;
		return JSON.parse(text) as T;
	} finally {
		clearTimeout(timeout);
	}
}

export function createWorkerImageStore(
	config: WorkerImageStoreConfig,
): ImageStore {
	const baseUrl = config.baseUrl.replace(/\/+$/, "");
	const resolved = { ...config, baseUrl };

	return {
		putImage: async (params) => {
			const payload = await callWorker<StoredImage>(
				resolved,
				"/tool-media/upload",
				{
					mediaType: params.mediaType,
					filename: params.filename,
					chatId: params.chatId,
					userId: params.userId,
					dataBase64: Buffer.from(params.buffer).toString("base64"),
				},
			);
			return payload;
		},
	};
}
