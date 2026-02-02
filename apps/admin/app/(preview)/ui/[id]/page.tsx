import { UiRenderer } from "./ui-renderer";

export const dynamic = "force-dynamic";

type PageProps = {
	params: Promise<{ id: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type UiPayload = {
	id: string;
	createdAt?: number;
	title?: string;
	notes?: string;
	tree: unknown;
	data?: Record<string, unknown>;
};

function resolveParam(value: string | string[] | undefined) {
	if (!value) return "";
	return Array.isArray(value) ? (value[0] ?? "") : value;
}

export default async function UiPreviewPage({
	params,
	searchParams,
}: PageProps) {
	const resolvedParams = await params;
	const resolvedSearchParams = await searchParams;
	const id = resolvedParams.id;
	const exp = resolveParam(resolvedSearchParams.exp);
	const sig = resolveParam(resolvedSearchParams.sig);
	const baseUrl = process.env.NEXT_PUBLIC_ADMIN_API_BASE ?? "";

	if (!id || !exp || !sig) {
		return (
			<div className="mx-auto max-w-3xl px-6 py-16 text-foreground">
				<h1 className="text-2xl font-semibold">Missing preview token</h1>
				<p className="mt-3 text-muted-foreground">
					This preview link is incomplete or expired. Request a new UI preview
					from the bot.
				</p>
			</div>
		);
	}

	if (!baseUrl) {
		return (
			<div className="mx-auto max-w-3xl px-6 py-16 text-foreground">
				<h1 className="text-2xl font-semibold">Admin API base missing</h1>
				<p className="mt-3 text-muted-foreground">
					Set NEXT_PUBLIC_ADMIN_API_BASE to the gateway base URL.
				</p>
			</div>
		);
	}

	const dataUrl = `${baseUrl.replace(/\/$/, "")}/ui/${encodeURIComponent(id)}?exp=${encodeURIComponent(exp)}&sig=${encodeURIComponent(sig)}`;
	const response = await fetch(dataUrl, { cache: "no-store" });
	if (!response.ok) {
		return (
			<div className="mx-auto max-w-3xl px-6 py-16 text-foreground">
				<h1 className="text-2xl font-semibold">Preview not available</h1>
				<p className="mt-3 text-muted-foreground">
					Unable to load UI data. Status: {response.status}.
				</p>
			</div>
		);
	}

	const payload = (await response.json()) as UiPayload;

	return <UiRenderer payload={payload} />;
}
