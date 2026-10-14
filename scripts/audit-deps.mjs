import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const rootPkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const declared = new Set([
  ...Object.keys(rootPkg.dependencies || {}),
  ...Object.keys(rootPkg.devDependencies || {}),
]);

const importRe =
  /(?:import|export)\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+?)['"]|require\s*\(\s*['"]([^'"]+?)['"]\s*\)/g;

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist" || ent.name === ".git") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(ent.name)) files.push(p);
  }
  return files;
}

const targets = ["frontend/src", "backend/src", "backend/server.ts", "backend/scripts"];
const allFiles = [];
for (const t of targets) {
  const p = path.join(root, t);
  if (!fs.existsSync(p)) continue;
  if (fs.statSync(p).isDirectory()) walk(p, allFiles);
  else allFiles.push(p);
}

const used = new Map();
for (const file of allFiles) {
  const content = fs.readFileSync(file, "utf8");
  let m;
  while ((m = importRe.exec(content))) {
    const spec = m[1] || m[2];
    if (!spec || spec.startsWith(".") || spec.startsWith("/")) continue;
    const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
    if (!used.has(pkg)) used.set(pkg, new Set());
    used.get(pkg).add(path.relative(root, file).replace(/\\/g, "/"));
  }
}

const builtins = new Set([
  "crypto", "fs", "path", "url", "http", "https", "stream", "util", "os",
  "child_process", "buffer", "events", "zlib", "net", "tls", "assert",
  "querystring", "string_decoder", "timers", "worker_threads", "module",
  "process", "perf_hooks", "readline", "dns", "cluster", "vm", "console",
]);

const missing = [];
for (const [pkg, files] of [...used.entries()].sort()) {
  if (builtins.has(pkg) || pkg.startsWith("node:")) continue;
  if (!declared.has(pkg)) missing.push({ pkg, sample: [...files].slice(0, 3) });
}

console.log("=== MISSING from root package.json ===");
for (const { pkg, sample } of missing) {
  console.log(pkg);
  sample.forEach((f) => console.log("  -", f));
}
console.log("\nTotal missing:", missing.length);

console.log("\n=== All external packages used ===");
for (const pkg of [...used.keys()].sort()) {
  if (builtins.has(pkg) || pkg.startsWith("node:")) continue;
  console.log((declared.has(pkg) ? "OK" : "MISSING") + " " + pkg);
}
