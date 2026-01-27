import { describe, expect, it } from "vitest";
import { resolveImageMediaType, toImageFilePart } from "../src/lib/images.js";

describe("images", () => {
	it("prefers content-type when image is provided", () => {
		const mediaType = resolveImageMediaType(
			"image/png; charset=utf-8",
			"foo.jpg",
		);
		expect(mediaType).toBe("image/png");
	});

	it("falls back to extension when content-type is missing", () => {
		const mediaType = resolveImageMediaType(null, "/tmp/photo.gif");
		expect(mediaType).toBe("image/gif");
	});

	it("builds a data URL image part", () => {
		const buffer = new Uint8Array([0, 1, 2, 3]);
		const part = toImageFilePart({
			buffer,
			contentType: "image/webp",
			filePath: "/tmp/pic.webp",
		});
		expect(part.mediaType).toBe("image/webp");
		expect(part.url.startsWith("data:image/webp;base64,")).toBe(true);
		expect(part.filename).toBe("pic.webp");
	});
});
