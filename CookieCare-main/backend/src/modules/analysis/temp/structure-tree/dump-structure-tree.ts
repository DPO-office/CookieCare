/**
 * Temp dump — write the EXACT StructuralNode graph from analysis Phase 1B/1C
 * into a plain HTML page (clause → parent relations only).
 *
 * Disable with ANALYSIS_DUMP_STRUCTURE_TREE=0.
 */

import fs from "node:fs";
import path from "node:path";
import type { StructuralNode } from "../../segmentation/structural-nodes.js";
import type {
  DefinitionIndexEntry,
  ReferenceRecord,
} from "../../segmentation/reference-index.js";

export interface DumpDocInput {
  documentId: string;
  sourceFile: string;
  fullText: string;
  nodes: StructuralNode[];
  definitions: DefinitionIndexEntry[];
  references: ReferenceRecord[];
  legacySegmentCount?: number;
}

function enabled(): boolean {
  const flag = process.env.ANALYSIS_DUMP_STRUCTURE_TREE;
  if (flag === "0" || flag === "false") return false;
  return true;
}

/** Resolve temp folder even when code is esbuild-bundled into backend/server.js. */
function structureTreeDir(): string {
  const candidates = [
    path.join(process.cwd(), "backend/src/modules/analysis/temp/structure-tree"),
    path.join(process.cwd(), "src/modules/analysis/temp/structure-tree"),
    path.join(
      process.cwd(),
      "CookieCare-main/backend/src/modules/analysis/temp/structure-tree"
    ),
    "C:/Program Files/CookieCare/CookieCare-main/backend/src/modules/analysis/temp/structure-tree",
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  const fallback = candidates[0];
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Full text for leaf-ish nodes; first line only for fat containers (no "…"). */
function nodeLabel(n: StructuralNode): string {
  const raw = (n.rawText || n.normalizedText || n.structuralPath || "").trim();
  if (
    n.kind === "document" ||
    n.kind === "section" ||
    n.kind === "appendix" ||
    n.kind === "schedule" ||
    n.kind === "table" ||
    n.kind === "list"
  ) {
    const first =
      raw
        .split(/\n/)
        .map((l) => l.trim())
        .find(Boolean) || n.structuralPath;
    return first;
  }
  return raw.replace(/\s+/g, " ").trim();
}

function slug(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
}

function buildPlainTreeHtml(docs: DumpDocInput[], sessionId?: string): string {
  const parts: string[] = [];
  parts.push(`<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Structure tree (plain)</title>
<style>
  body { font-family: Consolas, monospace; font-size: 13px; margin: 16px; line-height: 1.45; }
  h1 { font-size: 16px; }
  h2 { font-size: 14px; margin-top: 24px; }
  .meta { color: #555; margin-bottom: 12px; }
  .orphan { color: #b00020; }
  .clause { font-weight: bold; }
  pre { white-space: pre-wrap; }
</style></head><body>
<h1>Structural nodes — parent / child relations</h1>
<p class="meta">From analysis pipeline (same nodes compliance uses). Session: ${esc(sessionId || "—")}</p>
`);

  for (const d of docs) {
    const byId = new Map(d.nodes.map((n) => [n.spanId, n]));
    const children = new Map<string, StructuralNode[]>();
    for (const n of d.nodes) {
      if (!n.parentSpanId) continue;
      const list = children.get(n.parentSpanId) ?? [];
      list.push(n);
      children.set(n.parentSpanId, list);
    }
    for (const list of children.values()) list.sort((a, b) => a.order - b.order);

    const kinds: Record<string, number> = {};
    for (const n of d.nodes) kinds[n.kind] = (kinds[n.kind] ?? 0) + 1;
    let orphans = 0;
    for (const n of d.nodes) {
      if (n.kind === "document") continue;
      if (n.parentSpanId && !byId.has(n.parentSpanId)) orphans += 1;
    }

    parts.push(`<h2>${esc(d.sourceFile)} <span class="meta">(${esc(d.documentId)})</span></h2>`);
    parts.push(
      `<p class="meta">${d.nodes.length} nodes · orphans=${orphans} · kinds: ${esc(
        Object.entries(kinds)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")
      )}</p>`
    );

    // Focus table: every clause + its parent chain
    const clauses = d.nodes
      .filter((n) => n.kind === "clause")
      .sort((a, b) => a.order - b.order);

    parts.push(`<h3>Clauses → parent chain (${clauses.length})</h3>`);
    if (clauses.length === 0) {
      parts.push(`<p class="orphan">No clause nodes found.</p>`);
    } else {
      parts.push(`<pre>`);
      for (const c of clauses) {
        const chain: string[] = [];
        let cur: StructuralNode | undefined = c;
        const seen = new Set<string>();
        while (cur) {
          if (seen.has(cur.spanId)) {
            chain.push("CYCLE");
            break;
          }
          seen.add(cur.spanId);
          chain.push(`${cur.kind}: ${nodeLabel(cur)}`);
          if (!cur.parentSpanId) break;
          const parent = byId.get(cur.parentSpanId);
          if (!parent) {
            chain.push(`MISSING_PARENT(${cur.parentSpanId})`);
            orphans += 1;
            break;
          }
          cur = parent;
        }
        parts.push(
          `<span class="clause">${esc(nodeLabel(c))}</span>\n` +
            `  path: ${esc(c.structuralPath)}\n` +
            `  offsets: [${c.sourceOffsets[0]}, ${c.sourceOffsets[1]})\n` +
            `  chain (self → root):\n` +
            chain.map((step, i) => `    ${i === 0 ? "→" : "←"} ${esc(step)}`).join("\n") +
            `\n\n`
        );
      }
      parts.push(`</pre>`);
    }

    // Full indented tree — skip paragraph bodies (noise); everything else full label
    parts.push(`<h3>Full tree (paragraphs hidden)</h3><pre>`);
    function walk(n: StructuralNode, depth: number) {
      if (n.kind === "paragraph") return;
      const pad = "  ".repeat(depth);
      const mark = n.kind === "clause" ? "*" : "-";
      const orphan =
        n.parentSpanId && !byId.has(n.parentSpanId) ? "  [ORPHAN]" : "";
      parts.push(
        `${pad}${mark} [${n.kind}] ${esc(nodeLabel(n))}${orphan ? `<span class="orphan">${orphan}</span>` : ""}\n`
      );
      for (const child of children.get(n.spanId) ?? []) walk(child, depth + 1);
    }
    const roots = d.nodes.filter((n) => !n.parentSpanId).sort((a, b) => a.order - b.order);
    for (const r of roots) walk(r, 0);
    parts.push(`</pre>`);

    // Cross-refs for clauses only (simple list)
    const clauseIds = new Set(clauses.map((c) => c.spanId));
    const refs = d.references.filter(
      (r) => clauseIds.has(r.sourceSpanId) || r.targetSpanIds.some((id) => clauseIds.has(id))
    );
    parts.push(`<h3>Clause references (${refs.length})</h3><pre>`);
    if (refs.length === 0) {
      parts.push(`(none)\n`);
    } else {
      for (const r of refs) {
        const src = byId.get(r.sourceSpanId);
        const targets = r.targetSpanIds
          .map((id) => {
            const t = byId.get(id);
            return t ? `${t.kind}: ${nodeLabel(t)}` : id;
          })
          .join(" | ");
        parts.push(
          `${esc(r.referenceKind)} "${esc(r.referenceText)}" [${esc(r.state)}]\n` +
            `  from: ${esc(src ? nodeLabel(src) : r.sourceSpanId)}\n` +
            `  to:   ${esc(targets || "∅")}\n\n`
        );
      }
    }
    parts.push(`</pre>`);
  }

  parts.push(`</body></html>`);
  return parts.join("");
}

export function dumpStructureTreeFromAnalysis(args: {
  sessionId?: string;
  docs: DumpDocInput[];
}): string | null {
  if (!enabled()) return null;
  if (!args.docs.length) return null;

  try {
    const base = structureTreeDir();
    const outDir = path.join(base, "out");
    fs.mkdirSync(outDir, { recursive: true });

    for (const d of args.docs) {
      fs.writeFileSync(
        path.join(outDir, `${slug(d.documentId)}.json`),
        JSON.stringify(
          {
            documentId: d.documentId,
            sourceFile: d.sourceFile,
            sessionId: args.sessionId,
            source: "analysis-pipeline",
            nodeCount: d.nodes.length,
            nodes: d.nodes,
            definitions: d.definitions,
            references: d.references,
          },
          null,
          2
        ),
        "utf8"
      );
    }

    const html = buildPlainTreeHtml(args.docs, args.sessionId);
    const outHtml = path.join(outDir, "index.html");
    fs.writeFileSync(outHtml, html, "utf8");

    const summary = args.docs
      .map((d) => `${d.sourceFile || d.documentId}:${d.nodes.length}n`)
      .join(", ");
    console.log(`[structure-tree] dumped (${summary}) → ${outHtml}`);
    return outHtml;
  } catch (err) {
    console.warn(
      `[structure-tree] dump failed (non-fatal):`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
