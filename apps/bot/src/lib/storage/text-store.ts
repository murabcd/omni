export type TextStore = {
	getText: (key: string) => Promise<string | null>;
	putText: (
		key: string,
		text: string,
		options?: { contentType?: string },
	) => Promise<void>;
	appendText: (
		key: string,
		text: string,
		options?: { separator?: string },
	) => Promise<void>;
	list: (prefix: string) => Promise<string[]>;
	delete: (key: string) => Promise<void>;
};
