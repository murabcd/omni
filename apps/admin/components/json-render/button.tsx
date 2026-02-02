"use client";

import { type ComponentRenderProps } from "@json-render/react";
import { Button as UiButton } from "@/components/ui/button";

export function Button({ element, onAction, loading }: ComponentRenderProps) {
	const { label, variant, size, action, disabled } = element.props as {
		label: string;
		variant?: string | null;
		size?: string | null;
		action: string | { name: string };
		disabled?: boolean | null;
	};

	const resolvedAction =
		typeof action === "string" ? { name: action } : action;
	const variantMap: Record<string, "default" | "secondary" | "destructive" | "ghost"> =
		{
			primary: "default",
			secondary: "secondary",
			danger: "destructive",
			ghost: "ghost",
		};
	const sizeMap: Record<string, "default" | "sm" | "lg"> = {
		sm: "sm",
		md: "default",
		lg: "lg",
	};

	return (
		<UiButton
			onClick={() => !disabled && resolvedAction && onAction?.(resolvedAction)}
			disabled={!!disabled || loading}
			type="button"
			variant={variantMap[variant ?? "primary"] ?? "default"}
			size={sizeMap[size ?? "md"] ?? "default"}
		>
			{loading ? "Loading..." : label}
		</UiButton>
	);
}
