import { access, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const rootDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(rootDir);
const distDir = join(repoRoot, "extension", "dist");
const tscPath = join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc"
);

async function run() {
  await rm(distDir, { recursive: true, force: true });

  try {
    await access(tscPath);
  } catch {
    throw new Error("Missing TypeScript compiler. Run npm install first.");
  }

  const result = spawnSync(tscPath, ["-p", join(repoRoot, "tsconfig.json")], {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
