"use client";

import { type ComponentRenderProps } from "@json-render/react";
import { Button as UiButton } from "@/components/ui/button";

export function Empty({ element, onAction }: ComponentRenderProps) {
	const { title, description, action, actionLabel } = element.props as {
		title: string;
		description?: string | null;
		action?: string | null;
		actionLabel?: string | null;
	};

	return (
		<div className="py-10 text-center">
			<h3 className="mb-2 text-base font-semibold">{title}</h3>
			{description && (
				<p className="text-sm text-muted-foreground">{description}</p>
			)}
			{action && actionLabel && (
				<UiButton
					type="button"
					className="mt-4"
					onClick={() => onAction?.({ name: action })}
				>
					{actionLabel}
				</UiButton>
			)}
		</div>
	);
}
