import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import archiver from "archiver";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(scriptsDir);
const extensionDir = join(repoRoot, "extension");
const distDir = join(extensionDir, "dist");
const manifestPath = join(extensionDir, "manifest.json");
const buildScript = join(scriptsDir, "build-extension.mjs");

async function run() {
  const buildResult = spawnSync("node", [buildScript], { stdio: "inherit" });
  if (buildResult.status !== 0) {
    process.exit(buildResult.status ?? 1);
  }

  const manifestRaw = await readFile(manifestPath, "utf-8");
  const manifest = JSON.parse(manifestRaw);
  const name = String(manifest.name || "extension")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const version = String(manifest.version || "0.0.0");

  const outputDir = join(repoRoot, "dist");
  await mkdir(outputDir, { recursive: true });
  const outputFile = join(outputDir, `${name}-${version}.zip`);

  const output = createWriteStream(outputFile);
  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.pipe(output);
  archive.file(join(extensionDir, "manifest.json"), { name: "manifest.json" });
  archive.file(join(extensionDir, "popup.html"), { name: "popup.html" });
  archive.directory(join(extensionDir, "_locales"), "_locales");
  archive.directory(distDir, "dist");

  await archive.finalize();

  await new Promise((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
  });

  console.log(`Extension packaged: ${outputFile}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
