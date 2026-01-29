import fs from "node:fs/promises";
import path from "node:path";

type BootstrapFile = {
	path: string;
	content: string;
	missing: boolean;
	truncated: boolean;
};

const inputFiles = ["config/SOUL.md"];
const outputPath = path.resolve("config/bootstrap.json");
const maxChars = 20000;

function trimWithLimit(raw: string, limit: number) {
	const trimmed = raw.trimEnd();
	if (trimmed.length <= limit) {
		return { content: trimmed, truncated: false };
	}
	return {
		content: `${trimmed.slice(0, limit)}\n\n[TRUNCATED]`,
		truncated: true,
	};
}

async function readFileSafe(filePath: string): Promise<BootstrapFile> {
	try {
		const raw = await fs.readFile(filePath, "utf8");
		const { content, truncated } = trimWithLimit(raw, maxChars);
		return { path: filePath, content, missing: false, truncated };
	} catch {
		return { path: filePath, content: "", missing: true, truncated: false };
	}
}

async function main() {
	const files = await Promise.all(inputFiles.map((file) => readFileSafe(file)));
	const payload = { maxChars, files };
	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(
		outputPath,
		`${JSON.stringify(payload, null, "\t")}\n`,
		"utf8",
	);
	console.log(`[bootstrap] wrote ${outputPath}`);
}

main().catch((error) => {
	console.error("[bootstrap] build failed", error);
	process.exitCode = 1;
});
