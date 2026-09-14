import fs from "node:fs";
import path from "node:path";

const ROOT = "C:/Program Files/CookieCare/CookieCare-main/backend";
const misplaced = path.join(ROOT, "out/doc_754b36ad-91cd-4042-8ffe-6bff8722b518.json");
const outDir = path.join(ROOT, "src/modules/analysis/temp/structure-tree/out");
const outHtml = path.join(outDir, "index.html");
const outJson = path.join(outDir, "doc_754b36ad-91cd-4042-8ffe-6bff8722b518.json");

if (!fs.existsSync(misplaced)) {
  console.error("missing", misplaced);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(misplaced, "utf8"));
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(misplaced, outJson);

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function short(t, n = 90) {
  const s = String(t || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
}

const nodes = raw.nodes;
const byId = new Map(nodes.map((n) => [n.spanId, n]));
const children = new Map();
for (const n of nodes) {
  if (!n.parentSpanId) continue;
  if (!children.has(n.parentSpanId)) children.set(n.parentSpanId, []);
  children.get(n.parentSpanId).push(n);
}
for (const list of children.values()) list.sort((a, b) => a.order - b.order);

const clauses = nodes.filter((n) => n.kind === "clause").sort((a, b) => a.order - b.order);
const kinds = raw.countsByKind || {};

let html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Structure tree (plain)</title>
<style>
body{font-family:Consolas,monospace;font-size:13px;margin:16px;line-height:1.45}
h1{font-size:16px} h2,h3{font-size:14px} .meta{color:#555} .orphan{color:#b00020} .clause{font-weight:bold}
pre{white-space:pre-wrap}
</style></head><body>
<h1>Structural nodes — parent / child relations</h1>
<p class="meta">Doc: ${esc(raw.sourceFile)} · session ${esc(raw.sessionId || "")} · ${nodes.length} nodes · orphans=${raw.orphanCount ?? 0}</p>
<p class="meta">kinds: ${esc(Object.entries(kinds).map(([k, v]) => k + "=" + v).join(", "))}</p>
<h2>Clauses → parent chain (${clauses.length})</h2>
<pre>
`;

for (const c of clauses) {
  const chain = [];
  let cur = c;
  const seen = new Set();
  while (cur) {
    if (seen.has(cur.spanId)) {
      chain.push("CYCLE");
      break;
    }
    seen.add(cur.spanId);
    chain.push(`${cur.kind}:${short(cur.normalizedText || cur.structuralPath, 50)}`);
    if (!cur.parentSpanId) break;
    const p = byId.get(cur.parentSpanId);
    if (!p) {
      chain.push("MISSING_PARENT");
      break;
    }
    cur = p;
  }
  html += `<span class="clause">${esc(short(c.normalizedText || c.structuralPath, 100))}</span>\n`;
  html += `  path: ${esc(c.structuralPath)}\n`;
  html += `  chain: ${esc(chain.join("  ←  "))}\n\n`;
}

html += `</pre><h2>Full tree (paragraphs hidden)</h2><pre>\n`;

function walk(n, depth) {
  if (n.kind === "paragraph") return;
  const pad = "  ".repeat(depth);
  const mark = n.kind === "clause" ? "*" : "-";
  html += `${pad}${mark} [${n.kind}] ${esc(short(n.normalizedText || n.structuralPath, 100))}\n`;
  for (const child of children.get(n.spanId) || []) walk(child, depth + 1);
}
for (const r of nodes.filter((n) => !n.parentSpanId).sort((a, b) => a.order - b.order)) {
  walk(r, 0);
}

html += `</pre></body></html>`;
fs.writeFileSync(outHtml, html, "utf8");
fs.writeFileSync(path.join(outDir, "_rebuild_ok.txt"), `ok clauses=${clauses.length} nodes=${nodes.length}\n`, "utf8");
console.log("wrote", outHtml, "clauses", clauses.length);
