import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(scriptsDir);

async function run() {
  const manifestPath = join(repoRoot, "extension", "manifest.json");
  const packagePath = join(repoRoot, "package.json");

  const [manifestRaw, packageRaw] = await Promise.all([
    readFile(manifestPath, "utf-8"),
    readFile(packagePath, "utf-8"),
  ]);

  const manifest = JSON.parse(manifestRaw);
  const pkg = JSON.parse(packageRaw);

  const manifestVersion = String(manifest.version || "");
  const packageVersion = String(pkg.version || "");

  if (!manifestVersion || !packageVersion) {
    throw new Error("Missing version in manifest.json or package.json.");
  }

  if (manifestVersion !== packageVersion) {
    throw new Error(
      `Version mismatch: manifest.json=${manifestVersion} package.json=${packageVersion}`
    );
  }

  console.log(`Version OK: ${manifestVersion}`);
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
