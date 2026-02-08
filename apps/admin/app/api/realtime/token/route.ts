import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		return NextResponse.json(
			{ error: "OPENAI_API_KEY is not configured." },
			{ status: 500 },
		);
	}

	const sessionConfig = {
		type: "realtime",
		model: "gpt-realtime",
		instructions:
			"You are a concise, helpful assistant. Keep responses short and friendly.",
		audio: {
			output: {
				voice: "cedar",
			},
		},
	};

	try {
		const response = await fetch(
			"https://api.openai.com/v1/realtime/client_secrets",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					expires_after: { anchor: "created_at", seconds: 600 },
					session: sessionConfig,
				}),
			},
		);

		const data = await response.json();
		if (!response.ok) {
			const detailText = JSON.stringify(data);
			return NextResponse.json(
				{
					error: `Failed to create client secret: ${detailText}`,
				},
				{ status: response.status },
			);
		}

		return NextResponse.json(data);
	} catch (error) {
		return NextResponse.json(
			{ error: `Token generation failed: ${String(error)}` },
			{ status: 500 },
		);
	}
}
