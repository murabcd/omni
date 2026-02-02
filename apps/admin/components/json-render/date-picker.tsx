"use client";

import { type ComponentRenderProps, useData } from "@json-render/react";
import { getByPath } from "@json-render/core";
import { Input as UiInput } from "@/components/ui/input";
import { Label as UiLabel } from "@/components/ui/label";

export function DatePicker({ element }: ComponentRenderProps) {
	const { label, bindPath, placeholder } = element.props as {
		label?: string | null;
		bindPath: string;
		placeholder?: string | null;
	};
	const { data, set } = useData();
	const value = getByPath(data, bindPath) as string | undefined;

	return (
		<div className="flex flex-col gap-2">
			{label && <UiLabel className="text-sm font-medium">{label}</UiLabel>}
			<UiInput
				type="date"
				value={value ?? ""}
				onChange={(e) => set(bindPath, e.target.value)}
				placeholder={placeholder ?? ""}
			/>
		</div>
	);
}
