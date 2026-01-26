"use client";

import { DashboardChat } from "@/components/chat/dashboard-chat";
import { Widgets } from "@/components/widgets";

export default function OverviewPage() {
	return (
		<DashboardChat>
			<Widgets />
		</DashboardChat>
	);
}
