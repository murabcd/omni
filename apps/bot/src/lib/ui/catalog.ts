import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog";
import { z } from "zod";

const defaultActionParams = z.record(z.string(), z.unknown()).optional();

export const omniUiCatalog = defineCatalog(schema, {
	name: "dashboard",
	components: shadcnComponentDefinitions,
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
