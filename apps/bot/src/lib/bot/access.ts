import { isBotMentionedMessage } from "../telegram-mentions.js";
import type { BotContext } from "./types.js";

export function isGroupChat(ctx: BotContext) {
	const type = ctx.chat?.type;
	return type === "group" || type === "supergroup";
}

export function createAccessHelpers(options: { allowedGroups: Set<string> }) {
	const { allowedGroups } = options;

	function isGroupAllowed(ctx: BotContext) {
		if (!isGroupChat(ctx)) return true;
		if (allowedGroups.size === 0) return true;
		const chatId = ctx.chat?.id?.toString() ?? "";
		return allowedGroups.has(chatId);
	}

	function isReplyToBot(ctx: BotContext) {
		return (
			ctx.message?.reply_to_message?.from?.id !== undefined &&
			ctx.me?.id !== undefined &&
			ctx.message.reply_to_message.from.id === ctx.me.id
		);
	}

	function isBotMentioned(ctx: BotContext) {
		return isBotMentionedMessage(ctx.message, ctx.me) || isReplyToBot(ctx);
	}

	function isReplyToBotWithoutMention(ctx: BotContext) {
		return isReplyToBot(ctx) && !isBotMentionedMessage(ctx.message, ctx.me);
	}

	function shouldReplyAccessDenied(ctx: BotContext) {
		if (!isGroupChat(ctx)) return true;
		return isBotMentioned(ctx);
	}

	return {
		isGroupAllowed,
		isReplyToBot,
		isBotMentioned,
		isReplyToBotWithoutMention,
		shouldReplyAccessDenied,
	};
}
