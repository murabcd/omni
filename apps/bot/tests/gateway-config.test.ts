import { describe, expect, it } from "vitest";
import {
	applyGatewayConfig,
	buildGatewayConfigSnapshot,
	sanitizeGatewayConfig,
} from "../src/lib/gateway/config.js";

describe("gateway config helpers", () => {
	it("sanitizes config to known string keys", () => {
		const input = {
			ALLOWED_TG_IDS: "1,2",
			UNKNOWN: "nope",
			CRON_STATUS_ENABLED: 1,
		};
		const sanitized = sanitizeGatewayConfig(input);
		expect(sanitized).toEqual({ ALLOWED_TG_IDS: "1,2" });
	});

	it("applies only non-empty config values", () => {
		const env = { CRON_STATUS_TIMEZONE: "Europe/Moscow" };
		const config = { CRON_STATUS_TIMEZONE: "" };
		const applied = applyGatewayConfig(env, config);
		expect(applied.CRON_STATUS_TIMEZONE).toBe("Europe/Moscow");
	});

	it("overrides env values when config is set", () => {
		const env = { CRON_STATUS_TIMEZONE: "Europe/Moscow" };
		const config = { CRON_STATUS_TIMEZONE: "America/New_York" };
		const applied = applyGatewayConfig(env, config);
		expect(applied.CRON_STATUS_TIMEZONE).toBe("America/New_York");
	});

	it("builds snapshot with env defaults when config missing", () => {
		const env = { CRON_STATUS_TIMEZONE: "Europe/Moscow" };
		const config = {};
		const snapshot = buildGatewayConfigSnapshot(env, config);
		expect(snapshot.CRON_STATUS_TIMEZONE).toBe("Europe/Moscow");
	});
});
