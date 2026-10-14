import { build } from "esbuild";
import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendRoot = path.join(repoRoot, "backend");
const distRoot = path.join(backendRoot, "dist");

async function copyMarkdown(source, target) {
  let entries;
  try {
    entries = await readdir(source, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) await copyMarkdown(from, to);
    else if (entry.name.endsWith(".md")) {
      await mkdir(target, { recursive: true });
      await cp(from, to);
    }
  }
}

await mkdir(distRoot, { recursive: true });
await build({
  entryPoints: [path.join(backendRoot, "src/mastra/knowledge-base/ingestion/worker-cli.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  sourcemap: true,
  outfile: path.join(distRoot, "kb-worker.js"),
});
await build({
  entryPoints: [path.join(backendRoot, "scripts/setupDb.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  sourcemap: true,
  outfile: path.join(distRoot, "db-setup.js"),
});
await cp(
  path.join(backendRoot, "src/mastra/knowledge-base/ingestion/storage/migrations"),
  path.join(distRoot, "migrations"),
  { recursive: true },
);
await build({
  entryPoints: [path.join(backendRoot, "server.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  sourcemap: true,
  outfile: path.join(distRoot, "server.js"),
});
await copyMarkdown(path.join(backendRoot, "src/modules/drafting/packs"), path.join(distRoot, "packs"));
await copyMarkdown(path.join(backendRoot, "src/modules/compare/knowledge"), path.join(distRoot, "knowledge"));
