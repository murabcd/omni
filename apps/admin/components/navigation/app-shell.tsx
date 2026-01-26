"use client";

import type { ReactNode } from "react";
import { GatewayProvider } from "@/components/gateway-provider";
import { AppHeader } from "@/components/navigation/app-header";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

interface AppShellProps {
	children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
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
