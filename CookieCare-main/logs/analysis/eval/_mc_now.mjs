import fs from "fs";

const path =
  "logs/analysis/an_206e0591-627e-4613-ab98-09a592f940e2.compliance.log";
if (!fs.existsSync(path)) {
  fs.writeFileSync("logs/analysis/eval/_mc_now.txt", "MISSING " + path);
  process.exit(0);
}
const events = fs
  .readFileSync(path, "utf8")
  .split(/\n/)
  .filter((l) => l.startsWith("{"))
  .map((l) => JSON.parse(l));
const by = (n) => events.filter((e) => e.event === n);
const KINDS = [
  "requirement",
  "element",
  "exact_anchor",
  "clause_type",
  "definition",
  "cross_reference",
];
const out = [];
out.push(`phase=${events[0]?.implementationPhase} events=${events.length}`);
const sum = by("compliance.structure.summary")[0];
out.push(
  `structure=${JSON.stringify(sum?.countsByKind)} orphan=${sum?.orphanCount}`
);
out.push(
  `markers=${by("compliance.source.marker")
    .map((m) => m.marker + "=" + m.present)
    .join(", ")}`
);

const queries = by("compliance.investigate.queries");
const hits = by("compliance.investigate.hit");
const recalls = by("compliance.investigate.recall_summary");
const expands = by("compliance.investigate.expand");
const excluded = by("compliance.bundle.excluded");
const scopes = by("compliance.bundle.scope_partition");
const planned = by("compliance.plan.requirements")[0]?.requirementIds || [];

let all6 = 0;
const kindUnion = new Set();
out.push("\n=== per-req query kinds ===");
for (const q of queries) {
  const kinds = [...new Set((q.queries || []).map((x) => x.kind))];
  for (const k of kinds) kindUnion.add(k);
  const ok = KINDS.every((k) => kinds.includes(k));
  if (ok) all6 += 1;
  out.push(`${q.requirementId} all6=${ok} [${kinds.join(",")}]`);
}
out.push(`kinds_union=${[...kindUnion].join(",")}`);
out.push(`all6=${all6}/${queries.length}`);
out.push(
  `hits=${hits.length} denseNull=${hits.every((h) => h.denseRank == null)}`
);
out.push(`recalls=${recalls.length} planned=${planned.length}`);
const recallIds = new Set(recalls.map((r) => r.requirementId));
out.push(
  `missingRecall=${planned.filter((id) => !recallIds.has(id)).join(",") || "none"}`
);
out.push(
  `zeroRecall=${recalls
    .filter((r) => r.uniqueCandidateCount === 0)
    .map((r) => r.requirementId)
    .join(",") || "none"}`
);

const expandPer = {};
const expandReasons = {};
for (const e of expands) {
  expandPer[e.requirementId] = (expandPer[e.requirementId] || 0) + 1;
  expandReasons[e.reason] = (expandReasons[e.reason] || 0) + 1;
}
out.push(
  `expandMax=${Math.max(0, ...Object.values(expandPer))} reasons=${JSON.stringify(expandReasons)}`
);
out.push(
  `fHits=${hits.filter((h) => h.requirementId === "art28_3_f_security_assistance").length}`
);
out.push(
  `fInternal=${expands.filter((e) => e.requirementId === "art28_3_f_security_assistance" && e.reason === "internal_reference").length}`
);
out.push(
  `internal_ref_total=${expands.filter((e) => e.reason === "internal_reference").length}`
);

const dur = scopes.filter((s) => s.requirementId === "duration");
out.push(
  `durationPartitions=${dur.map((s) => s.scope?.relationship).join(",")}`
);
const exclReasons = {};
for (const e of excluded) {
  exclReasons[e.reason] = (exclReasons[e.reason] || 0) + 1;
}
out.push(`excluded=${JSON.stringify(exclReasons)}`);

const defQ = queries.filter((q) =>
  (q.queries || []).some((x) => x.kind === "definition")
);
out.push(`reqs_with_definition_query=${defQ.map((q) => q.requirementId).join(",")}`);

const recon = by("compliance.run.reconciliation")[0];
out.push(
  `recon=${JSON.stringify(recon && { planned: recon.planned, terminal: recon.terminal, missing: recon.missingRequirementIds })}`
);

fs.writeFileSync("logs/analysis/eval/_mc_now.txt", out.join("\n"));
