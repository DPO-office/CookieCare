/**
 * Temp dump for the NEW ingest document-structure pipeline.
 * Shows physical containment (parent/child) + relation edges.
 *
 * Called from persistDocumentGraph after upload/version graph build.
 * Disable with DOCUMENT_GRAPH_DUMP=0.
 */

import fs from "node:fs";
import path from "node:path";
import type {
  CanonicalDocumentGraph,
  RelationEdge,
  StructuralNode,
} from "../../capabilities/ingest/document-structure/types.js";

function enabled(): boolean {
  const flag = process.env.DOCUMENT_GRAPH_DUMP;
  if (flag === "0" || flag === "false") return false;
  return true;
}

function ingestGraphDir(): string {
  const candidates = [
    path.join(process.cwd(), "backend/src/modules/analysis/temp/ingest-graph"),
    path.join(process.cwd(), "src/modules/analysis/temp/ingest-graph"),
    path.join(
      process.cwd(),
      "CookieCare-main/backend/src/modules/analysis/temp/ingest-graph"
    ),
    "C:/Program Files/CookieCare/CookieCare-main/backend/src/modules/analysis/temp/ingest-graph",
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

/** Full text for leaf nodes; first line for fat containers (no "…"). */
function nodeLabel(n: StructuralNode): string {
  const raw = (n.title || n.displayLabel || n.text || n.nodeId || "").trim();
  if (
    n.kind === "document" ||
    n.kind === "section" ||
    n.kind === "part" ||
    n.kind === "article" ||
    n.kind === "appendix" ||
    n.kind === "schedule" ||
    n.kind === "annex" ||
    n.kind === "exhibit" ||
    n.kind === "table" ||
    n.kind === "list"
  ) {
    return (
      raw
        .split(/\n/)
        .map((l) => l.trim())
        .find(Boolean) ||
      n.displayLabel ||
      n.nodeId
    );
  }
  return raw.replace(/\s+/g, " ").trim();
}

function slug(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
}

function buildHtml(graphs: CanonicalDocumentGraph[]): string {
  const parts: string[] = [];
  parts.push(`<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Ingest document graph</title>
<style>
body{font-family:Consolas,monospace;font-size:13px;margin:16px;line-height:1.45}
h1{font-size:16px} h2,h3{font-size:14px} .meta{color:#555} .bad{color:#b00020} .ok{color:#0a7a32}
.clause{font-weight:bold} pre{white-space:pre-wrap}
</style></head><body>
<h1>Ingest document graph (physical + relations)</h1>
<p class="meta">From <code>capabilities/ingest/document-structure</code> — same artifact persisted at upload.</p>
`);

  for (const g of graphs) {
    const byId = new Map(g.nodes.map((n) => [n.nodeId, n]));
    const children = new Map<string, StructuralNode[]>();
    for (const n of g.nodes) {
      if (!n.parentId) continue;
      const list = children.get(n.parentId) ?? [];
      list.push(n);
      children.set(n.parentId, list);
    }
    for (const list of children.values()) list.sort((a, b) => a.order - b.order);

    const kinds: Record<string, number> = {};
    for (const n of g.nodes) kinds[n.kind] = (kinds[n.kind] ?? 0) + 1;

    const clauses = g.nodes
      .filter((n) => n.kind === "clause" || n.kind === "subclause" || n.kind === "article")
      .sort((a, b) => a.order - b.order);

    const q = g.quality;
    const statusClass = q.status === "ready" ? "ok" : "bad";

    parts.push(`<h2>${esc(g.fileId)} <span class="meta">version ${esc(g.documentVersionId)}</span></h2>`);
    parts.push(
      `<p class="meta">parser=${esc(g.parser.name)}/${esc(g.parser.format)} status=<span class="${statusClass}">${esc(q.status)}</span> · nodes=${g.nodes.length} · structuralEdges=${g.structuralEdges.length} · relations=${g.relationEdges.length} · defs=${g.definitions.length}</p>`
    );
    parts.push(
      `<p class="meta">coverage=${(q.textCoverage * 100).toFixed(2)}% · orphans=${q.orphanCount} · resolved=${q.resolvedRelations} ambiguous=${q.ambiguousRelations} unresolved=${q.unresolvedRelations} · llmDiscovery=${q.relationDiscoveryComplete ? "yes" : "no"}</p>`
    );
    parts.push(
      `<p class="meta">kinds: ${esc(Object.entries(kinds).map(([k, v]) => `${k}=${v}`).join(", "))}</p>`
    );
    if (g.identity) {
      parts.push(`<p class="meta">identity=<span class="${g.identity.status === "mismatch" ? "bad" : "ok"}">${esc(g.identity.status)}</span> | title=${esc(g.identity.detectedTitle ?? "unknown")} | entities=${esc(g.identity.detectedEntities.join(", ") || "none")} | pages=${g.identity.pageCount ?? "unknown"} | sha256=${esc(g.identity.contentSha256.slice(0, 16))}...</p>`);
    }
    if (q.criticalIssues?.length) {
      parts.push(`<p class="bad">critical: ${esc(q.criticalIssues.join(" | "))}</p>`);
    }
    if (g.warnings?.length) {
      parts.push(
        `<p class="meta">warnings (${g.warnings.length}): ${esc(
          g.warnings
            .slice(0, 12)
            .map((w) => `${w.severity}:${w.code}`)
            .join(", ")
        )}${g.warnings.length > 12 ? " …" : ""}</p>`
      );
    }

    parts.push(`<h3>Clauses / articles → parent chain (${clauses.length})</h3><pre>`);
    if (!clauses.length) {
      parts.push(`(none)\n`);
    } else {
      for (const c of clauses) {
        const chain: string[] = [];
        let cur: StructuralNode | undefined = c;
        const seen = new Set<string>();
        while (cur) {
          if (seen.has(cur.nodeId)) {
            chain.push("CYCLE");
            break;
          }
          seen.add(cur.nodeId);
          const num = cur.numberingPath?.join(".") || "";
          chain.push(
            `${cur.kind}${num ? ` [${num}]` : ""}: ${nodeLabel(cur)}`
          );
          if (!cur.parentId) break;
          const parent = byId.get(cur.parentId);
          if (!parent) {
            chain.push(`MISSING_PARENT(${cur.parentId})`);
            break;
          }
          cur = parent;
        }
        parts.push(
          `<span class="clause">${esc(nodeLabel(c))}</span>\n` +
            `  nodeId: ${esc(c.nodeId)}\n` +
            `  numbering: ${esc(c.numberingPath?.join(".") || "—")}\n` +
            `  namespace: ${esc(c.namespace)}\n` +
            `  range: [${c.sourceRange[0]}, ${c.sourceRange[1]})\n` +
            `  chain (self → root):\n` +
            chain.map((step, i) => `    ${i === 0 ? "→" : "←"} ${esc(step)}`).join("\n") +
            `\n\n`
        );
      }
    }
    parts.push(`</pre>`);

    parts.push(`<h3>Physical tree (paragraphs hidden)</h3><pre>`);
    function walk(n: StructuralNode, depth: number) {
      if (n.kind === "paragraph") return;
      const pad = "  ".repeat(depth);
      const mark =
        n.kind === "clause" || n.kind === "subclause" || n.kind === "article"
          ? "*"
          : "-";
      const num = n.numberingPath?.length ? ` #${n.numberingPath.join(".")}` : "";
      parts.push(
        `${pad}${mark} [${n.kind}${num}] ${esc(nodeLabel(n))}\n`
      );
      for (const child of children.get(n.nodeId) ?? []) walk(child, depth + 1);
    }
    const roots = g.nodes
      .filter((n) => !n.parentId)
      .sort((a, b) => a.order - b.order);
    for (const r of roots) walk(r, 0);
    parts.push(`</pre>`);

    parts.push(`<h3>Relation edges (${g.relationEdges.length})</h3><pre>`);
    if (!g.relationEdges.length) {
      parts.push(`(none — deterministic refs empty; LLM discovery ${q.relationDiscoveryComplete ? "ran" : "off"})\n`);
    } else {
      const sorted = [...g.relationEdges].sort((a, b) =>
        a.sourceNodeId.localeCompare(b.sourceNodeId)
      );
      for (const r of sorted) {
        parts.push(formatRelation(r, byId));
      }
    }
    parts.push(`</pre>`);

    if (g.definitions.length) {
      parts.push(`<h3>Definitions (${g.definitions.length})</h3><pre>`);
      for (const d of g.definitions) {
        const defNode = byId.get(d.definitionNodeId);
        parts.push(
          `"${esc(d.term)}" → ${esc(defNode ? nodeLabel(defNode) : d.definitionNodeId)} (scope=${esc(d.scopeNodeId)})\n`
        );
      }
      parts.push(`</pre>`);
    }
    if (g.unresolvedTargets?.length) {
      parts.push(`<h3>Canonical unresolved targets (${g.unresolvedTargets.length})</h3><pre>`);
      for (const target of g.unresolvedTargets) {
        parts.push(`${esc(target.unresolvedTargetId)} | ${esc(target.label)} (${esc(target.reason)})\n`);
      }
      parts.push(`</pre>`);
    }
  }

  parts.push(`</body></html>`);
  return parts.join("");
}

function formatRelation(r: RelationEdge, byId: Map<string, StructuralNode>): string {
  const src = byId.get(r.sourceNodeId);
  const tgt = r.targetNodeId ? byId.get(r.targetNodeId) : undefined;
  const statusClass =
    r.status === "resolved" ? "ok" : r.status === "ambiguous" ? "bad" : "bad";
  return (
    `<span class="${statusClass}">[${esc(r.status)}]</span> ${esc(r.semanticEffect)}\n` +
    `  from: ${esc(src ? nodeLabel(src) : r.sourceNodeId)}\n` +
    `  mention: "${esc(r.targetMention)}"\n` +
    `  to: ${esc(tgt ? nodeLabel(tgt) : r.targetNodeId || "∅")}` +
    (r.candidateTargetIds.length
      ? ` candidates=[${esc(r.candidateTargetIds.join(", "))}]`
      : "") +
    `\n` +
    `  evidence: ${esc(r.evidenceText)}\n` +
    `  by: ${esc(r.detectedBy.join("+"))} / verified: ${esc(r.verifiedBy.join("+"))}\n` +
    `  reason: ${esc(r.reason)}\n\n`
  );
}

/** Best-effort dump of one or more ingest graphs into temp/ingest-graph/out. */
export function dumpIngestDocumentGraph(
  graphs: CanonicalDocumentGraph | CanonicalDocumentGraph[]
): string | null {
  if (!enabled()) return null;
  const list = Array.isArray(graphs) ? graphs : [graphs];
  if (!list.length) return null;

  try {
    const base = ingestGraphDir();
    const outDir = path.join(base, "out");
    fs.mkdirSync(outDir, { recursive: true });

    for (const g of list) {
      fs.writeFileSync(
        path.join(outDir, `${slug(g.fileId)}.json`),
        JSON.stringify(g, null, 2),
        "utf8"
      );
    }

    // Merge with any other doc_*.json already in out so multi-upload sessions accumulate.
    const existing = fs
      .readdirSync(outDir)
      .filter((f) => f.endsWith(".json") && !f.startsWith("sample"))
      .map((f) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(outDir, f), "utf8")) as CanonicalDocumentGraph;
        } catch {
          return null;
        }
      })
      .filter((g): g is CanonicalDocumentGraph => Boolean(g?.nodes));

    const byFile = new Map<string, CanonicalDocumentGraph>();
    for (const g of existing) byFile.set(g.fileId, g);
    for (const g of list) byFile.set(g.fileId, g);

    const html = buildHtml([...byFile.values()]);
    const outHtml = path.join(outDir, "index.html");
    fs.writeFileSync(outHtml, html, "utf8");

    const summary = list
      .map(
        (g) =>
          `${g.fileId}:${g.nodes.length}n/${g.relationEdges.length}r/${g.quality.status}`
      )
      .join(", ");
    console.log(`[ingest-graph] dumped (${summary}) → ${outHtml}`);
    return outHtml;
  } catch (err) {
    console.warn(
      `[ingest-graph] dump failed (non-fatal):`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
