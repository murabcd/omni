"use client";

import React from "react";
import { type ComponentRenderProps } from "@json-render/react";
import {
	Tabs as UiTabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/components/ui/tabs";

type TabPanelProps = {
	value: string;
	label?: string | null;
	children?: React.ReactNode;
};

export function Tabs({ element, children }: ComponentRenderProps) {
	const { defaultValue, value, orientation } = element.props as {
		defaultValue?: string | null;
		value?: string | null;
		orientation?: string | null;
	};

	const panels = React.Children.toArray(children).filter((child) =>
		React.isValidElement<TabPanelProps>(child),
	) as Array<React.ReactElement<TabPanelProps>>;

	const seenValues = new Set<string>();
	const tabItems = panels.filter((panel) => {
		const rawValue = panel.props?.value;
		if (typeof rawValue !== "string") return false;
		const nextValue = rawValue.trim();
		if (!nextValue) return false;
		if (seenValues.has(nextValue)) return false;
		seenValues.add(nextValue);
		return true;
	});

	const fallbackValue = tabItems[0]?.props?.value as string | undefined;

	if (tabItems.length === 0) return null;

	return (
		<UiTabs
			defaultValue={defaultValue ?? fallbackValue}
			value={value ?? undefined}
			orientation={orientation === "vertical" ? "vertical" : "horizontal"}
		>
			<TabsList>
				{tabItems.map((panel) => (
					<TabsTrigger key={panel.props.value} value={panel.props.value}>
						{panel.props.label ?? panel.props.value}
					</TabsTrigger>
				))}
			</TabsList>
			{tabItems.map((panel) => (
				<TabsContent key={panel.props.value} value={panel.props.value}>
					{panel.props.children}
				</TabsContent>
			))}
		</UiTabs>
	);
}
