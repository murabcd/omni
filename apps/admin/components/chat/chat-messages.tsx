"use client";

import type { DataUIPart, UIMessage } from "ai";
import { User } from "lucide-react";
import { Icons } from "@/components/icons";
import { Streamdown } from "streamdown";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/lib/utils";

export type ToolStatusData = {
	tools: string[];
};

export type AdminUIData = {
	tools: ToolStatusData;
};

export type AdminUIMessage = UIMessage<AdminUIData>;

interface ChatMessagesProps {
	messages: AdminUIMessage[];
	isLoading?: boolean;
}

// Hoisted static JSX - avoids recreation on every render
const EmptyState = (
	<div className="flex flex-1 items-center justify-center p-8">
		<div className="text-center space-y-2">
			<Icons.sparkles className="size-8" />
			<p className="text-sm text-muted-foreground">
				Start a conversation with your assistant
			</p>
			<p className="text-xs text-muted-foreground/60">
				Ask about system status, run operations, or get help
			</p>
		</div>
	</div>
);

export function ChatMessages({ messages, isLoading }: ChatMessagesProps) {
	const hasAssistantText = messages.some(
		(message) =>
			message.role === "assistant" &&
			message.parts.some(
				(part) => part.type === "text" && part.text.trim().length > 0,
			),
	);

	if (messages.length === 0) {
		return EmptyState;
	}

	return (
		<div className="flex flex-col gap-4 p-4">
			{messages.map((message) => {
				const text = message.parts
					.filter((part) => part.type === "text")
					.map((part) => part.text)
					.join("");
				const toolParts = message.parts.filter(
					(part): part is DataUIPart<AdminUIData> => part.type === "data-tools",
				);

					return (
						<div
							key={message.id}
							className={cn(
								"flex gap-3",
								message.role === "user" ? "flex-row-reverse" : "flex-row",
							)}
						>
							{message.role === "assistant" && (
								<div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
									<Icons.sparkles className="size-4" />
								</div>
							)}
							<div
								className={cn(
									"flex max-w-[80%] flex-col gap-1",
									message.role === "user" ? "items-end" : "items-start",
								)}
							>
								<div
									className={cn(
										"text-sm",
										message.role === "user"
											? "rounded-lg bg-primary text-primary-foreground px-3 py-2"
											: "bg-transparent text-foreground px-0 py-0",
									)}
								>
								{message.role === "assistant" ? (
									<Streamdown className="whitespace-pre-wrap">
										{text}
									</Streamdown>
								) : (
									<div className="whitespace-pre-wrap">{text}</div>
								)}
								{toolParts.map((part, i) => {
									const tools = Array.isArray(part.data.tools)
										? part.data.tools.join(", ")
										: "";
									if (!tools) return null;
									return (
										<div
											key={`${message.id}-tools-${i}`}
											className="mt-2 rounded-md bg-background/60 px-2 py-1 text-xs text-muted-foreground"
										>
											Tools: {tools}
										</div>
									);
								})}
							</div>
						</div>
					</div>
				);
			})}
			{isLoading && !hasAssistantText && (
				<div className="flex gap-3">
					<div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
						<Icons.sparkles className="size-4" />
					</div>
					<div className="text-sm text-muted-foreground">
						<Shimmer>Thinking...</Shimmer>
					</div>
				</div>
			)}
		</div>
	);
}
