import type { Update } from "grammy/types";
import type { Logger } from "../logger.js";
import type { BotContext, LogContext } from "./types.js";

type DebugLoggerOptions = {
	debugEnabled: boolean;
	logger: Logger;
	onDebugLog?: (line: string) => void;
};

export function createLogHelpers(options: DebugLoggerOptions) {
	const { debugEnabled, logger, onDebugLog } = options;

	function getLogContext(ctx: BotContext) {
		return ctx.state.logContext ?? {};
	}

	function setLogContext(ctx: BotContext, update: Partial<LogContext>) {
		ctx.state.logContext = { ...ctx.state.logContext, ...update };
	}

	function setLogError(ctx: BotContext, error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		const type = error instanceof Error ? error.name : undefined;
		setLogContext(ctx, {
			outcome: "error",
			status_code: 500,
			error: { message, type },
		});
	}

	function getUpdateType(update?: Update) {
		if (!update) return "unknown";
		const keys = Object.keys(
			update as unknown as Record<string, unknown>,
		).filter((key) => key !== "update_id");
		return keys[0] ?? "unknown";
	}

	function logDebug(message: string, data?: unknown) {
		if (!debugEnabled) return;
		const payload = {
			event: "debug",
			message,
			data,
		};
		const line = JSON.stringify(payload);
		logger.info(payload);
		onDebugLog?.(line);
	}

	return {
		getLogContext,
		setLogContext,
		setLogError,
		getUpdateType,
		logDebug,
	};
}

type RequestLoggerOptions = {
	logger: Logger;
	getLogContext: (ctx: BotContext) => LogContext;
	setLogContext: (ctx: BotContext, update: Partial<LogContext>) => void;
	setLogError: (ctx: BotContext, error: unknown) => void;
	getUpdateType: (update?: Update) => string;
};

export function createRequestLoggerMiddleware(options: RequestLoggerOptions) {
	const { logger, getLogContext, setLogContext, setLogError, getUpdateType } =
		options;

	return async (ctx: BotContext, next: () => Promise<void>) => {
		ctx.state ??= {};
		const startedAt = Date.now();
		const updateId = ctx.update?.update_id;
		const chatId = ctx.chat?.id;
		const userId = ctx.from?.id;
		const username = ctx.from?.username;
		const updateType = getUpdateType(ctx.update);
		const requestId = `tg:${updateId ?? "unknown"}:${chatId ?? userId ?? "unknown"}`;
		setLogContext(ctx, {
			request_id: requestId,
			update_id: updateId,
			chat_id: chatId,
			user_id: userId,
			username,
			update_type: updateType,
		});

		try {
			await next();
			const context = getLogContext(ctx);
			if (!context.outcome) {
				setLogContext(ctx, { outcome: "success" });
			}
		} catch (error) {
			setLogError(ctx, error);
			throw error;
		} finally {
			const durationMs = Date.now() - startedAt;
			const context = getLogContext(ctx);
			const statusCode =
				context.status_code ??
				(context.outcome === "blocked"
					? 403
					: context.outcome === "error"
						? 500
						: 200);
			if (!context.status_code) {
				setLogContext(ctx, { status_code: statusCode });
			}
			const finalContext = getLogContext(ctx);
			const level = finalContext.outcome === "error" ? "error" : "info";
			logger[level]({
				event: "telegram_update",
				...finalContext,
				duration_ms: durationMs,
			});
		}
	};
}
