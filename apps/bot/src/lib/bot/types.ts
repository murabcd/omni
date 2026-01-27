import type { Context } from "grammy";
import type { ChannelConfig } from "../channels.js";

export type LogContext = {
	request_id?: string;
	update_id?: number;
	update_type?: string;
	chat_id?: number | string;
	user_id?: number | string;
	username?: string;
	message_type?:
		| "command"
		| "text"
		| "voice"
		| "photo"
		| "document"
		| "callback"
		| "other";
	command?: string;
	command_sub?: string;
	tool?: string;
	model_ref?: string;
	model_id?: string;
	issue_key?: string;
	issue_key_count?: number;
	outcome?: "success" | "error" | "blocked";
	status_code?: number;
	error?: { message: string; type?: string };
};

export type BotContext = Context & {
	state: { logContext?: LogContext; channelConfig?: ChannelConfig };
};
