"use client";

import React from "react";
import { type ComponentRenderProps } from "@json-render/react";

export function Heading({ element }: ComponentRenderProps) {
	const { text, level } = element.props as {
		text: string;
		level?: string | null;
	};
	const Tag = (level || "h2") as keyof React.JSX.IntrinsicElements;
	const sizes: Record<string, string> = {
		h1: "text-3xl",
		h2: "text-2xl",
		h3: "text-xl",
		h4: "text-base",
	};
	return (
		<Tag
			className={`mb-4 font-semibold ${sizes[level || "h2"]}`}
		>
			{text}
		</Tag>
	);
}
