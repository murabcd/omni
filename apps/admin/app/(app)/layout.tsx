"use client";

import { RefreshCcw } from "lucide-react";
import { useSelectedLayoutSegment } from "next/navigation";
import type { ReactNode } from "react";
import { GatewayProvider, useGateway } from "@/components/gateway-provider";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";

function AppHeader() {
	const segment = useSelectedLayoutSegment();
	const { status, loading, error, connect } = useGateway();
	const title = segment === "settings" ? "Settings" : "Overview";
	const connected = Boolean(status);

	return (
		<header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="flex items-center gap-3 px-4">
				<SidebarTrigger className="-ml-1" />
				<div className="h-4 w-px bg-border" />
				<h1 className="text-sm font-medium">{title}</h1>
			</div>
			<div className="ml-auto flex items-center gap-3 px-4">
				<Badge
					className={
						connected
							? "border-emerald-500/40 text-emerald-500 bg-emerald-500/10"
							: "border-rose-500/40 text-rose-500 bg-rose-500/10"
					}
				>
					{connected ? "connected" : "disconnected"}
				</Badge>
				<Button
					size="sm"
					variant="outline"
					onClick={connect}
					disabled={loading}
					className="h-8 gap-2"
				>
					<RefreshCcw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
					{loading ? "Refreshing..." : "Refresh"}
				</Button>
				{error ? <span className="text-xs text-rose-500">{error}</span> : null}
			</div>
		</header>
	);
}

export default function AppLayout({ children }: { children: ReactNode }) {
	return (
		<GatewayProvider>
			<SidebarProvider>
				<AppSidebar />
				<SidebarInset>
					<AppHeader />
					<div className="flex flex-1 flex-col p-6">{children}</div>
				</SidebarInset>
			</SidebarProvider>
		</GatewayProvider>
	);
}
