"use client";

import {
	Clock,
	LayoutDashboard,
	Moon,
	Plus,
	Rss,
	Settings,
	Sun,
	Trophy,
	Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
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
	useSidebar,
} from "@/components/ui/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

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
	const router = useRouter();
	const { isMobile, setOpenMobile, state } = useSidebar();
	const { setTheme, theme, resolvedTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const activeTheme = mounted ? (resolvedTheme ?? theme) : undefined;
	const isDark = activeTheme === "dark";
	const isChatPage = pathname.startsWith("/chat");

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader className="h-14 border-b border-border p-0 flex items-center">
				<SidebarMenu className="h-full w-full">
					<SidebarMenuItem className="relative h-full">
						<div
							className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
								state === "collapsed"
									? "opacity-100"
									: "pointer-events-none opacity-0"
							}`}
						>
							<SidebarMenuButton asChild className="h-8 w-8 justify-center">
								<Link href="/" aria-label="Omni home">
									<Icons.omniLogo className="size-4" />
								</Link>
							</SidebarMenuButton>
						</div>
						<div
							className={`flex h-full items-center justify-between gap-2 px-2 transition-opacity duration-200 ${
								state === "collapsed"
									? "pointer-events-none opacity-0"
									: "opacity-100"
							}`}
						>
							<SidebarMenuButton asChild className="h-10 flex-1">
								<Link href="/">
									<Icons.omniLogo className="size-4" />
									<span className="truncate font-semibold">Omni</span>
								</Link>
							</SidebarMenuButton>
							{isChatPage && !isMobile && state === "expanded" && (
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon"
											onClick={() => {
												router.push("/");
												router.refresh();
												setOpenMobile(false);
											}}
										>
											<Plus className="h-4 w-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent align="end">New chat</TooltipContent>
								</Tooltip>
							)}
						</div>
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
