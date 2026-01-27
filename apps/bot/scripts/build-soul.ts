import fs from "node:fs/promises";
import path from "node:path";

const inputPath = path.resolve("config/SOUL.md");
const outputPath = path.resolve("config/soul.json");

async function main() {
	const raw = await fs.readFile(inputPath, "utf8");
	const trimmed = raw.trim();
	const payload = { text: trimmed ? `${trimmed}\n` : "" };
	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(
		outputPath,
		`${JSON.stringify(payload, null, "\t")}\n`,
		"utf8",
	);
	console.log(`[soul] wrote ${outputPath}`);
}

main().catch((error) => {
	console.error("[soul] build failed", error);
	process.exitCode = 1;
});
