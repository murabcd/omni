export type ImageFilePart = {
	mediaType: string;
	url: string;
	filename?: string;
};

export function resolveImageMediaType(
	contentType: string | null,
	filePath?: string,
): string {
	const normalized = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
	if (normalized.startsWith("image/")) return normalized;
	const ext = filePath?.split(".").pop()?.toLowerCase();
	switch (ext) {
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "png":
			return "image/png";
		case "webp":
			return "image/webp";
		case "gif":
			return "image/gif";
		default:
			return "image/jpeg";
	}
}

export function toImageFilePart(params: {
	buffer: Uint8Array | ArrayBuffer;
	contentType?: string | null;
	filePath?: string;
	filename?: string;
}): ImageFilePart {
	const mediaType = resolveImageMediaType(
		params.contentType ?? null,
		params.filePath,
	);
	const buffer =
		params.buffer instanceof Uint8Array
			? params.buffer
			: new Uint8Array(params.buffer);
	const base64 = Buffer.from(buffer).toString("base64");
	const url = `data:${mediaType};base64,${base64}`;
	const fallbackName = params.filePath?.split("/").pop();
	return {
		mediaType,
		url,
		filename: params.filename ?? fallbackName,
	};
}
