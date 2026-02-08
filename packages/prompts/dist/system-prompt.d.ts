type SystemPromptOptions = {
    modelRef: string;
    modelName: string;
    reasoning: string;
};
export declare function buildSystemPrompt(options: SystemPromptOptions): string;
export type { SystemPromptOptions };
