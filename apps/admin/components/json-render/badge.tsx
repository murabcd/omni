"use client";

import { type ComponentRenderProps, useData } from "@json-render/react";
import { getByPath } from "@json-render/core";
import { Badge as UiBadge } from "@/components/ui/badge";

function useResolvedValue<T>(
	value: T | { path: string } | null | undefined,
): T | undefined {
	const { data } = useData();
	if (value === null || value === undefined) return undefined;
	if (typeof value === "object" && "path" in value) {
		return getByPath(data, value.path) as T | undefined;
	}
	return value as T;
}

export function Badge({ element }: ComponentRenderProps) {
	const { text, variant } = element.props as {
		text: string | { path: string };
		variant?: string | null;
	};
	const resolvedText = useResolvedValue(text);

	const colors: Record<string, string> = {
		default: "var(--foreground)",
		success: "var(--chart-2)",
		warning: "var(--chart-4)",
		danger: "var(--destructive)",
		error: "var(--destructive)",
		info: "var(--muted-foreground)",
	};

	return (
		<UiBadge
			variant="outline"
			style={{ color: colors[variant || "default"] }}
		>
			{resolvedText}
		</UiBadge>
	);
}
