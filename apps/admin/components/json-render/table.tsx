"use client";

import { type ComponentRenderProps, useData } from "@json-render/react";
import { getByPath } from "@json-render/core";
import {
	Table as UiTable,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge as UiBadge } from "@/components/ui/badge";

export function Table({ element }: ComponentRenderProps) {
	const { title, dataPath, columns } = element.props as {
		title?: string | null;
		dataPath: string;
		columns: Array<{ key: string; label: string; format?: string | null }>;
	};

	const { data } = useData();
	const tableData = getByPath(data, dataPath) as
		| Array<Record<string, unknown>>
		| undefined;

	if (!Array.isArray(columns) || columns.length === 0) {
		return (
			<div className="p-5 text-muted-foreground">No columns</div>
		);
	}

	if (!tableData || !Array.isArray(tableData)) {
		return (
			<div className="p-5 text-muted-foreground">No data</div>
		);
	}

	const formatCell = (value: unknown, format?: string | null) => {
		if (value === null || value === undefined) return "-";
		if (format === "currency" && typeof value === "number") {
			return new Intl.NumberFormat("en-US", {
				style: "currency",
				currency: "USD",
			}).format(value);
		}
		if (format === "date" && typeof value === "string") {
			return new Date(value).toLocaleDateString();
		}
		if (format === "badge") {
			return <UiBadge variant="outline">{String(value)}</UiBadge>;
		}
		return String(value);
	};

	return (
		<div className="space-y-3">
			{title && <h4 className="text-sm font-semibold">{title}</h4>}
			<UiTable>
				<TableHeader>
					<TableRow>
						{columns.map((col) => (
							<TableHead key={col.key} className="uppercase tracking-wider">
								{col.label}
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{tableData.map((row, i) => (
						<TableRow key={i}>
							{columns.map((col) => (
								<TableCell key={col.key}>
									{formatCell(row[col.key], col.format)}
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</UiTable>
		</div>
	);
}
