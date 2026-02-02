"use client";

import { type ComponentRenderProps, useData } from "@json-render/react";
import { getByPath } from "@json-render/core";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { Label as UiLabel } from "@/components/ui/label";

export function Textarea({ element }: ComponentRenderProps) {
	const { label, valuePath, placeholder, rows } = element.props as {
		label?: string | null;
		valuePath: string;
		placeholder?: string | null;
		rows?: number | null;
	};

	const { data, set } = useData();
	const value = getByPath(data, valuePath) as string | undefined;

	return (
		<div className="flex flex-col gap-2">
			{label && <UiLabel className="text-sm font-medium">{label}</UiLabel>}
			<UiTextarea
				rows={rows ?? undefined}
				value={value ?? ""}
				placeholder={placeholder ?? ""}
				onChange={(e) => set(valuePath, e.target.value)}
			/>
		</div>
	);
}
