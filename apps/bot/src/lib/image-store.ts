export type StoredImage = {
	key: string;
	url: string;
	mediaType: string;
	filename?: string;
	expiresAt: number;
};

export type ImageStore = {
	putImage: (params: {
		buffer: Uint8Array;
		mediaType: string;
		filename?: string;
		chatId?: string;
		userId?: string;
	}) => Promise<StoredImage>;
};
