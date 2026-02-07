"use client";

import { type ComponentRenderProps } from "@json-render/react";
import { useIsMobile } from "@/hooks/use-mobile";

export function Grid({ element, children }: ComponentRenderProps) {
	const { columns, gap } = element.props as {
		columns?: number | null;
		gap?: string | null;
	};
	const isMobile = useIsMobile();
	const gaps: Record<string, string> = {
		none: "0",
		sm: "8px",
		md: "16px",
		lg: "24px",
	};
	const resolvedColumns =
		typeof columns === "number" && columns > 0 ? columns : 2;

	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: `repeat(${isMobile ? 1 : resolvedColumns}, 1fr)`,
				gap: gaps[gap || "md"],
			}}
		>
			{children}
		</div>
	);
}
