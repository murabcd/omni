export type ModelConfig = {
	provider: string;
	id: string;
	label?: string;
	reasoning?: string;
};

export type ModelsFile = {
	defaults: {
		primary: string;
		fallbacks?: string[];
	};
	models: Record<string, ModelConfig>;
};

export type SelectedModel = {
	ref: string;
	config: ModelConfig;
	fallbacks: string[];
};

export function normalizeModelRef(input: string): string {
	const trimmed = input.trim();
	if (!trimmed) return trimmed;
	if (trimmed.includes("/")) return trimmed;
	return `openai/${trimmed}`;
}

function resolveModelRef(models: ModelsFile, input: string): string {
	const trimmed = input.trim();
	if (!trimmed) return trimmed;
	if (models.models[trimmed]) return trimmed;
	const normalized = normalizeModelRef(trimmed);
	if (models.models[normalized]) return normalized;
	return normalized;
}

export function selectModel(
	models: ModelsFile,
	overrideRef?: string | null,
): SelectedModel {
	const source =
		overrideRef && overrideRef.trim().length > 0
			? overrideRef
			: models.defaults.primary;
	const primary = resolveModelRef(models, source);
	const config = models.models[primary];
	if (!config) {
		throw new Error(`Unknown model: ${primary}`);
	}
	const fallbacks = (models.defaults.fallbacks ?? [])
		.map((ref) => resolveModelRef(models, ref))
		.filter((ref) => ref !== primary);
	return { ref: primary, config, fallbacks };
}
