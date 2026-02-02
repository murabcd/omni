"use client";

import type { ComponentRenderProps } from "@json-render/react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatProps = {
	label?: string;
	value?: string;
	delta?: string;
	deltaTone?: string;
};

const deltaToneClasses: Record<string, string> = {
	success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
	warning: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
	danger: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
	default: "bg-muted text-foreground",
};

export function Stat({ element }: ComponentRenderProps<StatProps>) {
	return (
		<div className="flex flex-col gap-2">
			<p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
				{element.props?.label}
			</p>
			<div className="flex items-baseline gap-3">
				<span className="text-2xl font-semibold text-foreground">
					{element.props?.value}
				</span>
				{element.props?.delta && (
					<Badge
						className={cn(
							"rounded-full px-2 py-0.5 text-xs",
							deltaToneClasses[element.props?.deltaTone ?? "success"],
						)}
					>
						{element.props.delta}
					</Badge>
				)}
			</div>
		</div>
	);
}
