"use client";

import { type ComponentRenderProps } from "@json-render/react";
import {
	Card as UiCard,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export function Card({ element, children }: ComponentRenderProps) {
	const { title, description, padding } = element.props as {
		title?: string | null;
		description?: string | null;
		padding?: string | null;
	};

	const paddingClasses: Record<string, string> = {
		none: "p-0",
		sm: "p-3",
		md: "p-4",
		lg: "p-6",
	};

	return (
		<UiCard className="border-border bg-card text-card-foreground hover:bg-accent/50 dark:border-border dark:bg-card dark:hover:bg-accent/50 dark:hover:border-border">
			{(title || description) && (
				<CardHeader className="border-b border-border/60">
					{title && <CardTitle className="text-base">{title}</CardTitle>}
					{description && <CardDescription>{description}</CardDescription>}
				</CardHeader>
			)}
			<CardContent className={paddingClasses[padding ?? "md"] ?? "p-4"}>
				{children}
			</CardContent>
		</UiCard>
	);
}
