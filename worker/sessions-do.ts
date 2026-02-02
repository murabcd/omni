import type { DurableObjectState, DurableObject } from "@cloudflare/workers-types";
import type { ChatState } from "../apps/bot/src/lib/context/chat-state-types.js";

export type SessionKind = "direct" | "group" | "global" | "unknown";

export type SessionEntry = {
	key: string;
	kind: SessionKind;
	label?: string;
	displayName?: string;
	agentId?: string;
	spawnedBy?: string;
	surface?: string;
	subject?: string;
	room?: string;
	space?: string;
	lastChannel?: string;
	lastTo?: string;
	deliveryContext?: Record<string, unknown>;
	timeZone?: string;
	updatedAt: number | null;
	sessionId?: string;
	systemSent?: boolean;
	abortedLastRun?: boolean;
	thinkingLevel?: string;
	verboseLevel?: string;
	reasoningLevel?: string;
	elevatedLevel?: string;
	responseUsage?: "off" | "tokens" | "full" | "on";
	sendPolicy?: "allow" | "deny";
	groupActivation?: "mention" | "always";
	execHost?: string;
	execSecurity?: string;
	execAsk?: string;
	execNode?: string;
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
	model?: string;
	modelProvider?: string;
	contextTokens?: number;
	runActive?: boolean;
	runActiveAt?: number;
	runEndedAt?: number;
};

export type SessionsListResult = {
	ts: number;
	path: string;
	count: number;
	defaults: { model: string | null; contextTokens: number | null };
	sessions: SessionEntry[];
};

export type TurnQueueItem = {
	id: string;
	sessionKey: string;
	chatId: string;
	chatType: "private" | "group" | "supergroup" | "channel";
	text: string;
	kind: "system" | "hook" | "followup" | "announce" | "subagent";
	createdAt: number;
	nextAt: number;
	attempt: number;
	lockedUntil?: number;
	channelConfig?: Record<string, unknown>;
	turnDepth?: number;
	meta?: Record<string, unknown>;
};

type StoredSessions = {
	sessions: Record<string, SessionEntry>;
	turnQueue: TurnQueueItem[];
	processedTurnIds: string[];
	chatStates?: Record<string, ChatStateEntry>;
};

const STORE_KEY = "sessions";
const STORE_PATH = "do://sessions";
const TURN_QUEUE_LOCK_MS = 60_000;
const TURN_QUEUE_MAX = 5_000;
const TURN_PROCESSED_MAX = 2_000;
const CHAT_STATE_TTL_MS = 24 * 60 * 60 * 1000;

type ChatStateEntry = {
	state: ChatState;
	updatedAt: number;
};

function now() {
	return Date.now();
}

function buildKeyIndex(sessions: Record<string, SessionEntry>) {
	const labels = new Map<string, string>();
	for (const [key, entry] of Object.entries(sessions)) {
		if (entry.label) labels.set(entry.label, key);
		if (entry.displayName) labels.set(entry.displayName, key);
	}
	return labels;
}

function normalizeSessionKind(kind?: string): SessionKind {
	if (kind === "direct" || kind === "group" || kind === "global") return kind;
	return "unknown";
}

export class SessionsDO implements DurableObject {
	private state: DurableObjectState;

	constructor(state: DurableObjectState) {
		this.state = state;
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (request.method !== "POST") {
			return new Response("Method Not Allowed", { status: 405 });
		}
		const body = await request.json();
		switch (url.pathname) {
			case "/list":
				return this.list(body as Record<string, unknown>);
			case "/get":
				return this.get(body as Record<string, unknown>);
			case "/patch":
				return this.patch(body as Record<string, unknown>);
			case "/reset":
				return this.reset(body as Record<string, unknown>);
			case "/delete":
				return this.remove(body as Record<string, unknown>);
			case "/resolve":
				return this.resolve(body as Record<string, unknown>);
			case "/touch":
				return this.touch(body as Record<string, unknown>);
			case "/turns/enqueue":
				return this.enqueueTurn(body as Record<string, unknown>);
			case "/turns/dequeue":
				return this.dequeueTurn();
			case "/turns/requeue":
				return this.requeueTurn(body as Record<string, unknown>);
			case "/turns/processed":
				return this.markTurnProcessed(body as Record<string, unknown>);
			case "/turns/list":
				return this.listTurns(body as Record<string, unknown>);
			case "/turns/clear":
				return this.clearTurns(body as Record<string, unknown>);
			case "/run/start":
				return this.runStart(body as Record<string, unknown>);
			case "/run/end":
				return this.runEnd(body as Record<string, unknown>);
			case "/run/status":
				return this.runStatus(body as Record<string, unknown>);
			case "/chat-state/get":
				return this.getChatState(body as Record<string, unknown>);
			case "/chat-state/set":
				return this.setChatState(body as Record<string, unknown>);
			case "/chat-state/clear":
				return this.clearChatState(body as Record<string, unknown>);
			default:
				return new Response("Not Found", { status: 404 });
		}
	}

	private async load(): Promise<StoredSessions> {
		const stored = (await this.state.storage.get<StoredSessions>(STORE_KEY)) ?? {
			sessions: {},
			turnQueue: [],
			processedTurnIds: [],
			chatStates: {},
		};
		return {
			sessions: stored.sessions ?? {},
			turnQueue: Array.isArray(stored.turnQueue) ? stored.turnQueue : [],
			processedTurnIds: Array.isArray(stored.processedTurnIds)
				? stored.processedTurnIds
				: [],
			chatStates: stored.chatStates ?? {},
		};
	}

	private async save(next: StoredSessions) {
		await this.state.storage.put(STORE_KEY, next);
	}

	private isChatStateExpired(entry: ChatStateEntry, ttlMs: number) {
		return now() - entry.updatedAt > ttlMs;
	}

	private async getChatState(params: Record<string, unknown>) {
		const chatId = String(params.chatId ?? "").trim();
		if (!chatId) return new Response("chatId required", { status: 400 });
		const ttlMs = Number.isFinite(Number(params.ttlMs))
			? Number(params.ttlMs)
			: CHAT_STATE_TTL_MS;
		const state = await this.load();
		const entry = state.chatStates?.[chatId];
		if (!entry) return Response.json({ ok: true, chatId, state: null });
		if (this.isChatStateExpired(entry, ttlMs)) {
			delete state.chatStates?.[chatId];
			await this.save(state);
			return Response.json({ ok: true, chatId, state: null, expired: true });
		}
		return Response.json({
			ok: true,
			chatId,
			state: entry.state,
			updatedAt: entry.updatedAt,
		});
	}

	private async setChatState(params: Record<string, unknown>) {
		const chatId = String(params.chatId ?? "").trim();
		if (!chatId) return new Response("chatId required", { status: 400 });
		if (!params.state || typeof params.state !== "object") {
			return new Response("state required", { status: 400 });
		}
		const state = await this.load();
		if (!state.chatStates) state.chatStates = {};
		state.chatStates[chatId] = {
			state: params.state as ChatState,
			updatedAt: now(),
		};
		await this.save(state);
		return Response.json({ ok: true, chatId });
	}

	private async clearChatState(params: Record<string, unknown>) {
		const chatId = String(params.chatId ?? "").trim();
		if (!chatId) return new Response("chatId required", { status: 400 });
		const state = await this.load();
		if (state.chatStates && chatId in state.chatStates) {
			delete state.chatStates[chatId];
			await this.save(state);
		}
		return Response.json({ ok: true, chatId });
	}

	private async list(params: Record<string, unknown>) {
		const state = await this.load();
		const activeMinutes = Number.parseFloat(
			String(params.activeMinutes ?? ""),
		);
		const limit = Number.parseInt(String(params.limit ?? ""), 10);
		const includeGlobal = params.includeGlobal !== false;
		const includeUnknown = params.includeUnknown !== false;
		const labelFilter =
			typeof params.label === "string" ? params.label.trim() : "";
		const spawnedByFilter =
			typeof params.spawnedBy === "string" ? params.spawnedBy.trim() : "";
		const agentIdFilter =
			typeof params.agentId === "string" ? params.agentId.trim() : "";
		const cutoff = Number.isFinite(activeMinutes)
			? now() - activeMinutes * 60_000
			: null;
		let entries = Object.values(state.sessions);
		if (!includeGlobal) {
			entries = entries.filter((entry) => entry.kind !== "global");
		}
		if (!includeUnknown) {
			entries = entries.filter((entry) => entry.kind !== "unknown");
		}
		if (labelFilter) {
			entries = entries.filter(
				(entry) => entry.label === labelFilter || entry.displayName === labelFilter,
			);
		}
		if (spawnedByFilter) {
			entries = entries.filter((entry) => entry.spawnedBy === spawnedByFilter);
		}
		if (agentIdFilter) {
			entries = entries.filter((entry) => entry.agentId === agentIdFilter);
		}
		if (cutoff !== null) {
			entries = entries.filter(
				(entry) => entry.updatedAt && entry.updatedAt >= cutoff,
			);
		}
		entries.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
		const sliced = Number.isFinite(limit) && limit > 0 ? entries.slice(0, limit) : entries;
		const result: SessionsListResult = {
			ts: now(),
			path: STORE_PATH,
			count: entries.length,
			defaults: { model: null, contextTokens: null },
			sessions: sliced,
		};
		return Response.json(result);
	}

	private async get(params: Record<string, unknown>) {
		const key = String(params.key ?? "").trim();
		if (!key) return new Response("key required", { status: 400 });
		const state = await this.load();
		const entry = state.sessions[key];
		if (!entry) return new Response("not_found", { status: 404 });
		return Response.json({ ok: true, key, entry });
	}

	private async patch(params: Record<string, unknown>) {
		const key = String(params.key ?? "").trim();
		if (!key) return new Response("key required", { status: 400 });
		const state = await this.load();
		const entry = state.sessions[key] ?? {
			key,
			kind: "unknown",
			updatedAt: now(),
		};
		const label =
			params.label === null
				? undefined
				: typeof params.label === "string"
					? params.label.trim() || undefined
					: entry.label;
		const spawnedBy =
			params.spawnedBy === null
				? undefined
				: typeof params.spawnedBy === "string"
					? params.spawnedBy.trim() || undefined
					: entry.spawnedBy;
		const agentId =
			params.agentId === null
				? undefined
				: typeof params.agentId === "string"
					? params.agentId.trim() || undefined
					: entry.agentId;
		const responseUsage =
			params.responseUsage === null
				? undefined
				: typeof params.responseUsage === "string"
					? (params.responseUsage as SessionEntry["responseUsage"])
					: entry.responseUsage;
		const sendPolicy =
			params.sendPolicy === null
				? undefined
				: params.sendPolicy === "allow" || params.sendPolicy === "deny"
					? (params.sendPolicy as SessionEntry["sendPolicy"])
					: entry.sendPolicy;
		const groupActivation =
			params.groupActivation === null
				? undefined
				: params.groupActivation === "mention" || params.groupActivation === "always"
					? (params.groupActivation as SessionEntry["groupActivation"])
					: entry.groupActivation;
		const execHost =
			params.execHost === null
				? undefined
				: typeof params.execHost === "string"
					? params.execHost.trim() || undefined
					: entry.execHost;
		const execSecurity =
			params.execSecurity === null
				? undefined
				: typeof params.execSecurity === "string"
					? params.execSecurity.trim() || undefined
					: entry.execSecurity;
		const execAsk =
			params.execAsk === null
				? undefined
				: typeof params.execAsk === "string"
					? params.execAsk.trim() || undefined
					: entry.execAsk;
		const execNode =
			params.execNode === null
				? undefined
				: typeof params.execNode === "string"
					? params.execNode.trim() || undefined
					: entry.execNode;
		const model =
			params.model === null
				? undefined
				: typeof params.model === "string"
					? params.model.trim() || undefined
					: entry.model;
		const timeZone =
			params.timeZone === null
				? undefined
				: typeof params.timeZone === "string"
					? params.timeZone.trim() || undefined
					: entry.timeZone;
		const next: SessionEntry = {
			...entry,
			label,
			spawnedBy,
			agentId,
			thinkingLevel:
				typeof params.thinkingLevel === "string"
					? params.thinkingLevel
					: entry.thinkingLevel,
			verboseLevel:
				typeof params.verboseLevel === "string"
					? params.verboseLevel
					: entry.verboseLevel,
			reasoningLevel:
				typeof params.reasoningLevel === "string"
					? params.reasoningLevel
					: entry.reasoningLevel,
			elevatedLevel:
				typeof params.elevatedLevel === "string"
					? params.elevatedLevel
					: entry.elevatedLevel,
			responseUsage,
			sendPolicy,
			groupActivation,
			execHost,
			execSecurity,
			execAsk,
			execNode,
			model,
			timeZone,
			updatedAt: now(),
		};
		state.sessions[key] = next;
		await this.save(state);
		return Response.json({ ok: true, path: STORE_PATH, key, entry: next });
	}

	private async reset(params: Record<string, unknown>) {
		const key = String(params.key ?? "").trim();
		if (!key) return new Response("key required", { status: 400 });
		const state = await this.load();
		const entry = state.sessions[key];
		const next: SessionEntry = {
			...(entry ?? { key, kind: "unknown" }),
			sessionId: crypto.randomUUID(),
			updatedAt: now(),
			systemSent: false,
			abortedLastRun: false,
		};
		state.sessions[key] = next;
		await this.save(state);
		return Response.json({ ok: true, key, entry: next });
	}

	private async remove(params: Record<string, unknown>) {
		const key = String(params.key ?? "").trim();
		if (!key) return new Response("key required", { status: 400 });
		const state = await this.load();
		delete state.sessions[key];
		await this.save(state);
		return Response.json({ ok: true, deleted: true });
	}

	private async resolve(params: Record<string, unknown>) {
		const key = String(params.key ?? "").trim();
		const label = String(params.label ?? "").trim();
		const spawnedBy =
			typeof params.spawnedBy === "string" ? params.spawnedBy.trim() : "";
		const agentId =
			typeof params.agentId === "string" ? params.agentId.trim() : "";
		const state = await this.load();
		if (key && state.sessions[key]) {
			return Response.json({ ok: true, key });
		}
		if (label) {
			const candidates = Object.values(state.sessions).filter((entry) => {
				if (entry.label !== label && entry.displayName !== label) return false;
				if (spawnedBy && entry.spawnedBy !== spawnedBy) return false;
				if (agentId && entry.agentId !== agentId) return false;
				return true;
			});
			if (candidates.length > 0) {
				const sorted = candidates.sort(
					(a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
				);
				return Response.json({ ok: true, key: sorted[0]?.key });
			}
			const map = buildKeyIndex(state.sessions);
			const resolved = map.get(label);
			if (resolved) return Response.json({ ok: true, key: resolved });
		}
		return new Response("not_found", { status: 404 });
	}

	private async touch(params: Record<string, unknown>) {
		const key = String(params.key ?? "").trim();
		if (!key) return new Response("key required", { status: 400 });
		const state = await this.load();
		const entry = state.sessions[key] ?? {
			key,
			kind: normalizeSessionKind(String(params.kind ?? "unknown")),
			updatedAt: now(),
		};
		const next: SessionEntry = {
			...entry,
			kind: normalizeSessionKind(String(params.kind ?? entry.kind)),
			surface:
				typeof params.surface === "string" && params.surface.trim()
					? params.surface.trim()
					: entry.surface,
			subject:
				typeof params.subject === "string" && params.subject.trim()
					? params.subject.trim()
					: entry.subject,
			room:
				typeof params.room === "string" && params.room.trim()
					? params.room.trim()
					: entry.room,
			space:
				typeof params.space === "string" && params.space.trim()
					? params.space.trim()
					: entry.space,
			label:
				typeof params.label === "string" && params.label.trim()
					? params.label.trim()
					: entry.label,
			displayName:
				typeof params.displayName === "string" && params.displayName.trim()
					? params.displayName.trim()
					: entry.displayName,
			agentId:
				typeof params.agentId === "string" && params.agentId.trim()
					? params.agentId.trim()
					: entry.agentId,
			spawnedBy:
				typeof params.spawnedBy === "string" && params.spawnedBy.trim()
					? params.spawnedBy.trim()
					: entry.spawnedBy,
			lastChannel:
				typeof params.lastChannel === "string" && params.lastChannel.trim()
					? params.lastChannel.trim()
					: entry.lastChannel,
			lastTo:
				typeof params.lastTo === "string" && params.lastTo.trim()
					? params.lastTo.trim()
					: entry.lastTo,
			timeZone:
				typeof params.timeZone === "string" && params.timeZone.trim()
					? params.timeZone.trim()
					: entry.timeZone,
			updatedAt: now(),
			inputTokens:
				typeof params.inputTokens === "number" ? params.inputTokens : entry.inputTokens,
			outputTokens:
				typeof params.outputTokens === "number"
					? params.outputTokens
					: entry.outputTokens,
			totalTokens:
				typeof params.totalTokens === "number" ? params.totalTokens : entry.totalTokens,
			model:
				typeof params.model === "string" ? params.model : entry.model,
			modelProvider:
				typeof params.modelProvider === "string"
					? params.modelProvider
					: entry.modelProvider,
			contextTokens:
				typeof params.contextTokens === "number"
					? params.contextTokens
					: entry.contextTokens,
			sessionId:
				typeof params.sessionId === "string" && params.sessionId.trim()
					? params.sessionId.trim()
					: entry.sessionId,
			responseUsage:
				typeof params.responseUsage === "string"
					? (params.responseUsage as SessionEntry["responseUsage"])
					: entry.responseUsage,
			sendPolicy:
				params.sendPolicy === "allow" || params.sendPolicy === "deny"
					? (params.sendPolicy as SessionEntry["sendPolicy"])
					: entry.sendPolicy,
			groupActivation:
				params.groupActivation === "mention" || params.groupActivation === "always"
					? (params.groupActivation as SessionEntry["groupActivation"])
					: entry.groupActivation,
		};
		state.sessions[key] = next;
		await this.save(state);
		return Response.json({ ok: true });
	}

	private normalizeTurn(params: Record<string, unknown>): TurnQueueItem | null {
		const sessionKey = String(params.sessionKey ?? "").trim();
		const chatId = String(params.chatId ?? "").trim();
		const chatTypeRaw = String(params.chatType ?? "").trim();
		const text = typeof params.text === "string" ? params.text.trim() : "";
		if (!sessionKey || !chatId || !text) return null;
		const chatType =
			chatTypeRaw === "group" ||
			chatTypeRaw === "supergroup" ||
			chatTypeRaw === "channel"
				? chatTypeRaw
				: "private";
		const kindRaw = typeof params.kind === "string" ? params.kind.trim() : "";
		const kind =
			kindRaw === "hook" ||
			kindRaw === "followup" ||
			kindRaw === "announce" ||
			kindRaw === "subagent" ||
			kindRaw === "task"
				? kindRaw
				: "system";
		const createdAt = typeof params.createdAt === "number" ? params.createdAt : now();
		const nextAt = typeof params.nextAt === "number" ? params.nextAt : createdAt;
		const id =
			typeof params.id === "string" && params.id.trim()
				? params.id.trim()
				: `${createdAt}-${crypto.randomUUID()}`;
		return {
			id,
			sessionKey,
			chatId,
			chatType,
			text,
			kind,
			createdAt,
			nextAt,
			attempt: 0,
			channelConfig:
				params.channelConfig && typeof params.channelConfig === "object"
					? (params.channelConfig as Record<string, unknown>)
					: undefined,
			turnDepth:
				typeof params.turnDepth === "number" ? params.turnDepth : undefined,
			meta:
				params.meta && typeof params.meta === "object"
					? (params.meta as Record<string, unknown>)
					: undefined,
		};
	}

	private async enqueueTurn(params: Record<string, unknown>) {
		const nextItem = this.normalizeTurn(params);
		if (!nextItem) return new Response("invalid_turn", { status: 400 });
		const state = await this.load();
		if (state.processedTurnIds.includes(nextItem.id)) {
			return Response.json({ ok: true, skipped: true });
		}
		if (state.turnQueue.some((item) => item.id === nextItem.id)) {
			return Response.json({ ok: true, skipped: true });
		}
		state.turnQueue.push(nextItem);
		if (state.turnQueue.length > TURN_QUEUE_MAX) {
			state.turnQueue = state.turnQueue.slice(-TURN_QUEUE_MAX);
		}
		await this.save(state);
		return Response.json({ ok: true, id: nextItem.id });
	}

	private async dequeueTurn() {
		const state = await this.load();
		if (state.turnQueue.length === 0) {
			return Response.json({ ok: false, nextAt: null });
		}
		const nowTs = now();
		let bestIndex = -1;
		let bestNextAt = Number.POSITIVE_INFINITY;
		for (let i = 0; i < state.turnQueue.length; i += 1) {
			const candidate = state.turnQueue[i];
			if (!candidate) continue;
			if (candidate.nextAt > nowTs) continue;
			if (candidate.lockedUntil && candidate.lockedUntil > nowTs) continue;
			if (candidate.nextAt < bestNextAt) {
				bestNextAt = candidate.nextAt;
				bestIndex = i;
			}
		}
		const item = bestIndex >= 0 ? state.turnQueue[bestIndex] : null;
		if (!item) {
			state.turnQueue.sort((a, b) => a.nextAt - b.nextAt);
			const nextItem = state.turnQueue[0];
			return Response.json({
				ok: false,
				nextAt: nextItem ? nextItem.nextAt : null,
			});
		}
		item.lockedUntil = nowTs + TURN_QUEUE_LOCK_MS;
		await this.save(state);
		return Response.json({ ok: true, item });
	}

	private async requeueTurn(params: Record<string, unknown>) {
		const body = params as Partial<TurnQueueItem>;
		if (!body?.id || !body.sessionKey) {
			return new Response("invalid_turn", { status: 400 });
		}
		const state = await this.load();
		const existing = state.turnQueue.find((item) => item.id === body.id);
		if (existing) {
			existing.attempt =
				typeof body.attempt === "number" ? body.attempt : existing.attempt;
			existing.nextAt =
				typeof body.nextAt === "number" ? body.nextAt : existing.nextAt;
			existing.lockedUntil = undefined;
		} else {
			state.turnQueue.push({
				...(body as TurnQueueItem),
				lockedUntil: undefined,
				attempt: typeof body.attempt === "number" ? body.attempt : 0,
				nextAt: typeof body.nextAt === "number" ? body.nextAt : now(),
			});
		}
		await this.save(state);
		return Response.json({ ok: true });
	}

	private async markTurnProcessed(params: Record<string, unknown>) {
		const id = String(params.id ?? "").trim();
		if (!id) return new Response("id required", { status: 400 });
		const state = await this.load();
		state.turnQueue = state.turnQueue.filter((item) => item.id !== id);
		state.processedTurnIds.push(id);
		if (state.processedTurnIds.length > TURN_PROCESSED_MAX) {
			state.processedTurnIds = state.processedTurnIds.slice(
				-state.processedTurnIds.length + TURN_PROCESSED_MAX,
			);
		}
		await this.save(state);
		return Response.json({ ok: true });
	}

	private async clearTurns(params: Record<string, unknown>) {
		const sessionKey = String(params.sessionKey ?? "").trim();
		if (!sessionKey) return new Response("sessionKey required", { status: 400 });
		const kinds = Array.isArray(params.kinds)
			? (params.kinds as unknown[]).filter((value): value is string =>
					typeof value === "string",
				)
			: [];
		const kindSet = new Set(kinds.map((value) => value.trim()).filter(Boolean));
		const state = await this.load();
		const before = state.turnQueue.length;
		state.turnQueue = state.turnQueue.filter((item) => {
			if (item.sessionKey !== sessionKey) return true;
			if (kindSet.size === 0) return false;
			return !kindSet.has(item.kind);
		});
		const cleared = before - state.turnQueue.length;
		if (cleared > 0) {
			await this.save(state);
		}
		return Response.json({ ok: true, cleared });
	}

	private async listTurns(params: Record<string, unknown>) {
		const state = await this.load();
		const limit = Number.parseInt(String(params.limit ?? ""), 10);
		const items =
			Number.isFinite(limit) && limit > 0
				? state.turnQueue.slice(0, limit)
				: state.turnQueue;
		return Response.json({
			ok: true,
			count: state.turnQueue.length,
			items,
		});
	}

	private async runStart(params: Record<string, unknown>) {
		const key = String(params.key ?? "").trim();
		if (!key) return new Response("key required", { status: 400 });
		const state = await this.load();
		const entry = state.sessions[key] ?? {
			key,
			kind: "unknown",
			updatedAt: now(),
		};
		state.sessions[key] = {
			...entry,
			runActive: true,
			runActiveAt: now(),
			runEndedAt: entry.runEndedAt,
			updatedAt: now(),
		};
		await this.save(state);
		return Response.json({ ok: true, key, active: true });
	}

	private async runEnd(params: Record<string, unknown>) {
		const key = String(params.key ?? "").trim();
		if (!key) return new Response("key required", { status: 400 });
		const state = await this.load();
		const entry = state.sessions[key];
		if (!entry) return new Response("not_found", { status: 404 });
		state.sessions[key] = {
			...entry,
			runActive: false,
			runEndedAt: now(),
			updatedAt: now(),
		};
		await this.save(state);
		return Response.json({ ok: true, key, active: false });
	}

	private async runStatus(params: Record<string, unknown>) {
		const key = String(params.key ?? "").trim();
		if (!key) return new Response("key required", { status: 400 });
		const state = await this.load();
		const entry = state.sessions[key];
		if (!entry) return new Response("not_found", { status: 404 });
		return Response.json({
			ok: true,
			key,
			active: entry.runActive === true,
			runActiveAt: entry.runActiveAt ?? null,
			runEndedAt: entry.runEndedAt ?? null,
		});
	}
}
