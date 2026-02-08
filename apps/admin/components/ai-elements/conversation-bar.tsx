"use client";

import {
	ArrowUpIcon,
	ChevronDown,
	Keyboard,
	Mic,
	MicOff,
	PhoneIcon,
	XIcon,
} from "lucide-react";
import * as React from "react";
import { LiveWaveform } from "@/components/ai-elements/live-vaweform";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type AgentConnectionState =
	| "disconnected"
	| "connecting"
	| "connected"
	| "disconnecting";

export interface ConversationBarProps {
	className?: string;
	waveformClassName?: string;
	onSendMessage?: (message: string) => void;
	driver: {
		state: AgentConnectionState;
		muted: boolean;
		onToggleMute: () => void;
		onStartOrEnd: () => void;
		onSendMessage: (message: string) => void;
		onContextualUpdate?: (message: string) => void;
	};
}

export const ConversationBar = React.forwardRef<
	HTMLDivElement,
	ConversationBarProps
>(
	(
		{
			className,
			waveformClassName,
			onSendMessage,
			driver,
		},
		ref,
	) => {
		const [keyboardOpen, setKeyboardOpen] = React.useState(false);
		const [textInput, setTextInput] = React.useState("");

		const effectiveAgentState = driver.state;
		const effectiveMuted = driver.muted;
		const isConnected = effectiveAgentState === "connected";

		const handleSendText = React.useCallback(() => {
			if (!textInput.trim()) return;

			const messageToSend = textInput;
			driver.onSendMessage(messageToSend);
			setTextInput("");
			onSendMessage?.(messageToSend);
		}, [driver, textInput, onSendMessage]);

		const handleTextChange = React.useCallback(
			(e: React.ChangeEvent<HTMLTextAreaElement>) => {
				const value = e.target.value;
				setTextInput(value);

				if (value.trim() && isConnected) {
					driver.onContextualUpdate?.(value);
				}
			},
			[driver, isConnected],
		);

		const handleKeyDown = React.useCallback(
			(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
				if (e.key === "Enter" && !e.shiftKey) {
					e.preventDefault();
					handleSendText();
				}
			},
			[handleSendText],
		);

		return (
			<div
				ref={ref}
				className={cn("flex w-full items-end justify-center p-4", className)}
			>
				<Card className="m-0 w-full gap-0 border p-0 shadow-lg">
					<div className="flex flex-col-reverse">
						<div>
							{keyboardOpen && <Separator />}
							<div className="flex items-center justify-between gap-2 p-2">
								<div className="h-8 w-[120px] md:h-10">
									<div
										className={cn(
											"flex h-full items-center gap-2 rounded-md py-1",
											"bg-foreground/5 text-foreground/70",
										)}
									>
										<div className="h-full flex-1">
											<div
												className={cn(
													"relative flex h-full w-full shrink-0 items-center justify-center overflow-hidden rounded-sm",
													waveformClassName,
												)}
											>
												<LiveWaveform
													key={
														effectiveAgentState === "disconnected"
															? "idle"
															: "active"
													}
													active={isConnected && !effectiveMuted}
													processing={effectiveAgentState === "connecting"}
													barWidth={3}
													barGap={1}
													barRadius={4}
													fadeEdges={true}
													fadeWidth={24}
													sensitivity={1.8}
													smoothingTimeConstant={0.85}
													height={20}
													mode="static"
													className={cn(
														"h-full w-full transition-opacity duration-300",
														effectiveAgentState === "disconnected" &&
															"opacity-0",
													)}
												/>
												{effectiveAgentState === "disconnected" && (
													<div className="absolute inset-0 flex items-center justify-center">
														<span className="text-foreground/50 text-[10px] font-medium">
															Omni
														</span>
													</div>
												)}
											</div>
										</div>
									</div>
								</div>
								<div className="flex items-center">
									<Button
										variant="ghost"
										size="icon"
										onClick={driver.onToggleMute}
										aria-pressed={effectiveMuted}
										className={cn(effectiveMuted ? "bg-foreground/5" : "")}
										disabled={!isConnected}
									>
										{effectiveMuted ? <MicOff /> : <Mic />}
									</Button>
									<Button
										variant="ghost"
										size="icon"
										onClick={() => setKeyboardOpen((v) => !v)}
										aria-pressed={keyboardOpen}
										className="relative"
										disabled={!isConnected}
									>
										<Keyboard
											className={
												"h-5 w-5 transform-gpu transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] " +
												(keyboardOpen
													? "scale-75 opacity-0"
													: "scale-100 opacity-100")
											}
										/>
										<ChevronDown
											className={
												"absolute inset-0 m-auto h-5 w-5 transform-gpu transition-all delay-50 duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] " +
												(keyboardOpen
													? "scale-100 opacity-100"
													: "scale-75 opacity-0")
											}
										/>
									</Button>
									<Separator orientation="vertical" className="mx-1 -my-2.5" />
									<Button
										variant="ghost"
										size="icon"
										onClick={driver.onStartOrEnd}
										disabled={effectiveAgentState === "disconnecting"}
									>
										{isConnected || effectiveAgentState === "connecting" ? (
											<XIcon className="h-5 w-5" />
										) : (
											<PhoneIcon className="h-5 w-5" />
										)}
									</Button>
								</div>
							</div>
						</div>

						<div
							className={cn(
								"overflow-hidden transition-all duration-300 ease-out",
								keyboardOpen ? "max-h-[120px]" : "max-h-0",
							)}
						>
							<div className="relative px-2 pt-2 pb-2">
								<Textarea
									value={textInput}
									onChange={handleTextChange}
									onKeyDown={handleKeyDown}
									placeholder="Enter your message..."
									className="min-h-[100px] resize-none border-0 pr-12 shadow-none focus-visible:ring-0"
									disabled={!isConnected}
								/>
								<Button
									size="icon"
									variant="ghost"
									onClick={handleSendText}
									disabled={!textInput.trim() || !isConnected}
									className="absolute right-3 bottom-3 h-8 w-8"
								>
									<ArrowUpIcon className="h-4 w-4" />
								</Button>
							</div>
						</div>
					</div>
				</Card>
			</div>
		);
	},
);

ConversationBar.displayName = "ConversationBar";
