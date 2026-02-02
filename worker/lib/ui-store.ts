import { createHmac } from "crypto";

const UI_PREFIX = "ui";

function signUiUrl(secret: string, key: string, exp: number) {
	return createHmac("sha256", secret).update(`${key}:${exp}`).digest("hex");
}

export function buildUiKey(id: string) {
	return `${UI_PREFIX}/${id}.json`;
}

export function buildUiPreviewUrl(params: {
	baseUrl: string;
	signingSecret: string;
	id: string;
	ttlMs: number;
}) {
	const { baseUrl, signingSecret, id, ttlMs } = params;
	const now = Date.now();
	const exp = now + ttlMs;
	const key = buildUiKey(id);
	const sig = signUiUrl(signingSecret, key, exp);
	const path = `/ui/${encodeURIComponent(id)}?exp=${exp}&sig=${sig}`;
	const trimmedBase = baseUrl.replace(/\/$/, "");
	return `${trimmedBase}${path}`;
}

export function verifyUiSignature(params: {
	signingSecret: string;
	id: string;
	exp: number;
	sig: string;
}) {
	const key = buildUiKey(params.id);
	const expected = signUiUrl(params.signingSecret, key, params.exp);
	return expected === params.sig;
}
