import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOOL_SERVICE_URL = process.env.TOOL_SERVICE_URL ?? "";
const TOOL_SERVICE_SECRET = process.env.TOOL_SERVICE_SECRET ?? "";

export async function POST(request: Request) {
	if (!TOOL_SERVICE_URL.trim() || !TOOL_SERVICE_SECRET.trim()) {
		return NextResponse.json(
			{ error: "TOOL_SERVICE_URL/TOOL_SERVICE_SECRET not configured." },
			{ status: 500 },
		);
	}

	let body: { tool?: string; input?: Record<string, unknown> } = {};
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return NextResponse.json({ error: "invalid_json" }, { status: 400 });
	}

	const tool = body.tool?.trim() ?? "";
	if (!tool)
		return NextResponse.json({ error: "missing_tool" }, { status: 400 });

	const payload = {
		tool,
		input: { ...(body.input ?? {}) },
		context: {
			requestId: `realtime:${Date.now()}`,
			source: "realtime",
		},
	};

	try {
		const baseUrl = TOOL_SERVICE_URL.replace(/\/+$/, "");
		const response = await fetch(`${baseUrl}/tool`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-omni-tool-secret": TOOL_SERVICE_SECRET,
			},
			body: JSON.stringify(payload),
		});

		const text = await response.text();
		if (!response.ok) {
			return NextResponse.json(
				{
					error: "tool_service_error",
					status: response.status,
					details: text,
				},
				{ status: 502 },
			);
		}

		if (!text.trim()) return NextResponse.json({ ok: true });
		try {
			return NextResponse.json(JSON.parse(text));
		} catch {
			return NextResponse.json({ result: text });
		}
	} catch (error) {
		return NextResponse.json(
			{ error: `tool_service_failed:${String(error)}` },
			{ status: 502 },
		);
	}
}
