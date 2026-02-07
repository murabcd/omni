"use client";

import { type ComponentRenderProps } from "@json-render/react";
import {
	Avatar as UiAvatar,
	AvatarFallback,
	AvatarImage,
} from "@/components/ui/avatar";

export function Avatar({ element }: ComponentRenderProps) {
	const { src, alt, fallback, size } = element.props as {
		src?: string | null;
		alt?: string | null;
		fallback?: string | null;
		size?: string | null;
	};

	const sizeClasses: Record<string, string> = {
		sm: "h-8 w-8",
		md: "h-10 w-10",
		lg: "h-12 w-12",
	};
	const resolvedFallback =
		(fallback || alt || "?").trim().slice(0, 2).toUpperCase();

	return (
		<UiAvatar className={sizeClasses[size ?? "md"] ?? sizeClasses.md}>
			{src && <AvatarImage src={src} alt={alt ?? ""} />}
			<AvatarFallback>{resolvedFallback}</AvatarFallback>
		</UiAvatar>
	);
}
