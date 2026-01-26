export type SkillStatusConfigCheck = {
	path: string;
	value: unknown;
	satisfied: boolean;
};

export type SkillInstallOption = {
	id: string;
	kind: "brew" | "node" | "go" | "uv";
	label: string;
	bins: string[];
};

export type SkillStatusEntry = {
	name: string;
	description: string;
	source: string;
	server: string;
	filePath: string;
	baseDir: string;
	skillKey: string;
	emoji?: string;
	homepage?: string;
	always: boolean;
	disabled: boolean;
	blockedByAllowlist: boolean;
	eligible: boolean;
	requirements: {
		bins: string[];
		env: string[];
		config: string[];
		os: string[];
	};
	missing: {
		bins: string[];
		env: string[];
		config: string[];
		os: string[];
	};
	configChecks: SkillStatusConfigCheck[];
	install: SkillInstallOption[];
};

export type SkillStatusReport = {
	workspaceDir: string;
	managedSkillsDir: string;
	skills: SkillStatusEntry[];
};
