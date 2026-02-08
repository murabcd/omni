import { ActionSchema, defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react";
import { z } from "zod";

const defaultActionParams = z.record(z.string(), z.unknown()).optional();

export const omniUiCatalog = defineCatalog(schema, {
	name: "dashboard",
	components: {
		Card: {
			props: z.object({
				title: z.string().nullable(),
				description: z.string().nullable(),
				padding: z.enum(["sm", "md", "lg"]).nullable(),
			}),
			slots: ["default"],
			description: "A card container with optional title",
		},
		Avatar: {
			props: z.object({
				src: z.string().nullable(),
				alt: z.string().nullable(),
				fallback: z.string().nullable(),
				size: z.enum(["sm", "md", "lg"]).nullable(),
			}),
			slots: [],
			description: "User avatar image with fallback",
		},
		Grid: {
			props: z.object({
				columns: z.number().min(1).max(4).nullable(),
				gap: z.enum(["sm", "md", "lg"]).nullable(),
			}),
			slots: ["default"],
			description: "Grid layout with configurable columns",
		},
		Stack: {
			props: z.object({
				direction: z.enum(["horizontal", "vertical"]).nullable(),
				gap: z.enum(["sm", "md", "lg"]).nullable(),
				align: z.enum(["start", "center", "end", "stretch"]).nullable(),
			}),
			slots: ["default"],
			description: "Flex stack for horizontal or vertical layouts",
		},
		Carousel: {
			props: z.object({
				orientation: z.enum(["horizontal", "vertical"]).nullable(),
				showControls: z.boolean().nullable(),
			}),
			slots: ["default"],
			description: "Carousel slider for child content",
		},
		Metric: {
			props: z.object({
				label: z.string(),
				valuePath: z.string(),
				format: z.enum(["number", "currency", "percent"]).nullable(),
				trend: z.enum(["up", "down", "neutral"]).nullable(),
				trendValue: z.string().nullable(),
				progress: z.number().min(0).max(100).nullable(),
				progressLabel: z.string().nullable(),
			}),
			slots: [],
			description:
				"Display a single metric with optional trend indicator and progress",
		},
		Pagination: {
			props: z.object({
				page: z.number().min(1),
				pageCount: z.number().min(1),
				action: z.union([z.string(), ActionSchema]).nullable(),
				siblingCount: z.number().min(0).max(3).nullable(),
				showEdges: z.boolean().nullable(),
			}),
			slots: [],
			description: "Pagination control with action on page change",
		},
		Chart: {
			props: z.object({
				dataPath: z.string(),
				title: z.string().nullable(),
				height: z.number().nullable(),
			}),
			slots: [],
			description: "Display a bar chart from array data",
		},
		Table: {
			props: z.object({
				dataPath: z.string(),
				columns: z.array(
					z.object({
						key: z.string(),
						label: z.string(),
						format: z.enum(["text", "currency", "date", "badge"]).nullable(),
					}),
				),
			}),
			slots: [],
			description: "Display tabular data",
		},
		List: {
			props: z.object({
				dataPath: z.string(),
				emptyMessage: z.string().nullable(),
			}),
			slots: ["default"],
			description: "Render a list from array data",
		},
		Button: {
			props: z.object({
				label: z.string(),
				variant: z.enum(["primary", "secondary", "danger", "ghost"]).nullable(),
				size: z.enum(["sm", "md", "lg"]).nullable(),
				action: z.union([z.string(), ActionSchema]),
				disabled: z.boolean().nullable(),
			}),
			slots: [],
			description: "Clickable button with action",
		},
		Select: {
			props: z.object({
				label: z.string().nullable(),
				bindPath: z.string(),
				options: z.array(
					z.object({
						value: z.string(),
						label: z.string(),
					}),
				),
				placeholder: z.string().nullable(),
			}),
			slots: [],
			description: "Dropdown select input",
		},
		DatePicker: {
			props: z.object({
				label: z.string().nullable(),
				bindPath: z.string(),
				placeholder: z.string().nullable(),
			}),
			slots: [],
			description: "Date picker input",
		},
		Heading: {
			props: z.object({
				text: z.string(),
				level: z.enum(["h1", "h2", "h3", "h4"]).nullable(),
			}),
			slots: [],
			description: "Section heading",
		},
		Text: {
			props: z.object({
				content: z.string(),
				variant: z.enum(["body", "caption", "label"]).nullable(),
				color: z
					.enum(["default", "muted", "success", "warning", "danger"])
					.nullable(),
			}),
			slots: [],
			description: "Text paragraph",
		},
		Badge: {
			props: z.object({
				text: z.string(),
				variant: z
					.enum(["default", "success", "warning", "danger", "info"])
					.nullable(),
			}),
			slots: [],
			description: "Small status badge",
		},
		Alert: {
			props: z.object({
				type: z.enum(["info", "success", "warning", "error"]),
				title: z.string(),
				message: z.string().nullable(),
				dismissible: z.boolean().nullable(),
			}),
			slots: [],
			description: "Alert/notification banner",
		},
		Divider: {
			props: z.object({
				label: z.string().nullable(),
			}),
			slots: [],
			description: "Visual divider",
		},
		Empty: {
			props: z.object({
				title: z.string(),
				description: z.string().nullable(),
				action: z.string().nullable(),
				actionLabel: z.string().nullable(),
			}),
			slots: [],
			description: "Empty state placeholder",
		},
		TextField: {
			props: z.object({
				label: z.string(),
				valuePath: z.string(),
				placeholder: z.string().nullable(),
				type: z.string().nullable(),
				checks: z
					.array(z.object({ fn: z.string(), message: z.string() }))
					.nullable(),
				validateOn: z.enum(["change", "blur", "submit"]).nullable(),
			}),
			slots: [],
			description: "Text field input",
		},
		Textarea: {
			props: z.object({
				label: z.string().nullable(),
				valuePath: z.string(),
				placeholder: z.string().nullable(),
				rows: z.number().nullable(),
			}),
			slots: [],
			description: "Multiline text input",
		},
		Checkbox: {
			props: z.object({
				label: z.string().nullable(),
				checked: z.boolean().nullable(),
				bindPath: z.string().nullable(),
			}),
			slots: [],
			description: "Checkbox toggle",
		},
		Switch: {
			props: z.object({
				label: z.string().nullable(),
				checked: z.boolean().nullable(),
				bindPath: z.string().nullable(),
			}),
			slots: [],
			description: "Switch toggle",
		},
		Tooltip: {
			props: z.object({
				text: z.string(),
				side: z.enum(["top", "right", "bottom", "left"]).nullable(),
			}),
			slots: ["default"],
			description: "Tooltip for wrapped content",
		},
		Keyboard: {
			props: z.object({
				text: z.string().nullable(),
				keys: z.array(z.string()).nullable(),
			}),
			slots: [],
			description: "Keyboard shortcut hint (single or grouped keys)",
		},
		Toggle: {
			props: z.object({
				label: z.string().nullable(),
				pressed: z.boolean().nullable(),
				bindPath: z.string().nullable(),
				variant: z.enum(["default", "outline"]).nullable(),
				size: z.enum(["sm", "md", "lg"]).nullable(),
				action: z.union([z.string(), ActionSchema]).nullable(),
			}),
			slots: [],
			description: "Toggle button with optional binding or action",
		},
		Collapsible: {
			props: z.object({
				triggerLabel: z.string(),
				defaultOpen: z.boolean().nullable(),
			}),
			slots: ["default"],
			description: "Collapsible disclosure section",
		},
		Dialog: {
			props: z.object({
				triggerLabel: z.string(),
				title: z.string(),
				description: z.string().nullable(),
			}),
			slots: ["default"],
			description: "Modal dialog",
		},
		AlertDialog: {
			props: z.object({
				triggerLabel: z.string(),
				title: z.string(),
				description: z.string().nullable(),
				actionLabel: z.string().nullable(),
				cancelLabel: z.string().nullable(),
				action: z.string().nullable(),
			}),
			slots: ["default"],
			description: "Confirmation dialog",
		},
		Sheet: {
			props: z.object({
				triggerLabel: z.string(),
				title: z.string().nullable(),
				description: z.string().nullable(),
				side: z.enum(["top", "right", "bottom", "left"]).nullable(),
			}),
			slots: ["default"],
			description: "Slide-over sheet",
		},
		Tabs: {
			props: z.object({
				defaultValue: z.string().nullable(),
				value: z.string().nullable(),
				orientation: z.enum(["horizontal", "vertical"]).nullable(),
			}),
			slots: ["default"],
			description: "Tabs container; use TabPanel children",
		},
		TabPanel: {
			props: z.object({
				value: z.string(),
				label: z.string(),
			}),
			slots: ["default"],
			description: "Tab panel content (child of Tabs)",
		},
	},
	actions: {
		export_report: {
			params: defaultActionParams,
			description: "Export the current dashboard to PDF",
		},
		refresh_data: {
			params: defaultActionParams,
			description: "Refresh all metrics and charts",
		},
		view_details: {
			params: defaultActionParams,
			description: "View detailed information",
		},
		apply_filter: {
			params: defaultActionParams,
			description: "Apply the current filter settings",
		},
	},
	validation: "strict",
});

export const omniUiCatalogPrompt = omniUiCatalog.prompt();
