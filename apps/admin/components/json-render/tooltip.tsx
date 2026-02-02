"use client";

import { type ComponentRenderProps } from "@json-render/react";
import {
	Tooltip as UiTooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

export function Tooltip({ element, children }: ComponentRenderProps) {
	const { text, side } = element.props as {
		text: string;
		side?: string | null;
	};

	const trigger = children ?? (
		<span className="text-sm underline decoration-dotted">{text}</span>
	);

	return (
		<TooltipProvider>
			<UiTooltip>
				<TooltipTrigger asChild>
					<span className="inline-flex items-center">{trigger}</span>
				</TooltipTrigger>
				<TooltipContent side={(side as "top" | "right" | "bottom" | "left") ?? "top"}>
					{text}
				</TooltipContent>
			</UiTooltip>
		</TooltipProvider>
	);
}
