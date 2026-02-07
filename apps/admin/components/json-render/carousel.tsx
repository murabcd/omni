"use client";

import React from "react";
import { type ComponentRenderProps } from "@json-render/react";
import {
	Carousel as UiCarousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "@/components/ui/carousel";

export function Carousel({ element, children }: ComponentRenderProps) {
	const { orientation, showControls } = element.props as {
		orientation?: string | null;
		showControls?: boolean | null;
	};

	const items = React.Children.toArray(children);
	if (items.length === 0) return null;

	return (
		<UiCarousel
			orientation={orientation === "vertical" ? "vertical" : "horizontal"}
		>
			<CarouselContent>
				{items.map((child, index) => (
					<CarouselItem key={index}>{child}</CarouselItem>
				))}
			</CarouselContent>
			{showControls !== false && (
				<>
					<CarouselPrevious />
					<CarouselNext />
				</>
			)}
		</UiCarousel>
	);
}
