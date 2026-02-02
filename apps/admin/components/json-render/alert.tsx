"use client";

import { type ComponentRenderProps } from "@json-render/react";
import {
	Alert as UiAlert,
	AlertDescription,
	AlertTitle,
} from "@/components/ui/alert";

export function Alert({ element }: ComponentRenderProps) {
	const { type, title, message, dismissible } = element.props as {
		type: string;
		title: string;
		message?: string | null;
		dismissible?: boolean | null;
	};

	const colors: Record<string, string> = {
		info: "var(--muted-foreground)",
		success: "var(--chart-2)",
		warning: "var(--chart-4)",
		error: "var(--destructive)",
	};

	return (
		<UiAlert
			variant={type === "error" ? "destructive" : "default"}
			style={{ color: colors[type || "info"] }}
		>
			<AlertTitle>{title}</AlertTitle>
			{message && <AlertDescription>{message}</AlertDescription>}
			{dismissible ? (
				<span className="ml-auto text-xs text-muted-foreground">×</span>
			) : null}
		</UiAlert>
	);
}
