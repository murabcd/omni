import { regex } from "arkregex";

export type TaskDecision = {
	mode: "inline" | "background";
	reason?: string;
	tags?: string[];
};

export type TaskOverride = {
	mode: "inline" | "background";
	text: string;
};

const TASK_PREFIX_RE = regex.as("^\\s*(/task|task:|background:|bg:)", "i");
const NOW_PREFIX_RE = regex.as("^\\s*(/now|now:|inline:)", "i");
const URL_RE = regex.as("https?://\\S+", "gi");
const LONG_KEYWORDS_RE = regex.as(
	"\\b(crawl|scrape|firecrawl|export|csv|report|batch|scan|audit|benchmark|analy[sz]e)\\b",
	"i",
);
const LONG_KEYWORDS_RU_RE = regex.as(
	"(выгруз|csv|таблиц|отчет|сканир|проверь все|найди все|проанализируй все)",
	"i",
);

export function extractTaskOverride(text: string): TaskOverride | null {
	const input = String(text);
	const taskPrefixRe: RegExp = TASK_PREFIX_RE;
	const nowPrefixRe: RegExp = NOW_PREFIX_RE;
	if (taskPrefixRe.test(input)) {
		return {
			mode: "background",
			text: input.replace(taskPrefixRe, "").trim(),
		};
	}
	if (nowPrefixRe.test(input)) {
		return { mode: "inline", text: input.replace(nowPrefixRe, "").trim() };
	}
	return null;
}

export function decideTaskMode(params: {
	text: string;
	enabled: boolean;
	urlThreshold: number;
	minChars: number;
	keywords?: string[];
}): TaskDecision {
	if (!params.enabled) return { mode: "inline", reason: "disabled" };
	const trimmed = params.text.trim();
	if (!trimmed) return { mode: "inline", reason: "empty" };
	const urls = Array.from(trimmed.matchAll(URL_RE)).length;
	const tags: string[] = [];
	if (urls >= params.urlThreshold) {
		tags.push("many_urls");
	}
	if (trimmed.length >= params.minChars) {
		tags.push("long_prompt");
	}
	if (LONG_KEYWORDS_RE.test(trimmed) || LONG_KEYWORDS_RU_RE.test(trimmed)) {
		tags.push("keywords");
	}
	const keywordHit =
		params.keywords?.some((entry) =>
			trimmed.toLowerCase().includes(entry.toLowerCase()),
		) ?? false;
	if (keywordHit) tags.push("custom_keywords");
	const shouldBackground =
		tags.includes("many_urls") ||
		tags.includes("long_prompt") ||
		tags.includes("keywords") ||
		tags.includes("custom_keywords");
	return {
		mode: shouldBackground ? "background" : "inline",
		reason: shouldBackground ? "heuristic" : "fast",
		tags: tags.length > 0 ? tags : undefined,
	};
}
