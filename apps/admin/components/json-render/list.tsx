"use client";

import { type ComponentRenderProps, useData } from "@json-render/react";
import { getByPath } from "@json-render/core";

export function List({ element, children }: ComponentRenderProps) {
	const { dataPath, emptyMessage } = element.props as {
		dataPath: string;
		emptyMessage?: string | null;
	};
	const { data } = useData();
	const listData = getByPath(data, dataPath) as Array<unknown> | undefined;

	if (!listData || !Array.isArray(listData)) {
		return (
			<div style={{ color: "var(--muted-foreground)" }}>
				{emptyMessage || "No items"}
			</div>
		);
	}

	return <div>{children}</div>;
}
