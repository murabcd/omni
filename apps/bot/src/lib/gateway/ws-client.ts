type GatewayRequestFrame = {
	type: "req";
	id: string;
	method: string;
	params?: unknown;
};

type GatewayResponseFrame = {
	type: "res";
	id: string;
	ok: boolean;
	payload?: unknown;
	error?: { message?: string };
};

function toWsUrl(baseUrl: string) {
	const url = new URL(baseUrl);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.pathname = "/gateway";
	url.search = "";
	return url.toString();
}

type PendingRequest = {
	resolve: (value: unknown) => void;
	reject: (reason?: unknown) => void;
};

export class GatewayWsClient {
	private ws: WebSocket | null = null;
	private pending = new Map<string, PendingRequest>();
	private opening: Promise<void> | null = null;
	private authenticated = false;

	constructor(
		private opts: {
			url: string;
			token: string;
		},
	) {}

	private async ensureOpen() {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
		if (this.opening) return this.opening;
		this.opening = new Promise<void>((resolve, reject) => {
			const wsUrl = toWsUrl(this.opts.url);
			const ws = new WebSocket(wsUrl);
			this.ws = ws;
			ws.onopen = () => resolve();
			ws.onerror = (event) => reject(event);
			ws.onclose = () => {
				this.ws = null;
				this.authenticated = false;
				for (const [, pending] of this.pending) {
					pending.reject(new Error("gateway_disconnected"));
				}
				this.pending.clear();
			};
			ws.onmessage = (event) => this.handleMessage(event.data);
		}).finally(() => {
			this.opening = null;
		});
		return this.opening;
	}

	private handleMessage(raw: unknown) {
		if (typeof raw !== "string") return;
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			return;
		}
		const frame = parsed as GatewayResponseFrame;
		if (frame.type === "res" && typeof frame.id === "string") {
			const pending = this.pending.get(frame.id);
			if (!pending) return;
			this.pending.delete(frame.id);
			if (frame.ok) {
				pending.resolve(frame.payload);
			} else {
				pending.reject(new Error(frame.error?.message ?? "request_failed"));
			}
		}
	}

	private async sendRequest<T = unknown>(
		method: string,
		params?: unknown,
	): Promise<T> {
		await this.ensureOpen();
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error("gateway_not_connected");
		}
		const id = crypto.randomUUID();
		const frame: GatewayRequestFrame = { type: "req", id, method, params };
		const promise = new Promise<T>((resolve, reject) => {
			this.pending.set(id, {
				resolve: (value) => resolve(value as T),
				reject,
			});
		});
		this.ws.send(JSON.stringify(frame));
		return promise;
	}

	async connect(): Promise<void> {
		if (this.authenticated) return;
		await this.sendRequest("connect", { token: this.opts.token });
		this.authenticated = true;
	}

	async request<T = unknown>(method: string, params?: unknown): Promise<T> {
		await this.connect();
		return this.sendRequest(method, params);
	}
}
