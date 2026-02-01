import { regex } from "arkregex";
import type { PendingAttachmentRequest } from "./context/chat-state-types.js";
import { isDocxDocument, isPdfDocument } from "./files.js";

const GOOGLE_DOC_URL_RE = regex.as(
	"https?://docs\\.google\\.com/document/d/[^\\s)]+",
	"gi",
);
const GOOGLE_SHEET_URL_RE = regex.as(
	"https?://docs\\.google\\.com/spreadsheets/d/[^\\s)]+",
	"gi",
);
const GOOGLE_SLIDES_URL_RE = regex.as(
	"https?://docs\\.google\\.com/presentation/d/[^\\s)]+",
	"gi",
);

export type AttachmentCandidate = {
	id: string;
	filename: string;
	mimeType: string;
	size?: number;
};

export function normalizeTrackerAttachment(
	value: Record<string, unknown>,
): AttachmentCandidate | null {
	const id =
		typeof value.id === "string"
			? value.id
			: typeof value.attachmentId === "string"
				? value.attachmentId
				: typeof value._id === "string"
					? value._id
					: null;
	if (!id) return null;
	const filename =
		typeof value.name === "string"
			? value.name
			: typeof value.filename === "string"
				? value.filename
				: typeof value.fileName === "string"
					? value.fileName
					: `attachment-${id}`;
	const mimeType =
		typeof value.mimeType === "string"
			? value.mimeType
			: typeof value.contentType === "string"
				? value.contentType
				: "application/octet-stream";
	const size =
		typeof value.size === "number"
			? value.size
			: typeof value.fileSize === "number"
				? value.fileSize
				: undefined;
	return {
		id,
		filename,
		mimeType,
		size,
	};
}

export function extractGoogleLinks(text: string): string[] {
	const links = new Set<string>();
	for (const match of text.matchAll(GOOGLE_DOC_URL_RE)) {
		if (match[0]) {
			const cleaned = match[0].replace(/[).,;:!?]+$/g, "");
			links.add(cleaned);
		}
	}
	for (const match of text.matchAll(GOOGLE_SHEET_URL_RE)) {
		if (match[0]) {
			const cleaned = match[0].replace(/[).,;:!?]+$/g, "");
			links.add(cleaned);
		}
	}
	for (const match of text.matchAll(GOOGLE_SLIDES_URL_RE)) {
		if (match[0]) {
			const cleaned = match[0].replace(/[).,;:!?]+$/g, "");
			links.add(cleaned);
		}
	}
	return Array.from(links);
}

export function parseConsent(text: string): "yes" | "no" | null {
	const normalized = text.trim().toLowerCase();
	if (!normalized) return null;
	const yes = [
		"yes",
		"y",
		"да",
		"ок",
		"окей",
		"okay",
		"ага",
		"прочитай",
		"читай",
		"давай",
		"+",
	];
	if (yes.some((token) => normalized === token || normalized.startsWith(token)))
		return "yes";
	const no = [
		"no",
		"n",
		"нет",
		"не",
		"не надо",
		"не нужно",
		"не читай",
		"пока нет",
		"-",
	];
	if (no.some((token) => normalized === token || normalized.startsWith(token)))
		return "no";
	return null;
}

export function buildAttachmentPrompt(request: PendingAttachmentRequest) {
	const fileList = request.attachments
		.map(
			(item) =>
				`- ${item.filename} (${item.mimeType}${
					typeof item.size === "number" ? `, ${item.size} bytes` : ""
				})`,
		)
		.join("\n");
	const linksList = request.googleLinks.map((link) => `- ${link}`).join("\n");
	const sections = [
		request.attachments.length > 0 ? `Вложения (PDF/DOCX):\n${fileList}` : "",
		request.googleLinks.length > 0
			? `Google Docs/Sheets/Slides ссылки:\n${linksList}`
			: "",
	].filter(Boolean);
	return [
		"Нашёл дополнительные материалы по тикету.",
		...sections,
		"",
		"Прочитать и учесть их в ответе? (да/нет)",
	]
		.filter(Boolean)
		.join("\n");
}

export function isSupportedAttachment(candidate: AttachmentCandidate) {
	return (
		isPdfDocument({
			mimeType: candidate.mimeType,
			fileName: candidate.filename,
		}) ||
		isDocxDocument({
			mimeType: candidate.mimeType,
			fileName: candidate.filename,
		})
	);
}
