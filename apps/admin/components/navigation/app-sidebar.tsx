"use client";

import {
	Clock,
	LayoutDashboard,
	Moon,
	Rss,
	Settings,
	Sun,
	Trophy,
	Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@/components/ui/sidebar";

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
	{ href: "/channels", label: "Channels", icon: Rss },
	{ href: "/sessions", label: "Sessions", icon: Users },
	{ href: "/cron", label: "Cron", icon: Clock },
	{ href: "/skills", label: "Skills", icon: Trophy },
	{ href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
	const pathname = usePathname();
	const { setTheme, theme, resolvedTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const activeTheme = mounted ? (resolvedTheme ?? theme) : undefined;
	const isDark = activeTheme === "dark";

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

			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							onClick={() => setTheme(isDark ? "light" : "dark")}
							tooltip={isDark ? "Light mode" : "Dark mode"}
							disabled={!mounted}
						>
							{!mounted ? (
								<Moon className="size-4" />
							) : isDark ? (
								<Sun className="size-4" />
							) : (
								<Moon className="size-4" />
							)}
							<span>{!mounted ? "Theme" : isDark ? "Light" : "Dark"} mode</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>

			<SidebarRail />
		</Sidebar>
	);
}
