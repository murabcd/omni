import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOOL_SERVICE_URL = process.env.TOOL_SERVICE_URL ?? "";
const TOOL_SERVICE_SECRET = process.env.TOOL_SERVICE_SECRET ?? "";

export async function GET() {
	if (!TOOL_SERVICE_URL.trim() || !TOOL_SERVICE_SECRET.trim()) {
		return NextResponse.json(
			{ error: "TOOL_SERVICE_URL/TOOL_SERVICE_SECRET not configured." },
			{ status: 500 },
		);
	}

	try {
		const baseUrl = TOOL_SERVICE_URL.replace(/\/+$/, "");
		const response = await fetch(`${baseUrl}/catalog`, {
			method: "GET",
			headers: {
				"x-omni-tool-secret": TOOL_SERVICE_SECRET,
			},
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

		if (!text.trim()) return NextResponse.json({ tools: [] });
		try {
			return NextResponse.json(JSON.parse(text));
		} catch {
			return NextResponse.json({ tools: [], result: text });
		}
	} catch (error) {
		return NextResponse.json(
			{ error: `tool_service_failed:${String(error)}` },
			{ status: 502 },
		);
	}
}
