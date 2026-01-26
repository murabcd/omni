import type { ReactNode } from "react";
import { AppShell } from "@/components/navigation/app-shell";

export default function AppLayout({ children }: { children: ReactNode }) {
	return <AppShell>{children}</AppShell>;
}
