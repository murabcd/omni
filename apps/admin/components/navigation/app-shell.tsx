"use client";

import type { ReactNode } from "react";
import { GatewayProvider } from "@/components/gateway-provider";
import { AppHeader } from "@/components/navigation/app-header";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { BreadcrumbProvider } from "@/components/navigation/breadcrumb-context";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

interface AppShellProps {
	children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
	return (
		<GatewayProvider>
			<BreadcrumbProvider>
				<SidebarProvider>
					<AppSidebar />
					<SidebarInset>
						<AppHeader />
						<div className="flex flex-1 flex-col p-4 md:p-6">{children}</div>
					</SidebarInset>
				</SidebarProvider>
			</BreadcrumbProvider>
		</GatewayProvider>
	);
}
