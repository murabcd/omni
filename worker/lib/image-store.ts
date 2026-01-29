import { createHmac } from "crypto";
import type { R2Bucket } from "@cloudflare/workers-types";
import type {
	ImageStore,
	StoredImage,
} from "../../apps/bot/src/lib/image-store.js";

type CreateImageStoreOptions = {
	bucket: R2Bucket;
	baseUrl?: string;
	signingSecret: string;
	retentionDays: number;
	urlTtlMs?: number;
};

function resolveImageExtension(mediaType: string) {
	switch (mediaType) {
		case "image/jpeg":
			return "jpg";
		case "image/png":
			return "png";
		case "image/webp":
			return "webp";
		case "image/gif":
			return "gif";
		default:
			return "png";
	}
}

function pad2(value: number) {
	return value.toString().padStart(2, "0");
}

function buildDatePrefix(date: Date) {
	const year = date.getUTCFullYear();
	const month = pad2(date.getUTCMonth() + 1);
	const day = pad2(date.getUTCDate());
	return `${year}/${month}/${day}`;
}

function signImageUrl(secret: string, key: string, exp: number) {
	return createHmac("sha256", secret).update(`${key}:${exp}`).digest("hex");
}

export function createR2ImageStore(options: CreateImageStoreOptions): ImageStore {
	const { bucket, signingSecret, retentionDays } = options;
	const baseUrl = options.baseUrl?.replace(/\/$/, "") ?? "";
	const urlTtlMs =
		options.urlTtlMs ?? Math.max(1, retentionDays) * 24 * 60 * 60 * 1000;

	return {
		async putImage(params): Promise<StoredImage> {
			const now = Date.now();
			const expiresAt =
				now + Math.max(1, retentionDays) * 24 * 60 * 60 * 1000;
			const ext = resolveImageExtension(params.mediaType);
			const datePrefix = buildDatePrefix(new Date(now));
			const key = `images/${datePrefix}/${crypto.randomUUID()}.${ext}`;
			await bucket.put(key, params.buffer, {
				httpMetadata: { contentType: params.mediaType },
				customMetadata: {
					createdAt: String(now),
					expiresAt: String(expiresAt),
					mediaType: params.mediaType,
					filename: params.filename ?? "",
					chatId: params.chatId ?? "",
					userId: params.userId ?? "",
				},
			});
			const exp = now + urlTtlMs;
			const sig = signImageUrl(signingSecret, key, exp);
			const path = `/media/${encodeURIComponent(key)}?exp=${exp}&sig=${sig}`;
			const url = baseUrl ? `${baseUrl}${path}` : path;
			return {
				key,
				url,
				mediaType: params.mediaType,
				filename: params.filename,
				expiresAt,
			};
		},
	};
}

export async function deleteByPrefix(bucket: R2Bucket, prefix: string) {
	let cursor: string | undefined;
	while (true) {
		const listed = await bucket.list({ prefix, cursor });
		const keys = listed.objects.map((object) => object.key);
		if (keys.length > 0) {
			await bucket.delete(keys);
		}
		if (!listed.truncated) break;
		cursor = listed.cursor;
	}
}

export async function cleanupExpiredImagePrefixes(params: {
	bucket: R2Bucket;
	retentionDays: number;
	lookbackDays?: number;
}) {
	const lookbackDays = params.lookbackDays ?? 365;
	const today = new Date();
	for (let offset = params.retentionDays; offset <= lookbackDays; offset += 1) {
		const target = new Date(
			Date.UTC(
				today.getUTCFullYear(),
				today.getUTCMonth(),
				today.getUTCDate() - offset,
			),
		);
		const prefix = `images/${buildDatePrefix(target)}/`;
		await deleteByPrefix(params.bucket, prefix);
	}
}

export function verifyImageSignature(params: {
	signingSecret: string;
	key: string;
	exp: number;
	sig: string;
}) {
	const expected = signImageUrl(params.signingSecret, params.key, params.exp);
	return expected === params.sig;
}
