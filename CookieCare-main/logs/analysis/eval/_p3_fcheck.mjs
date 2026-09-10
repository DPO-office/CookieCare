import fs from "fs";

const path =
  "logs/analysis/an_965ab7ee-ca25-427c-8230-e22c5c75e45a.compliance.log";
const events = fs
  .readFileSync(path, "utf8")
  .split(/\n/)
  .filter((l) => l.startsWith("{"))
  .map((l) => JSON.parse(l));
const by = (n) => events.filter((e) => e.event === n);

const out = [];
out.push(`phase=${events[0]?.implementationPhase} events=${events.length}`);
out.push(
  `queries=${by("compliance.investigate.queries").length} hits=${by("compliance.investigate.hit").length} recalls=${by("compliance.investigate.recall_summary").length} expands=${by("compliance.investigate.expand").length}`
);

const KINDS = [
  "requirement",
  "element",
  "exact_anchor",
  "clause_type",
  "definition",
  "cross_reference",
];
let all6 = 0;
for (const q of by("compliance.investigate.queries")) {
  const kinds = new Set((q.queries || []).map((x) => x.kind));
  if (KINDS.every((k) => kinds.has(k))) all6 += 1;
}
out.push(`queries_with_all_6=${all6}/${by("compliance.investigate.queries").length}`);

const planned = by("compliance.plan.requirements")[0]?.requirementIds || [];
const recallIds = new Set(
  by("compliance.investigate.recall_summary").map((r) => r.requirementId)
);
out.push(
  `planned_vs_recall missing=${JSON.stringify(planned.filter((id) => !recallIds.has(id)))}`
);
out.push(
  `zero_recall=${by("compliance.investigate.recall_summary").filter((r) => r.uniqueCandidateCount === 0).map((r) => r.requirementId).join(",") || "none"}`
);

const fHits = by("compliance.investigate.hit").filter(
  (h) => h.requirementId === "art28_3_f_security_assistance"
);
out.push(`f_hits=${fHits.length}`);
const fNodes = fHits.map((h) => {
  const m = String(h.spanId).match(/::(\d+)-(\d+)$/);
  const node = by("compliance.structure.node").find((n) => n.spanId === h.spanId);
  // also find by path containing clause
  const byPath = by("compliance.structure.node").filter(
    (n) =>
      n.kind === "clause" &&
      (String(n.structuralPath).includes("clause-6.4") ||
        String(n.structuralPath).includes("clause-10") ||
        /^6\.4\b/.test(n.normalizedPreview || "") ||
        /^10[\.\s]/.test(n.normalizedPreview || ""))
  );
  return { spanId: h.spanId, path: node?.structuralPath, preview: node?.normalizedPreview?.slice(0, 60), offsets: m && [m[1], m[2]] };
});
out.push(`f_hit_sample=${JSON.stringify(fNodes.slice(0, 15))}`);

const clauses = by("compliance.structure.node").filter((n) => n.kind === "clause");
const c64 = clauses.filter((n) => /clause-6\.4|\/6\.4/.test(n.structuralPath || ""));
const c10 = clauses.filter((n) => /clause-10(?!\d)/.test(n.structuralPath || "") || n.structuralPath?.endsWith("clause-10"));
out.push(`structure_clause_6.4=${c64.map((c) => c.spanId).join(",")}`);
out.push(`structure_clause_10=${c10.map((c) => c.spanId + " path=" + c.structuralPath).join(" | ")}`);

const fSpanSet = new Set(fHits.map((h) => h.spanId));
const hit64 = c64.filter((c) => fSpanSet.has(c.spanId));
const hit10 = c10.filter((c) => fSpanSet.has(c.spanId));
// also offset overlap with clause nodes
function overlaps(h, node) {
  const m = String(h.spanId).match(/::(\d+)-(\d+)$/);
  if (!m || !node.charRange) return false;
  const s = Number(m[1]);
  const e = Number(m[2]);
  return s < node.charRange[1] && e > node.charRange[0];
}
const fOverlap64 = fHits.filter((h) => c64.some((c) => overlaps(h, c)));
const fOverlap10 = fHits.filter((h) => c10.some((c) => overlaps(h, c)));
out.push(`f_direct_6.4=${hit64.length} f_direct_10=${hit10.length}`);
out.push(`f_overlap_6.4=${fOverlap64.length} f_overlap_10=${fOverlap10.length}`);

const fExp = by("compliance.investigate.expand").filter(
  (e) => e.requirementId === "art28_3_f_security_assistance"
);
const reasons = {};
for (const e of fExp) reasons[e.reason] = (reasons[e.reason] || 0) + 1;
out.push(`f_expand_reasons=${JSON.stringify(reasons)}`);

const excluded = by("compliance.bundle.excluded");
out.push(
  `excluded incompatible_scope=${excluded.filter((e) => e.reason === "incompatible_scope").length} budget=${excluded.filter((e) => e.reason === "budget").length} duplicate=${excluded.filter((e) => e.reason === "duplicate").length}`
);

const durScopes = by("compliance.bundle.scope_partition").filter(
  (s) => s.requirementId === "duration"
);
out.push(
  `duration_partitions=${durScopes.map((s) => s.scope?.relationship || s.partitionId).join(",")}`
);

const defHits = by("compliance.investigate.hit").filter((h) =>
  (h.selectedBy || []).some((s) => String(s).includes("definition"))
);
out.push(`hits_with_definition_selectedBy=${defHits.length}`);

const termDef = by("compliance.structure.node").filter(
  (n) => n.kind === "definition" && /term/i.test(n.definedTerm || "")
);
out.push(`term_defs=${termDef.map((t) => t.definedTerm + "@" + t.spanId).join(",")}`);

fs.writeFileSync("logs/analysis/eval/_p3_fcheck.txt", out.join("\n"));
