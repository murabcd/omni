"use client";

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";

export type BreadcrumbSegment = {
	label: string;
	onClick?: () => void;
};

type BreadcrumbContextValue = {
	segments: BreadcrumbSegment[];
	setSegments: (segments: BreadcrumbSegment[]) => void;
	clearSegments: () => void;
};

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
	const [segments, setSegmentsState] = useState<BreadcrumbSegment[]>([]);

	const setSegments = useCallback((newSegments: BreadcrumbSegment[]) => {
		setSegmentsState(newSegments);
	}, []);

	const clearSegments = useCallback(() => {
		setSegmentsState([]);
	}, []);

	const value = useMemo(
		() => ({ segments, setSegments, clearSegments }),
		[segments, setSegments, clearSegments],
	);

	return (
		<BreadcrumbContext.Provider value={value}>
			{children}
		</BreadcrumbContext.Provider>
	);
}

export function useBreadcrumb() {
	const context = useContext(BreadcrumbContext);
	if (!context) {
		throw new Error("useBreadcrumb must be used within BreadcrumbProvider");
	}
	return context;
}
