"use client";

import { type ComponentRenderProps, useData } from "@json-render/react";
import { getByPath } from "@json-render/core";
import { Switch as UiSwitch } from "@/components/ui/switch";
import { Label as UiLabel } from "@/components/ui/label";

export function Switch({ element }: ComponentRenderProps) {
	const { label, checked, bindPath } = element.props as {
		label?: string | null;
		checked?: boolean | null;
		bindPath?: string | null;
	};

	const { data, set } = useData();
	const boundValue = bindPath ? (getByPath(data, bindPath) as boolean) : undefined;
	const value = boundValue ?? checked ?? false;

	return (
		<label className="flex items-center gap-2">
			<UiSwitch
				checked={!!value}
				onCheckedChange={(next) => {
					if (bindPath) set(bindPath, !!next);
				}}
			/>
			{label && <UiLabel className="text-sm font-medium">{label}</UiLabel>}
		</label>
	);
}
