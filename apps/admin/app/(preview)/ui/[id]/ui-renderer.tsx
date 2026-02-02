"use client";

import {
	ActionProvider,
	DataProvider,
	Renderer,
	type RendererProps,
	ValidationProvider,
	VisibilityProvider,
} from "@json-render/react";
import { useMemo } from "react";
import { componentRegistry } from "../../../../components/json-render";

type UiPayload = {
	id: string;
	createdAt?: number;
	title?: string;
	notes?: string;
	tree: unknown;
	data?: Record<string, unknown>;
};

type RendererTree = RendererProps["tree"];

export function UiRenderer({ payload }: { payload: UiPayload }) {
	const actions = useMemo(
		() => ({
			open_url: (params: Record<string, unknown>) => {
				const url = typeof params?.url === "string" ? params.url : "";
				if (url) window.open(url, "_blank", "noopener,noreferrer");
			},
			refresh: () => window.location.reload(),
			refresh_data: () => window.location.reload(),
			export: () => {},
			export_report: () => {},
			view_details: () => {},
			apply_filter: () => {},
		}),
		[],
	);

	const dataModel = payload.data ?? {
		ui: {
			title: payload.title ?? "UI Preview",
			createdAt: payload.createdAt ?? Date.now(),
		},
	};

	return (
		<div className="min-h-screen bg-background text-foreground">
			<div>
				<div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-6 md:flex-row md:items-center md:justify-between">
					<div>
						<p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
							UI Preview
						</p>
						<h1 className="mt-2 text-2xl font-semibold">
							{payload.title ?? "Untitled UI"}
						</h1>
						{payload.notes && (
							<p className="mt-2 text-sm text-muted-foreground">
								{payload.notes}
							</p>
						)}
					</div>
					<div />
				</div>
			</div>

			<DataProvider initialData={dataModel}>
				<VisibilityProvider>
					<ActionProvider handlers={actions}>
						<ValidationProvider>
							<div className="mx-auto max-w-6xl px-6 pb-10">
								<Renderer
									tree={payload.tree as RendererTree}
									registry={componentRegistry}
								/>
							</div>
						</ValidationProvider>
					</ActionProvider>
				</VisibilityProvider>
			</DataProvider>
		</div>
	);
}
