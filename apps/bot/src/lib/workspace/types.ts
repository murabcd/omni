export type WorkspaceFile = {
	path: string;
	content: string;
};

export type WorkspaceDefaults = {
	agents?: string;
	soul?: string;
	contextFiles?: WorkspaceFile[];
};

export type WorkspaceSnapshot = {
	agents?: string;
	soul?: string;
	memoryToday?: string;
	memoryYesterday?: string;
	memoryTodayPath?: string;
	memoryYesterdayPath?: string;
	contextFiles: WorkspaceFile[];
};
