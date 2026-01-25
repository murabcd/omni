import * as React from "react";

import { cn } from "@/lib/utils";

export type BadgeProps = React.HTMLAttributes<HTMLDivElement>;

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
	({ className, ...props }, ref) => (
		<div
			ref={ref}
			className={cn(
				"inline-flex items-center border border-border/60 px-2 py-0.5 text-xs font-medium text-foreground/80 transition-colors",
				className,
			)}
			{...props}
		/>
	),
);

Badge.displayName = "Badge";

export { Badge };
