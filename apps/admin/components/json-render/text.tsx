"use client";

import { type ComponentRenderProps } from "@json-render/react";

export function Text({ element }: ComponentRenderProps) {
	const { content, color, variant } = element.props as {
		content: string;
		color?: string | null;
		variant?: string | null;
	};
	const colors: Record<string, string> = {
		default: "var(--foreground)",
		muted: "var(--muted-foreground)",
		success: "var(--chart-2)",
		warning: "var(--chart-4)",
		danger: "var(--destructive)",
		error: "var(--destructive)",
	};
	const key = color || variant || "default";
	return (
		<p className="m-0" style={{ color: colors[key] || colors.default }}>
			{content}
		</p>
	);
}
