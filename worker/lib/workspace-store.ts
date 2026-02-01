import type { R2Bucket } from "@cloudflare/workers-types";
import type { TextStore } from "../../apps/bot/src/lib/storage/text-store.js";

export function createR2TextStore(bucket: R2Bucket): TextStore {
	return {
		getText: async (key) => {
			const obj = await bucket.get(key);
			if (!obj) return null;
			return obj.text();
		},
		putText: async (key, text, options) => {
			await bucket.put(key, text, {
				httpMetadata: {
					contentType: options?.contentType ?? "text/plain; charset=utf-8",
				},
			});
		},
		appendText: async (key, text, options) => {
			const existing = await bucket.get(key);
			const existingText = existing ? await existing.text() : "";
			const separator = options?.separator ?? "\n";
			const next = existingText
				? `${existingText}${existingText.endsWith("\n") ? "" : separator}${text}`
				: text;
			await bucket.put(key, next, {
				httpMetadata: { contentType: "text/plain; charset=utf-8" },
			});
		},
		list: async (prefix) => {
			const keys: string[] = [];
			let cursor: string | undefined;
			let truncated = true;
			while (truncated) {
				const result = await bucket.list({ prefix, cursor });
				for (const object of result.objects) {
					keys.push(object.key);
				}
				truncated = result.truncated;
				if (truncated && "cursor" in result) {
					cursor = result.cursor;
				} else {
					cursor = undefined;
				}
			}
			return keys;
		},
		delete: async (key) => {
			await bucket.delete(key);
		},
	};
}
