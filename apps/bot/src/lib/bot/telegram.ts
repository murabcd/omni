import type { UIMessageChunk } from "ai";

type SendTextContext = {
	reply: (text: string, options?: Record<string, unknown>) => Promise<unknown>;
};

type TelegramHelpersOptions = {
	textChunkLimit: number;
	logDebug: (message: string, data?: unknown) => void;
};

export function createTelegramHelpers(options: TelegramHelpersOptions) {
	const { textChunkLimit, logDebug } = options;

	async function sendText(
		ctx: SendTextContext,
		text: string,
		options?: Record<string, unknown>,
	) {
		const limit =
			Number.isFinite(textChunkLimit) && textChunkLimit > 0
				? textChunkLimit
				: 4000;
		const replyOptions = options?.parse_mode
			? options
			: { ...(options ?? {}), parse_mode: "HTML" };
		const formatted = formatTelegram(text);

		try {
			if (formatted.length <= limit) {
				await ctx.reply(formatted, replyOptions);
				return;
			}
			for (let i = 0; i < formatted.length; i += limit) {
				const chunk = formatted.slice(i, i + limit);
				await ctx.reply(chunk, replyOptions);
			}
			return;
		} catch (error) {
			logDebug("telegram html reply failed, retrying as plain text", {
				error: String(error),
			});
		}

		const plainOptions = { ...(options ?? {}) };
		delete (plainOptions as { parse_mode?: string }).parse_mode;
		if (text.length <= limit) {
			await ctx.reply(text, plainOptions);
			return;
		}
		for (let i = 0; i < text.length; i += limit) {
			const chunk = text.slice(i, i + limit);
			await ctx.reply(chunk, plainOptions);
		}
	}

	function escapeHtml(input: string) {
		return input
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;")
			.replaceAll(">", "&gt;");
	}

	function formatTelegram(input: string) {
		if (!input) return "";

		const codeBlocks: string[] = [];
		const inlineCodes: string[] = [];
		let text = input;

		text = text.replace(/```([\s\S]*?)```/g, (match, code) => {
			void match;
			const escaped = escapeHtml(String(code).trimEnd());
			const html = `<pre><code>${escaped}</code></pre>`;
			const token = `@@CODEBLOCK_${codeBlocks.length}@@`;
			codeBlocks.push(html);
			return token;
		});

		text = text.replace(/`([^`]+?)`/g, (match, code) => {
			void match;
			const escaped = escapeHtml(String(code));
			const html = `<code>${escaped}</code>`;
			const token = `@@INLINECODE_${inlineCodes.length}@@`;
			inlineCodes.push(html);
			return token;
		});

		text = escapeHtml(text);

		text = text.replace(
			/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
			(match, label, url) => {
				void match;
				return `<a href="${url}">${label}</a>`;
			},
		);
		text = text.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
		text = text.replace(/\*([^*]+)\*/g, "<i>$1</i>");
		text = text.replace(/_([^_]+)_/g, "<i>$1</i>");
		text = text.replace(/~~([^~]+)~~/g, "<s>$1</s>");

		text = text.replace(/@@INLINECODE_(\d+)@@/g, (match, index) => {
			void match;
			const entry = inlineCodes[Number(index)];
			return entry ?? "";
		});
		text = text.replace(/@@CODEBLOCK_(\d+)@@/g, (match, index) => {
			void match;
			const entry = codeBlocks[Number(index)];
			return entry ?? "";
		});

		return text;
	}

	function appendSources(text: string, sources: Array<{ url?: string }> = []) {
		const urls = sources
			.map((source) => source.url)
			.filter((url): url is string => Boolean(url));
		if (!urls.length) return text;
		const unique = Array.from(new Set(urls));
		const lines = unique.map((url) => `- ${url}`);
		return `${text}\n\nИсточники:\n${lines.join("\n")}`;
	}

	function chunkText(text: string, size = 64) {
		const chunks: string[] = [];
		for (let i = 0; i < text.length; i += size) {
			chunks.push(text.slice(i, i + size));
		}
		return chunks;
	}

	function createTextStream(text: string): ReadableStream<UIMessageChunk> {
		const messageId = crypto.randomUUID();
		return new ReadableStream<UIMessageChunk>({
			start(controller) {
				controller.enqueue({ type: "start", messageId });
				controller.enqueue({ type: "text-start", id: messageId });
				for (const delta of chunkText(text)) {
					controller.enqueue({ type: "text-delta", id: messageId, delta });
				}
				controller.enqueue({ type: "text-end", id: messageId });
				controller.enqueue({ type: "finish", finishReason: "stop" });
				controller.close();
			},
		});
	}

	return {
		sendText,
		formatTelegram,
		appendSources,
		createTextStream,
	};
}
