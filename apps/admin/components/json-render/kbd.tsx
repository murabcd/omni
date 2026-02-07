"use client";

import { type ComponentRenderProps } from "@json-render/react";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

export function Keyboard({ element }: ComponentRenderProps) {
	const { text, keys } = element.props as {
		text?: string | null;
		keys?: string[] | null;
	};

	if (Array.isArray(keys) && keys.length > 0) {
		return (
			<KbdGroup>
				{keys.map((key, index) => (
					<Kbd key={`${key}-${index}`}>{key}</Kbd>
				))}
			</KbdGroup>
		);
	}

	return <Kbd>{text ?? ""}</Kbd>;
}
