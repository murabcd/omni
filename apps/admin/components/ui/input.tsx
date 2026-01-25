import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
	({ className, type, ...props }, ref) => {
		return (
			<input
				type={type}
				className={cn(
					"flex h-9 w-full border border-border bg-transparent px-3 py-1 text-sm transition-colors",
					"file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
					"placeholder:text-muted-foreground",
					"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
					"disabled:cursor-not-allowed disabled:opacity-50",
					"[&:-webkit-autofill]:!bg-transparent [&:-webkit-autofill]:!bg-none [&:-webkit-autofill]:!shadow-none",
					className,
				)}
				ref={ref}
				{...props}
			/>
		);
	},
);
Input.displayName = "Input";

export { Input };
