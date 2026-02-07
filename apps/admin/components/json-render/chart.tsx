"use client";

import { type ComponentRenderProps, useData } from "@json-render/react";
import { getByPath } from "@json-render/core";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	type ChartConfig,
} from "@/components/ui/chart";

export function Chart({ element }: ComponentRenderProps) {
	const { title, dataPath, height } = element.props as {
		title?: string | null;
		dataPath: string;
		height?: number | null;
	};
	const { data } = useData();
	const chartData = getByPath(data, dataPath) as
		| Array<{ label: string; value: number }>
		| undefined;

	if (!chartData || !Array.isArray(chartData) || chartData.length === 0) {
		return (
			<div style={{ padding: 20, color: "var(--muted-foreground)" }}>
				No data
			</div>
		);
	}

	const normalizedData = chartData
		.map((d) => ({
			...d,
			value: typeof d.value === "number" ? d.value : Number(d.value),
		}))
		.filter((d) => Number.isFinite(d.value));
	const values = normalizedData.map((d) => d.value);

	if (values.length === 0) {
		return (
			<div style={{ padding: 20, color: "var(--muted-foreground)" }}>
				No data
			</div>
		);
	}

	const maxValue = Math.max(...values);
	if (!Number.isFinite(maxValue) || maxValue <= 0) {
		return (
			<div style={{ padding: 20, color: "var(--muted-foreground)" }}>
				No data
			</div>
		);
	}
	const chartHeight = height ?? 120;
	const chartConfig: ChartConfig = {
		value: {
			label: title ?? "Value",
			color: "hsl(var(--chart-1))",
		},
	};

	return (
		<div>
			{title && (
				<h4 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>
					{title}
				</h4>
			)}
			<ChartContainer
				className="aspect-auto"
				style={{ height: chartHeight }}
				config={chartConfig}
			>
				<BarChart
					data={normalizedData}
					margin={{ top: 8, right: 0, left: 0, bottom: 0 }}
				>
					<CartesianGrid vertical={false} />
					<XAxis
						dataKey="label"
						tickLine={false}
						axisLine={false}
						tickMargin={8}
					/>
					<ChartTooltip content={<ChartTooltipContent />} />
					<Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
				</BarChart>
			</ChartContainer>
		</div>
	);
}
