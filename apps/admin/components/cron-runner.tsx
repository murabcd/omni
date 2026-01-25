"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type RunnerState =
	| { status: "idle"; message?: string }
	| { status: "running"; message?: string }
	| { status: "success"; message?: string }
	| { status: "error"; message?: string };

function getStateClasses(state: RunnerState["status"]) {
	switch (state) {
		case "running":
			return "border-blue-500/40 text-blue-200";
		case "success":
			return "border-emerald-500/40 text-emerald-200";
		case "error":
			return "border-rose-500/40 text-rose-200";
		default:
			return "border-border/60 text-foreground/70";
	}
}

type CronRunnerProps = {
	runCron: () => Promise<{ ok: boolean; blocks?: number; error?: string }>;
};

export function CronRunner({ runCron }: CronRunnerProps) {
	const [state, setState] = useState<RunnerState>({ status: "idle" });

	const run = async () => {
		setState({ status: "running", message: "Running report..." });
		try {
			const payload = await runCron();
			setState({
				status: "success",
				message: `Sent blocks: ${payload.blocks ?? 0}`,
			});
		} catch (error) {
			setState({
				status: "error",
				message: error instanceof Error ? error.message : "Error",
			});
		}
	};

	return (
		<div className="flex items-center gap-3">
			<Button onClick={run} disabled={state.status === "running"}>
				Run report
			</Button>
			<Badge className={getStateClasses(state.status)}>
				{state.message ?? "Ready"}
			</Badge>
		</div>
	);
}
