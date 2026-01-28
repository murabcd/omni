"use client";

import { use } from "react";
import { DashboardChat } from "@/components/chat/dashboard-chat";

interface ChatPageProps {
	params: Promise<{ id: string }>;
}

export default function ChatPage({ params }: ChatPageProps) {
	const { id } = use(params);

	return <DashboardChat chatId={id} />;
}
