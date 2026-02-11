import type { FilePart } from "../files.js";

export type CandidateIssue = {
	key: string | null;
	summary: string;
	score: number;
};

export type PendingAttachment = {
	id: string;
	filename: string;
	mimeType: string;
	size?: number;
};

export type PendingAttachmentRequest = {
	issueKey: string;
	question: string;
	attachments: PendingAttachment[];
	googleLinks: string[];
	createdAt: number;
};

export type ResearchState = {
	active: boolean;
	notes: string[];
	files: FilePart[];
	createdAt: number;
};

export type ChatState = {
	lastCandidates: CandidateIssue[];
	lastPrimaryKey: string | null;
	lastUpdatedAt: number;
	historySummary?: string;
	historySummaryMessageCount?: number;
	historySummaryUpdatedAt?: number;
	pendingAttachmentRequest?: PendingAttachmentRequest;
	research?: ResearchState;
};

export function createEmptyChatState(): ChatState {
	return {
		lastCandidates: [],
		lastPrimaryKey: null,
		lastUpdatedAt: 0,
		historySummary: undefined,
		historySummaryMessageCount: undefined,
		historySummaryUpdatedAt: undefined,
		pendingAttachmentRequest: undefined,
		research: undefined,
	};
}
