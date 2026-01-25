import { describe, expect, it } from "vitest";

import {
	authorizeGatewayToken,
	buildAdminStatusPayload,
} from "../lib/gateway.js";
import { abortStream, registerStreamAbort } from "../index.js";

describe("gateway helpers", () => {
	it("denies when token missing", () => {
		const allowed = authorizeGatewayToken({
			token: "",
			expectedToken: "secret",
		});
		expect(allowed).toBe(false);
	});

	it("denies when token mismatch", () => {
		const allowed = authorizeGatewayToken({
			token: "nope",
			expectedToken: "secret",
		});
		expect(allowed).toBe(false);
	});

	it("allows with correct token and no allowlist", () => {
		const allowed = authorizeGatewayToken({
			token: "secret",
			expectedToken: "secret",
		});
		expect(allowed).toBe(true);
	});

	it("enforces allowlist when provided", () => {
		const allowed = authorizeGatewayToken({
			token: "secret",
			expectedToken: "secret",
			allowlist: "1.1.1.1,2.2.2.2",
			clientIp: "2.2.2.2",
		});
		expect(allowed).toBe(true);
		const denied = authorizeGatewayToken({
			token: "secret",
			expectedToken: "secret",
			allowlist: "1.1.1.1,2.2.2.2",
			clientIp: "3.3.3.3",
		});
		expect(denied).toBe(false);
	});

	it("builds status payload with defaults", () => {
		const payload = buildAdminStatusPayload({
			env: {},
			uptimeSeconds: 12,
		});
		expect(payload.serviceName).toBe("omni");
		expect(payload.uptimeSeconds).toBe(12);
		expect(payload.summary.model).toBe("gpt-5.2");
	});

	it("aborts streaming runs", () => {
		const registry = new Map<string, AbortController>();
		const controller = registerStreamAbort(registry, "stream-1");
		expect(controller.signal.aborted).toBe(false);
		expect(abortStream(registry, "stream-1")).toBe(true);
		expect(controller.signal.aborted).toBe(true);
		expect(abortStream(registry, "stream-1")).toBe(false);
	});
});
