"use client";

import type { ComponentRenderProps } from "@json-render/react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

type SectionProps = {
	title?: string;
	description?: string;
};

export function Section({
	element,
	children,
}: ComponentRenderProps<SectionProps>) {
	return (
		<Card>
			{(element.props?.title || element.props?.description) && (
				<CardHeader>
					{element.props?.title && (
						<CardTitle>{element.props.title}</CardTitle>
					)}
					{element.props?.description && (
						<CardDescription>
							{element.props.description}
						</CardDescription>
					)}
				</CardHeader>
			)}
			<CardContent className="pt-0">
				<div className="flex flex-col gap-6">{children}</div>
			</CardContent>
		</Card>
	);
}
