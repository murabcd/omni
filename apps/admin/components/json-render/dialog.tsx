"use client";

import { type ComponentRenderProps } from "@json-render/react";
import {
	Dialog as UiDialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Button as UiButton } from "@/components/ui/button";

export function Dialog({ element, children }: ComponentRenderProps) {
	const { triggerLabel, title, description } = element.props as {
		triggerLabel: string;
		title: string;
		description?: string | null;
	};

	return (
		<UiDialog>
			<DialogTrigger asChild>
				<UiButton variant="secondary">{triggerLabel}</UiButton>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description && (
						<DialogDescription>{description}</DialogDescription>
					)}
				</DialogHeader>
				{children}
			</DialogContent>
		</UiDialog>
	);
}
