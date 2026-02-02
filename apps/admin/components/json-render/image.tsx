"use client";

import type { ComponentRenderProps } from "@json-render/react";
import Image from "next/image";

type ImageProps = {
	src?: string;
	alt?: string;
	caption?: string;
	width?: number;
	height?: number;
};

export function ImageBlock({ element }: ComponentRenderProps<ImageProps>) {
	return (
		<figure className="overflow-hidden rounded-md border bg-muted/20">
			<Image
				alt={element.props?.alt ?? ""}
				src={element.props?.src ?? ""}
				width={element.props?.width ?? 1200}
				height={element.props?.height ?? 800}
				className="h-auto w-full object-cover"
				sizes="(max-width: 768px) 100vw, 1200px"
				unoptimized
			/>
			{element.props?.caption && (
				<figcaption className="px-4 py-3 text-xs text-muted-foreground">
					{element.props.caption}
				</figcaption>
			)}
		</figure>
	);
}
