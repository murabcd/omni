"use client";

import { type ComponentRenderProps } from "@json-render/react";
import {
	AlertDialog as UiAlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button as UiButton } from "@/components/ui/button";

export function AlertDialog({ element, onAction, children }: ComponentRenderProps) {
	const { triggerLabel, title, description, actionLabel, cancelLabel, action } =
		element.props as {
			triggerLabel: string;
			title: string;
			description?: string | null;
			actionLabel?: string | null;
			cancelLabel?: string | null;
			action?: string | null;
		};

	return (
		<UiAlertDialog>
			<AlertDialogTrigger asChild>
				<UiButton variant="destructive">{triggerLabel}</UiButton>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					{description && (
						<AlertDialogDescription>{description}</AlertDialogDescription>
					)}
				</AlertDialogHeader>
				{children}
				<AlertDialogFooter>
					<AlertDialogCancel>{cancelLabel ?? "Cancel"}</AlertDialogCancel>
					<AlertDialogAction
						onClick={() =>
							action ? onAction?.({ name: action }) : undefined
						}
					>
						{actionLabel ?? "Continue"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</UiAlertDialog>
	);
}
