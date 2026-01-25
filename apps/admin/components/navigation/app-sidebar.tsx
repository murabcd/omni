"use client";

import { LayoutDashboard, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

// Pixel-style "O" logo
function OmniLogo({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 28 28"
			fill="currentColor"
			className={className}
			role="img"
			aria-hidden="true"
		>
			<rect x="4" y="0" width="20" height="4" />
			<rect x="0" y="4" width="4" height="20" />
			<rect x="24" y="4" width="4" height="20" />
			<rect x="4" y="24" width="20" height="4" />
		</svg>
	);
}

const navItems = [
	{ href: "/", label: "Overview", icon: LayoutDashboard },
	{ href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
	const pathname = usePathname();

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader className="h-14 border-b border-border justify-center">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild className="h-10">
							<Link href="/">
								<div className="flex aspect-square size-8 items-center justify-center">
									<OmniLogo className="size-5" />
								</div>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-medium">Omni</span>
									<span className="truncate text-xs text-muted-foreground">
										Gateway
									</span>
								</div>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent className="mt-4">
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							{navItems.map((item) => {
								const isActive =
									(pathname === "/" && item.href === "/") ||
									(pathname !== "/" &&
										item.href !== "/" &&
										pathname.startsWith(item.href));
								const Icon = item.icon;
								return (
									<SidebarMenuItem key={item.href}>
										<SidebarMenuButton
											asChild
											isActive={isActive}
											tooltip={item.label}
											className={cn(
												"border border-transparent",
												"hover:text-primary hover:bg-transparent",
												isActive &&
													"bg-[#131313] border-[#1d1d1d] text-foreground hover:bg-[#131313]",
												!isActive && "text-[#666666]",
											)}
										>
											<Link href={item.href}>
												<Icon className="size-4" />
												<span>{item.label}</span>
											</Link>
										</SidebarMenuButton>
									</SidebarMenuItem>
								);
							})}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<SidebarRail />
		</Sidebar>
	);
}
