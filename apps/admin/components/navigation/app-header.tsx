"use client";

import { ChevronRight, Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useBreadcrumb } from "@/components/navigation/breadcrumb-context";
import { Button } from "@/components/ui/button";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

const pageNames: Record<string, string> = {
	"/": "Overview",
	"/channels": "Channels",
	"/sessions": "Sessions",
	"/cron": "Cron",
	"/skills": "Skills",
	"/settings": "Settings",
};

export function AppHeader() {
	const pathname = usePathname();
	const router = useRouter();
	const { segments } = useBreadcrumb();
	const { isMobile, state } = useSidebar();

	// Check if we're on a chat page
	const isChatPage = pathname.startsWith("/chat/");
	const title = isChatPage ? "Chat" : (pageNames[pathname] ?? "Overview");

	const handleNewChat = () => {
		router.push("/");
		router.refresh();
	};

	const showHeaderNewChat = isChatPage && (state === "collapsed" || isMobile);
	const showMobileNewChat = isChatPage && isMobile;

	return (
		<header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="flex items-center gap-2 px-4">
				{showHeaderNewChat && !isMobile && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button variant="ghost" size="icon" onClick={handleNewChat}>
								<Plus className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>New chat</TooltipContent>
					</Tooltip>
				)}
				<SidebarTrigger className="-ml-1" />
				<div className="h-4 w-px bg-border" />
				<nav className="flex items-center gap-1 text-sm">
					{segments.length > 0 ? (
						<>
							<button
								type="button"
								onClick={segments[0]?.onClick}
								className="font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
							>
								{title}
							</button>
							{segments.map((segment, index) => (
								<span key={segment.label} className="flex items-center gap-1">
									<ChevronRight className="h-4 w-4 text-muted-foreground" />
									{index === segments.length - 1 ? (
										<span className="font-medium">{segment.label}</span>
									) : (
										<button
											type="button"
											onClick={segment.onClick}
											className="font-medium text-muted-foreground hover:text-foreground transition-colors"
										>
											{segment.label}
										</button>
									)}
								</span>
							))}
						</>
					) : (
						<span className="font-medium">{title}</span>
					)}
				</nav>
			</div>
			{showMobileNewChat && (
				<div className="px-4">
					<Button
						variant="outline"
						size="sm"
						className="h-8 px-2"
						onClick={handleNewChat}
					>
						<Plus className="h-4 w-4" />
						New chat
					</Button>
				</div>
			)}
		</header>
	);
}
