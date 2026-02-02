"use client";

import type { ComponentRenderProps } from "@json-render/react";

type PageProps = {
	title?: string;
	subtitle?: string;
};

export function Page({ element, children }: ComponentRenderProps<PageProps>) {
	return (
		<div className="min-h-screen bg-background">
			<div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10">
				{(element.props?.title || element.props?.subtitle) && (
					<header className="space-y-3">
						<p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
							Preview
						</p>
						{element.props?.title && (
							<h1 className="text-3xl font-semibold tracking-tight">
								{element.props.title}
							</h1>
						)}
						{element.props?.subtitle && (
							<p className="max-w-3xl text-base text-muted-foreground">
								{element.props.subtitle}
							</p>
						)}
					</header>
				)}
				<div className="flex flex-col gap-8">{children}</div>
			</div>
		</div>
	);
}
