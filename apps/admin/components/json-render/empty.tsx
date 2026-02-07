"use client";

import { type ComponentRenderProps } from "@json-render/react";
import { Button as UiButton } from "@/components/ui/button";
import {
	Empty as UiEmpty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";

export function Empty({ element, onAction }: ComponentRenderProps) {
	const { title, description, action, actionLabel } = element.props as {
		title: string;
		description?: string | null;
		action?: string | null;
		actionLabel?: string | null;
	};

	return (
		<UiEmpty>
			<EmptyHeader>
				<EmptyTitle>{title}</EmptyTitle>
				{description && <EmptyDescription>{description}</EmptyDescription>}
			</EmptyHeader>
			{action && actionLabel && (
				<EmptyContent>
					<UiButton
						type="button"
						onClick={() => onAction?.({ name: action })}
					>
						{actionLabel}
					</UiButton>
				</EmptyContent>
			)}
		</UiEmpty>
	);
}
