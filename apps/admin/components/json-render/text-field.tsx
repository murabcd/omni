"use client";

import {
	type ComponentRenderProps,
	useData,
	useFieldValidation,
} from "@json-render/react";
import { getByPath } from "@json-render/core";
import { Input as UiInput } from "@/components/ui/input";
import { Label as UiLabel } from "@/components/ui/label";

export function TextField({ element }: ComponentRenderProps) {
	const { label, valuePath, placeholder, type, checks, validateOn } =
		element.props as {
			label: string;
			valuePath: string;
			placeholder?: string | null;
			type?: string | null;
			checks?: Array<{ fn: string; message: string }> | null;
			validateOn?: string | null;
		};

	const { data, set } = useData();
	const value = getByPath(data, valuePath) as string | undefined;
	const { errors, validate, touch } = useFieldValidation(valuePath, {
		checks: checks ?? undefined,
		validateOn: (validateOn as "change" | "blur" | "submit") ?? "blur",
	});

	return (
		<div className="flex flex-col gap-2">
			<UiLabel className="text-sm font-medium">{label}</UiLabel>
			<UiInput
				type={type || "text"}
				value={value ?? ""}
				onChange={(e) => {
					set(valuePath, e.target.value);
					if (validateOn === "change") validate();
				}}
				onBlur={() => {
					touch();
					if (validateOn === "blur" || !validateOn) validate();
				}}
				placeholder={placeholder ?? ""}
				className={errors.length > 0 ? "border-destructive" : undefined}
			/>
			{errors.map((error, i) => (
				<span key={i} className="text-xs text-destructive">
					{error}
				</span>
			))}
		</div>
	);
}
