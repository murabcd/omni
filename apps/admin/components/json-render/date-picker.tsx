"use client";

import { type ComponentRenderProps, useData } from "@json-render/react";
import { getByPath } from "@json-render/core";
import { format, isValid, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button as UiButton } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label as UiLabel } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function DatePicker({ element }: ComponentRenderProps) {
	const { label, bindPath, placeholder } = element.props as {
		label?: string | null;
		bindPath: string;
		placeholder?: string | null;
	};
	const { data, set } = useData();
	const value = getByPath(data, bindPath) as string | undefined;
	const parsedValue = value ? parseISO(value) : undefined;
	const selectedDate = parsedValue && isValid(parsedValue) ? parsedValue : null;

	return (
		<div className="flex flex-col gap-2">
			{label && <UiLabel className="text-sm font-medium">{label}</UiLabel>}
			<Popover>
				<PopoverTrigger asChild>
					<UiButton
						variant="outline"
						className={cn(
							"justify-start text-left font-normal",
							!selectedDate && "text-muted-foreground",
						)}
					>
						<CalendarIcon className="mr-2 h-4 w-4" />
						{selectedDate
							? format(selectedDate, "PPP")
							: (placeholder ?? "Pick a date")}
					</UiButton>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="start">
					<Calendar
						mode="single"
						selected={selectedDate ?? undefined}
						onSelect={(date) =>
							set(bindPath, date ? format(date, "yyyy-MM-dd") : "")
						}
						initialFocus
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}
