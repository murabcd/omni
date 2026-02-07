"use client";

import type { Action } from "@json-render/core";
import { type ComponentRenderProps, useData } from "@json-render/react";
import { getByPath } from "@json-render/core";
import { Toggle as UiToggle } from "@/components/ui/toggle";

export function Toggle({ element, onAction }: ComponentRenderProps) {
	const {
		label,
		pressed,
		bindPath,
		variant,
		size,
		action,
	} = element.props as {
		label?: string | null;
		pressed?: boolean | null;
		bindPath?: string | null;
		variant?: string | null;
		size?: string | null;
		action?: string | Action | null;
	};

	const { data, set } = useData();
	const boundValue = bindPath ? getByPath(data, bindPath) : undefined;
	const resolvedPressed =
		typeof boundValue === "boolean" ? boundValue : pressed ?? false;
	const resolvedAction =
		typeof action === "string" ? { name: action } : action ?? undefined;
	const sizeMap: Record<string, "default" | "sm" | "lg"> = {
		sm: "sm",
		md: "default",
		lg: "lg",
	};

	return (
		<UiToggle
			pressed={resolvedPressed}
			onPressedChange={(nextPressed) => {
				if (bindPath) {
					set(bindPath, nextPressed);
				}
				if (resolvedAction) {
					const params = { ...(resolvedAction.params ?? {}), pressed: nextPressed };
					onAction?.({ ...resolvedAction, params });
				}
			}}
			variant={variant === "outline" ? "outline" : "default"}
			size={sizeMap[size ?? "md"] ?? "default"}
		>
			{label}
		</UiToggle>
	);
}
