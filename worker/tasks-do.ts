import type {
	DurableObject,
	DurableObjectState,
	R2Bucket,
	Request as WorkerRequest,
	Response as WorkerResponse,
} from "@cloudflare/workers-types";

const TASKS_KEY = "tasks";
const TASKS_MAX = 2000;

const TASK_STATUSES = [
	"queued",
	"running",
	"succeeded",
	"failed",
	"canceled",
] as const;

type TaskStatus = (typeof TASK_STATUSES)[number];

type TaskProgress = {
	percent?: number;
	step?: number;
	totalSteps?: number;
	message?: string;
	updatedAt?: number;
};

type TaskResult = {
	text?: string;
	files?: Array<{ name: string; url?: string } | string>;
	images?: Array<{ url: string; alt?: string } | string>;
};

type TaskRecord = {
	id: string;
	status: TaskStatus;
	createdAt: number;
	updatedAt: number;
	startedAt?: number;
	finishedAt?: number;
	chatId: string;
	chatType: string;
	sessionKey: string;
	text: string;
	meta?: Record<string, unknown>;
	progress?: TaskProgress;
	result?: TaskResult;
	error?: string;
};

type TasksState = {
	tasks: Record<string, TaskRecord>;
};

function now() {
	return Date.now();
}

function clampPercent(value?: number) {
	if (!Number.isFinite(value)) return undefined;
	return Math.max(0, Math.min(100, value ?? 0));
}

async function readJson(bucket: R2Bucket | undefined, key: string) {
	if (!bucket) return null;
	const obj = await bucket.get(key);
	if (!obj) return null;
	return obj.json();
}

async function writeJson(
	bucket: R2Bucket | undefined,
	key: string,
	data: unknown,
) {
	if (!bucket) return;
	await bucket.put(key, JSON.stringify(data, null, 2), {
		httpMetadata: { contentType: "application/json" },
	});
}

function taskCheckpointKey(id: string) {
	return `tasks/${id}/checkpoint.json`;
}

export class TasksDO implements DurableObject {
	private state: DurableObjectState;
	private bucket?: R2Bucket;

	constructor(state: DurableObjectState, env: { omni?: R2Bucket }) {
		this.state = state;
		this.bucket = env.omni;
	}

	async fetch(request: WorkerRequest): Promise<WorkerResponse> {
		const url = new URL(request.url);
		const { pathname } = url;
		switch (pathname) {
			case "/create":
				return this.create(await request.json());
			case "/start":
				return this.start(await request.json());
			case "/progress":
				return this.progress(await request.json());
			case "/complete":
				return this.complete(await request.json());
			case "/fail":
				return this.fail(await request.json());
			case "/cancel":
				return this.cancel(await request.json());
			case "/status":
				return this.status(url.searchParams.get("id") ?? undefined);
			case "/list":
				return this.list(await request.json().catch(() => ({})));
			default:
				return new Response("Not Found", { status: 404 });
		}
	}

	private async load(): Promise<TasksState> {
		const state = (await this.state.storage.get(TASKS_KEY)) as
			| TasksState
			| undefined;
		return state ?? { tasks: {} };
	}

	private async save(state: TasksState) {
		await this.state.storage.put(TASKS_KEY, state);
	}

	private normalizeChatType(raw: unknown) {
		return raw === "group" || raw === "supergroup" || raw === "channel"
			? raw
			: "private";
	}

	private async create(body: Record<string, unknown>) {
		const sessionKey = String(body.sessionKey ?? "").trim();
		const chatId = String(body.chatId ?? "").trim();
		const text = typeof body.text === "string" ? body.text.trim() : "";
		if (!sessionKey || !chatId || !text) {
			return new Response("sessionKey, chatId, text required", { status: 400 });
		}
		const id =
			typeof body.id === "string" && body.id.trim()
				? body.id.trim()
				: crypto.randomUUID();
		const createdAt = now();
		const task: TaskRecord = {
			id,
			status: "queued",
			createdAt,
			updatedAt: createdAt,
			chatId,
			chatType: this.normalizeChatType(body.chatType),
			sessionKey,
			text,
			meta:
				body.meta && typeof body.meta === "object"
					? (body.meta as Record<string, unknown>)
					: undefined,
		};
		const state = await this.load();
		state.tasks[id] = task;
		if (Object.keys(state.tasks).length > TASKS_MAX) {
			const items = Object.values(state.tasks).sort(
				(a, b) => (a.updatedAt ?? a.createdAt) - (b.updatedAt ?? b.createdAt),
			);
			const overflow = items.length - TASKS_MAX;
			for (const item of items.slice(0, overflow)) {
				delete state.tasks[item.id];
			}
		}
		await this.save(state);
		await writeJson(this.bucket, taskCheckpointKey(id), task);
		return Response.json({ ok: true, id, task });
	}

	private async start(body: Record<string, unknown>) {
		const id = String(body.id ?? "").trim();
		if (!id) return new Response("id required", { status: 400 });
		const state = await this.load();
		const task = state.tasks[id];
		if (!task) return new Response("not_found", { status: 404 });
		const startedAt = now();
		task.status = "running";
		task.startedAt = task.startedAt ?? startedAt;
		task.updatedAt = startedAt;
		await this.save(state);
		await writeJson(this.bucket, taskCheckpointKey(id), task);
		return Response.json({ ok: true, task });
	}

	private async progress(body: Record<string, unknown>) {
		const id = String(body.id ?? "").trim();
		if (!id) return new Response("id required", { status: 400 });
		const state = await this.load();
		const task = state.tasks[id];
		if (!task) return new Response("not_found", { status: 404 });
		if (task.status !== "running" && task.status !== "queued") {
			return Response.json({ ok: true, task });
		}
		const updatedAt = now();
		const progress: TaskProgress = {
			percent: clampPercent(body.percent as number | undefined),
			step:
				typeof body.step === "number" ? Math.max(0, body.step) : undefined,
			totalSteps:
				typeof body.totalSteps === "number"
					? Math.max(0, body.totalSteps)
					: undefined,
			message:
				typeof body.message === "string" ? body.message : undefined,
			updatedAt,
		};
		task.progress = {
			...task.progress,
			...progress,
		};
		task.updatedAt = updatedAt;
		await this.save(state);
		await writeJson(this.bucket, taskCheckpointKey(id), task);
		return Response.json({ ok: true, task });
	}

	private async complete(body: Record<string, unknown>) {
		const id = String(body.id ?? "").trim();
		if (!id) return new Response("id required", { status: 400 });
		const state = await this.load();
		const task = state.tasks[id];
		if (!task) return new Response("not_found", { status: 404 });
		const finishedAt = now();
		task.status = "succeeded";
		task.finishedAt = finishedAt;
		task.updatedAt = finishedAt;
		task.result =
			body.result && typeof body.result === "object"
				? (body.result as TaskResult)
				: task.result;
		await this.save(state);
		await writeJson(this.bucket, taskCheckpointKey(id), task);
		return Response.json({ ok: true, task });
	}

	private async fail(body: Record<string, unknown>) {
		const id = String(body.id ?? "").trim();
		if (!id) return new Response("id required", { status: 400 });
		const state = await this.load();
		const task = state.tasks[id];
		if (!task) return new Response("not_found", { status: 404 });
		const finishedAt = now();
		task.status = "failed";
		task.finishedAt = finishedAt;
		task.updatedAt = finishedAt;
		task.error =
			typeof body.error === "string" ? body.error : task.error ?? "";
		await this.save(state);
		await writeJson(this.bucket, taskCheckpointKey(id), task);
		return Response.json({ ok: true, task });
	}

	private async cancel(body: Record<string, unknown>) {
		const id = String(body.id ?? "").trim();
		if (!id) return new Response("id required", { status: 400 });
		const state = await this.load();
		const task = state.tasks[id];
		if (!task) return new Response("not_found", { status: 404 });
		const finishedAt = now();
		task.status = "canceled";
		task.finishedAt = finishedAt;
		task.updatedAt = finishedAt;
		await this.save(state);
		await writeJson(this.bucket, taskCheckpointKey(id), task);
		return Response.json({ ok: true, task });
	}

	private async status(id?: string) {
		if (!id) return new Response("id required", { status: 400 });
		const state = await this.load();
		const task = state.tasks[id];
		if (!task) return new Response("not_found", { status: 404 });
		return Response.json({ ok: true, task });
	}

	private async list(body: Record<string, unknown>) {
		const limit = Number.parseInt(String(body.limit ?? ""), 10);
		const state = await this.load();
		const tasks = Object.values(state.tasks).sort(
			(a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt),
		);
		const items = Number.isFinite(limit) && limit > 0 ? tasks.slice(0, limit) : tasks;
		return Response.json({ ok: true, count: tasks.length, items });
	}
}
