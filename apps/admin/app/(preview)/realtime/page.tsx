"use client";

import { buildSystemPrompt, buildToolInstructions } from "@omni/prompts";
import {
	OpenAIRealtimeWebRTC,
	RealtimeAgent,
	RealtimeSession,
	tool,
} from "@openai/agents/realtime";
import { useCallback, useRef, useState } from "react";
import {
	type AgentConnectionState,
	ConversationBar,
} from "@/components/ai-elements/conversation-bar";

type SessionStatus = "idle" | "connecting" | "connected" | "error";
type ToolCatalogEntry = {
	name: string;
	description?: string;
	inputHint?: string;
	parameters?: Record<string, unknown>;
};
type ToolOptions = Parameters<typeof tool>[0];
type NonStrictToolOptions = Extract<ToolOptions, { strict: false }>;
type NonStrictParameters = NonStrictToolOptions["parameters"];

export default function RealtimePreviewPage() {
	const [status, setStatus] = useState<SessionStatus>("idle");
	const [error, setError] = useState<string | null>(null);
	const [muted, setMuted] = useState(false);

	const audioRef = useRef<HTMLAudioElement | null>(null);
	const sessionRef = useRef<RealtimeSession | null>(null);

	const cleanup = useCallback(() => {
		sessionRef.current?.close();
		sessionRef.current = null;
		if (audioRef.current) {
			audioRef.current.srcObject = null;
		}
		setMuted(false);
	}, []);

	const logEvent = useCallback((line: string) => {
		console.debug(line);
	}, []);

	const fetchToolCatalog = useCallback(async () => {
		const res = await fetch("/api/tools/catalog");
		const json = await res.json();
		const list = Array.isArray(json?.tools)
			? (json.tools as ToolCatalogEntry[])
			: [];
		return list;
	}, []);

	const callTool = useCallback(
		async (toolName: string, input: Record<string, unknown>) => {
			logEvent(`→ ${toolName} ${JSON.stringify(input)}`);
			try {
				const res = await fetch("/api/tools/call", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ tool: toolName, input }),
				});
				const payload = await res.json();
				logEvent(`← ${toolName} ${JSON.stringify(payload)}`);
				return payload;
			} catch (err) {
				const message = String(err);
				logEvent(`← ${toolName} error: ${message}`);
				return { error: message };
			}
		},
		[logEvent],
	);

	const buildInstructions = useCallback((toolLines: string) => {
		const base = buildSystemPrompt({
			modelRef: "gpt-realtime",
			modelName: "GPT Realtime",
			reasoning: "standard",
		});
		const toolRules = buildToolInstructions({ toolLines });
		return [base, toolRules].join("\n\n");
	}, []);

	const buildToolsFromCatalog = useCallback(
		(entries: ToolCatalogEntry[]) => {
			const fallbackParameters = {
				type: "object",
				properties: {},
				additionalProperties: true,
			} as NonStrictParameters;
			return entries.map((entry) =>
				tool({
					name: entry.name,
					description: entry.description,
					parameters:
						entry.parameters && typeof entry.parameters === "object"
							? (entry.parameters as NonStrictParameters)
							: fallbackParameters,
					strict: false,
					execute: async (input: unknown) =>
						callTool(
							entry.name,
							typeof input === "object" && input
								? (input as Record<string, unknown>)
								: {},
						),
				}),
			);
		},
		[callTool],
	);

	const connect = useCallback(async () => {
		if (status === "connecting" || status === "connected") return;
		setStatus("connecting");
		setError(null);

		try {
			const catalog = await fetchToolCatalog();
			const toolLines = catalog
				.map((entry) =>
					entry.description
						? `${entry.name} - ${entry.description}`
						: entry.name,
				)
				.join("\n");
			const instructions = buildInstructions(toolLines);
			const tools = buildToolsFromCatalog(catalog);
			const tokenRes = await fetch("/api/realtime/token", { method: "POST" });
			const tokenJson = await tokenRes.json();
			const clientSecret =
				tokenJson?.client_secret?.value ?? tokenJson?.value ?? null;

			if (!tokenRes.ok || !clientSecret) {
				throw new Error(tokenJson?.error || "Failed to fetch client secret.");
			}

			const rootAgent = new RealtimeAgent({
				name: "omniRealtime",
				voice: "cedar",
				instructions,
				tools,
			});

			const session = new RealtimeSession(rootAgent, {
				transport: new OpenAIRealtimeWebRTC({
					audioElement: audioRef.current ?? undefined,
				}),
				model: "gpt-realtime",
				config: {
					inputAudioTranscription: { model: "gpt-4o-mini-transcribe" },
				},
			});
			sessionRef.current = session;

			session.on("error", (err: unknown) => {
				logEvent(`session error: ${String(err)}`);
			});
			session.on(
				"agent_tool_start",
				(_details: unknown, _agent: unknown, call: unknown) => {
					const name =
						typeof call === "object" && call && "name" in call
							? String((call as { name?: unknown }).name ?? "unknown")
							: "unknown";
					logEvent(`tool start: ${name}`);
				},
			);
			session.on(
				"agent_tool_end",
				(
					_details: unknown,
					_agent: unknown,
					call: unknown,
					result: unknown,
				) => {
					const name =
						typeof call === "object" && call && "name" in call
							? String((call as { name?: unknown }).name ?? "unknown")
							: "unknown";
					logEvent(`tool end: ${name} ${JSON.stringify(result)}`);
				},
			);
			session.on("transport_event", (event: unknown) => {
				const type =
					typeof event === "object" && event && "type" in event
						? String((event as { type?: unknown }).type ?? "")
						: "";
				if (type) logEvent(`event: ${type}`);
			});

			await session.connect({ apiKey: clientSecret });
			logEvent("session connected");

			setStatus("connected");
		} catch (err) {
			setStatus("error");
			setError(String(err));
			logEvent(`connect error: ${String(err)}`);
			cleanup();
		}
	}, [
		buildInstructions,
		buildToolsFromCatalog,
		cleanup,
		fetchToolCatalog,
		logEvent,
		status,
	]);

	const disconnect = useCallback(() => {
		cleanup();
		setStatus("idle");
	}, [cleanup]);

	const toggleMute = useCallback(() => {
		if (!sessionRef.current) return;
		const next = !muted;
		sessionRef.current.mute(next);
		setMuted(next);
	}, [muted]);

	const isConnected = status === "connected";
	const isConnecting = status === "connecting";
	const driverState: AgentConnectionState =
		status === "connected"
			? "connected"
			: status === "connecting"
				? "connecting"
				: "disconnected";

	return (
		<div className="flex min-h-dvh items-center justify-center bg-background px-4">
			<div className="flex w-full max-w-2xl flex-col items-center gap-4 text-center">
				<ConversationBar
					className="w-full"
					driver={{
						state: driverState,
						muted,
						onToggleMute: toggleMute,
						onStartOrEnd: () => {
							if (isConnected || isConnecting) {
								disconnect();
							} else {
								connect();
							}
						},
						onSendMessage: (message) => {
							if (!sessionRef.current) return;
							try {
								sessionRef.current.sendMessage(message);
								sessionRef.current.transport.sendEvent({
									type: "response.create",
								});
							} catch (err) {
								console.debug("send message error:", err);
							}
						},
						onContextualUpdate: (message) => {
							console.debug("context update:", message);
						},
					}}
				/>
				{error && (
					<div className="w-full rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
						{error}
					</div>
				)}
				{/* biome-ignore lint/a11y/useMediaCaption: remote stream has no caption track */}
				<audio ref={audioRef} autoPlay className="hidden" />
			</div>
		</div>
	);
}
