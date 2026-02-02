"use client";

import { type ComponentRenderProps } from "@json-render/react";
import {
	Sheet as UiSheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Button as UiButton } from "@/components/ui/button";

export function Sheet({ element, children }: ComponentRenderProps) {
	const { triggerLabel, title, description, side } = element.props as {
		triggerLabel: string;
		title?: string | null;
		description?: string | null;
		side?: string | null;
	};

	return (
		<UiSheet>
			<SheetTrigger asChild>
				<UiButton variant="secondary">{triggerLabel}</UiButton>
			</SheetTrigger>
			<SheetContent side={(side as "top" | "right" | "bottom" | "left") ?? "right"}>
				{(title || description) && (
					<SheetHeader>
						{title && <SheetTitle>{title}</SheetTitle>}
						{description && <SheetDescription>{description}</SheetDescription>}
					</SheetHeader>
				)}
				{children}
			</SheetContent>
		</UiSheet>
	);
}
