"use client";

import { type ComponentRenderProps } from "@json-render/react";
import { Separator as UiSeparator } from "@/components/ui/separator";

export function Divider({ element }: ComponentRenderProps) {
	const { label } = element.props as { label?: string | null };
	if (!label) {
		return <UiSeparator className="my-4" />;
	}
	return (
		<div className="my-4 flex items-center gap-3">
			<UiSeparator className="flex-1" />
			<span className="text-xs text-muted-foreground">{label}</span>
			<UiSeparator className="flex-1" />
		</div>
	);
}
