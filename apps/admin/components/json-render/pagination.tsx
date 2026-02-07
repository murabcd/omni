"use client";

import React from "react";
import type { Action } from "@json-render/core";
import { type ComponentRenderProps } from "@json-render/react";
import {
	Pagination as UiPagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from "@/components/ui/pagination";

type PageItem =
	| { type: "page"; value: number }
	| { type: "ellipsis"; key: string };

function buildPageItems(
	page: number,
	pageCount: number,
	siblingCount: number,
	showEdges: boolean,
): PageItem[] {
	const clampedPage = Math.min(Math.max(page, 1), pageCount);
	const rangeStart = Math.max(1, clampedPage - siblingCount);
	const rangeEnd = Math.min(pageCount, clampedPage + siblingCount);
	const pages = new Set<number>();

	for (let i = rangeStart; i <= rangeEnd; i += 1) {
		pages.add(i);
	}
	if (showEdges) {
		pages.add(1);
		pages.add(pageCount);
	}

	const ordered = Array.from(pages).sort((a, b) => a - b);
	const items: PageItem[] = [];

	for (let i = 0; i < ordered.length; i += 1) {
		const current = ordered[i];
		const previous = ordered[i - 1];
		if (previous !== undefined && current - previous > 1) {
			items.push({ type: "ellipsis", key: `${previous}-${current}` });
		}
		items.push({ type: "page", value: current });
	}

	return items;
}

export function Pagination({ element, onAction }: ComponentRenderProps) {
	const { page, pageCount, action, siblingCount, showEdges } = element.props as {
		page: number;
		pageCount: number;
		action?: string | Action | null;
		siblingCount?: number | null;
		showEdges?: boolean | null;
	};

	const totalPages = Math.max(1, Math.floor(pageCount));
	const currentPage = Math.min(Math.max(Math.floor(page), 1), totalPages);
	const resolvedSiblingCount =
		typeof siblingCount === "number" ? Math.max(0, siblingCount) : 1;
	const resolvedAction =
		typeof action === "string" ? { name: action } : action ?? undefined;
	const items = buildPageItems(
		currentPage,
		totalPages,
		resolvedSiblingCount,
		showEdges !== false,
	);

	const triggerAction = (nextPage: number) => {
		if (!resolvedAction) return;
		const params = { ...(resolvedAction.params ?? {}), page: nextPage };
		onAction?.({ ...resolvedAction, params });
	};

	const handleClick = (
		event: React.MouseEvent<HTMLAnchorElement>,
		nextPage: number,
	) => {
		event.preventDefault();
		triggerAction(nextPage);
	};

	return (
		<UiPagination>
			<PaginationContent>
				<PaginationItem>
					<PaginationPrevious
						href="#"
						onClick={(event) => {
							if (currentPage === 1) {
								event.preventDefault();
								return;
							}
							handleClick(event, currentPage - 1);
						}}
					/>
				</PaginationItem>
				{items.map((item) => (
					<PaginationItem
						key={item.type === "page" ? item.value : item.key}
					>
						{item.type === "ellipsis" ? (
							<PaginationEllipsis />
						) : (
							<PaginationLink
								href="#"
								isActive={item.value === currentPage}
								onClick={(event) => handleClick(event, item.value)}
							>
								{item.value}
							</PaginationLink>
						)}
					</PaginationItem>
				))}
				<PaginationItem>
					<PaginationNext
						href="#"
						onClick={(event) => {
							if (currentPage === totalPages) {
								event.preventDefault();
								return;
							}
							handleClick(event, currentPage + 1);
						}}
					/>
				</PaginationItem>
			</PaginationContent>
		</UiPagination>
	);
}
