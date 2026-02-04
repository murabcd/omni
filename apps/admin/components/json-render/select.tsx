"use client";

import { type ComponentRenderProps, useData } from "@json-render/react";
import { getByPath } from "@json-render/core";
import { Label as UiLabel } from "@/components/ui/label";
import {
	Select as UiSelect,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export function Select({ element }: ComponentRenderProps) {
	const { label, bindPath, options, placeholder } = element.props as {
		label?: string | null;
		bindPath: string;
		options: Array<{ value: string; label: string }>;
		placeholder?: string | null;
	};

	const { data, set } = useData();
	const value = getByPath(data, bindPath) as string | undefined;

	return (
		<div className="flex flex-col gap-2">
			{label && <UiLabel className="text-sm font-medium">{label}</UiLabel>}
			<UiSelect
				value={value ?? undefined}
				onValueChange={(next) => set(bindPath, next)}
			>
				<SelectTrigger>
					<SelectValue placeholder={placeholder ?? ""} />
				</SelectTrigger>
				<SelectContent>
					{options
						.filter((opt) => opt.value !== "")
						.map((opt) => (
							<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
							</SelectItem>
						))}
				</SelectContent>
			</UiSelect>
		</div>
	);
}
