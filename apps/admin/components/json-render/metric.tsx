"use client";

import { type ComponentRenderProps, useData } from "@json-render/react";
import { getByPath } from "@json-render/core";
import { Progress } from "@/components/ui/progress";

export function Metric({ element }: ComponentRenderProps) {
	const { label, valuePath, format, trend, trendValue, progress, progressLabel } =
		element.props as {
		label: string;
		valuePath: string;
		format?: string | null;
		trend?: string | null;
		trendValue?: string | null;
		progress?: number | null;
		progressLabel?: string | null;
	};

	const { data } = useData();
	const rawValue = getByPath(data, valuePath);

	let displayValue = String(rawValue ?? "-");
	if (format === "currency" && typeof rawValue === "number") {
		displayValue = new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
		}).format(rawValue);
	} else if (format === "percent" && typeof rawValue === "number") {
		displayValue = new Intl.NumberFormat("en-US", {
			style: "percent",
			minimumFractionDigits: 1,
		}).format(rawValue);
	} else if (format === "number" && typeof rawValue === "number") {
		displayValue = new Intl.NumberFormat("en-US").format(rawValue);
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
			<span style={{ fontSize: 14, color: "var(--muted-foreground)" }}>
				{label}
			</span>
			<span style={{ fontSize: 32, fontWeight: 600 }}>{displayValue}</span>
			{typeof progress === "number" && Number.isFinite(progress) && (
				<div className="flex flex-col gap-2 pt-2">
					<Progress value={Math.max(0, Math.min(100, progress))} />
					{progressLabel && (
						<span className="text-xs text-muted-foreground">
							{progressLabel}
						</span>
					)}
				</div>
			)}
			{(trend || trendValue) && (
				<span
					style={{
						fontSize: 14,
						color:
							trend === "up"
							? "var(--chart-2)"
							: trend === "down"
								? "var(--destructive)"
								: "var(--muted-foreground)",
					}}
				>
					{trend === "up" ? "+" : trend === "down" ? "-" : ""}
					{trendValue}
				</span>
			)}
		</div>
	);
}
