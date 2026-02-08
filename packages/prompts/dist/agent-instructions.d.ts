export type CandidateIssue = {
    key: string | null;
    summary: string;
    score: number;
};
export type AgentInstructionOptions = {
    question: string;
    modelRef: string;
    modelName: string;
    reasoning: string;
    toolLines: string;
    recentCandidates?: CandidateIssue[];
    history?: string;
    userName?: string;
    systemPrompt?: string;
    globalSoul?: string;
    channelSoul?: string;
    projectContext?: Array<{
        path: string;
        content: string;
    }>;
    workspaceSnapshot?: {
        agents?: string;
        soul?: string;
        memoryToday?: string;
        memoryYesterday?: string;
        memoryTodayPath?: string;
        memoryYesterdayPath?: string;
        contextFiles?: Array<{
            path: string;
            content: string;
        }>;
    };
    currentDateTime?: string;
    runtimeLine?: string;
    skillsPrompt?: string;
    promptMode?: "full" | "minimal" | "none";
    uiCatalogPrompt?: string;
};
export declare function buildToolInstructions(options: {
    toolLines: string;
    uiCatalogPrompt?: string;
}): string;
export declare function buildAgentInstructions(options: AgentInstructionOptions): string;
export type IssueInstructionOptions = {
    question: string;
    modelRef: string;
    modelName: string;
    reasoning: string;
    issueKey: string;
    issueText: string;
    commentsText: string;
    extraContext?: string;
    userName?: string;
    globalSoul?: string;
    channelSoul?: string;
    systemPrompt?: string;
};
export declare function buildIssueAgentInstructions(options: IssueInstructionOptions): string;
