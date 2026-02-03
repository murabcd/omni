import type { BotContext } from "../bot/types.js";
import { buildSessionKey } from "../context/session-key.js";
import type { Logger } from "../logger.js";

export type ToolServiceClient = {
	callTool: (params: {
		tool: string;
		input: Record<string, unknown>;
		ctx?: BotContext;
		chatId?: string;
	}) => Promise<unknown>;
};

export function createToolServiceClient(params: {
	url: string;
	secret: string;
	timeoutMs: number;
	logger: Logger;
}): ToolServiceClient {
	const baseUrl = params.url.replace(/\/+$/, "");

	async function callTool(paramsCall: {
		tool: string;
		input: Record<string, unknown>;
		ctx?: BotContext;
		chatId?: string;
	}) {
		const startedAt = Date.now();
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
		const ctx = paramsCall.ctx;
		const logContext = ctx?.state?.logContext;
		let outcome: "success" | "error" = "success";
		let error: string | undefined;
		const chatId =
			paramsCall.chatId ??
			(ctx?.chat?.id != null ? String(ctx.chat.id) : undefined);
		const chatType = ctx?.chat?.type ?? "private";
		const sessionKey = chatId
			? buildSessionKey({
					channel: "telegram",
					chatType,
					chatId,
				})
			: undefined;
		const payload = {
			tool: paramsCall.tool,
			input: paramsCall.input,
			context: {
				requestId: logContext?.request_id,
				updateId: logContext?.update_id,
				chatId,
				chatType,
				userId:
					logContext?.user_id != null ? String(logContext.user_id) : undefined,
				username: logContext?.username,
				sessionKey,
			},
		};
		try {
			const response = await fetch(`${baseUrl}/tool`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-omni-tool-secret": params.secret,
				},
				body: JSON.stringify(payload),
				signal: controller.signal,
			});
			const text = await response.text();
			if (!response.ok) {
				throw new Error(
					`tool_service_error:${response.status}:${response.statusText}:${text}`,
				);
			}
			if (!text.trim()) return { ok: true };
			try {
				return JSON.parse(text) as unknown;
			} catch {
				return text;
			}
		} catch (err) {
			outcome = "error";
			error = err instanceof Error ? err.message : String(err);
			throw err;
		} finally {
			clearTimeout(timeout);
			params.logger.info({
				event: "tool_service_call",
				tool: paramsCall.tool,
				request_id: logContext?.request_id,
				chat_id: chatId,
				user_id: logContext?.user_id,
				outcome,
				...(error ? { error: { message: error } } : {}),
				duration_ms: Date.now() - startedAt,
			});
		}
	}

	return { callTool };
}
