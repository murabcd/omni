"use client";

import { type ComponentRenderProps } from "@json-render/react";
import {
	Collapsible as UiCollapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button as UiButton } from "@/components/ui/button";

export function Collapsible({ element, children }: ComponentRenderProps) {
	const { triggerLabel, defaultOpen } = element.props as {
		triggerLabel: string;
		defaultOpen?: boolean | null;
	};

	return (
		<UiCollapsible defaultOpen={defaultOpen ?? undefined}>
			<CollapsibleTrigger asChild>
				<UiButton variant="ghost" size="sm">
					{triggerLabel}
				</UiButton>
			</CollapsibleTrigger>
			<CollapsibleContent className="mt-2">{children}</CollapsibleContent>
		</UiCollapsible>
	);
}
