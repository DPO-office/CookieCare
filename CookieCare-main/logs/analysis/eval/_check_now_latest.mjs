import fs from "fs";

const dir = "logs/analysis";
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".compliance.log"))
  .map((f) => ({ f, m: fs.statSync(`${dir}/${f}`).mtimeMs }))
  .sort((a, b) => b.m - a.m)
  .slice(0, 5);

const KINDS = [
  "requirement",
  "element",
  "exact_anchor",
  "clause_type",
  "definition",
  "cross_reference",
];

function summarize(f, m) {
  const events = fs
    .readFileSync(`${dir}/${f}`, "utf8")
    .split(/\n/)
    .filter((l) => l.startsWith("{"))
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const by = (n) => events.filter((e) => e.event === n);
  const phase = events[0]?.implementationPhase;
  const sum = by("compliance.structure.summary")[0];
  const markers = by("compliance.source.marker");
  const termMarker = markers.find((x) => x.marker === "term_definition")?.present;
  const appendixN = sum?.countsByKind?.appendix ?? 0;
  const pools = by("compliance.retrieval.pool").filter(
    (p) => p.source === "document-sections"
  );
  const poolSec = pools[0]?.beforeFilter;
  let doc =
    appendixN === 2 && termMarker
      ? "Bitrix"
      : appendixN >= 5 || (poolSec && poolSec > 150)
        ? "Mastercard"
        : "other";

  const queries = by("compliance.investigate.queries");
  const hits = by("compliance.investigate.hit");
  const recalls = by("compliance.investigate.recall_summary");
  const expands = by("compliance.investigate.expand");
  const excluded = by("compliance.bundle.excluded");
  const scopes = by("compliance.bundle.scope_partition");
  const planned = by("compliance.plan.requirements")[0]?.requirementIds || [];
  const recon = by("compliance.run.reconciliation")[0];

  const kindUnion = new Set();
  let all6 = 0;
  for (const q of queries) {
    const kinds = new Set((q.queries || []).map((x) => x.kind));
    for (const k of kinds) kindUnion.add(k);
    if (KINDS.every((k) => kinds.has(k))) all6 += 1;
  }
  const expandPer = {};
  const expandReasons = {};
  for (const e of expands) {
    expandPer[e.requirementId] = (expandPer[e.requirementId] || 0) + 1;
    expandReasons[e.reason] = (expandReasons[e.reason] || 0) + 1;
  }
  const exclReasons = {};
  for (const e of excluded) {
    exclReasons[e.reason] = (exclReasons[e.reason] || 0) + 1;
  }
  const recallIds = new Set(recalls.map((r) => r.requirementId));
  const missingRecall = planned.filter((id) => !recallIds.has(id));
  const durParts = scopes
    .filter((s) => s.requirementId === "duration")
    .map((s) => s.scope?.relationship);

  return {
    f,
    mtime: new Date(m).toISOString(),
    phase,
    doc,
    events: events.length,
    structure: sum?.countsByKind && {
      appendix: sum.countsByKind.appendix,
      list: sum.countsByKind.list,
      definition: sum.countsByKind.definition,
      orphan: sum.orphanCount,
    },
    termMarker,
    poolSec,
    queries: queries.length,
    kinds: [...kindUnion],
    all6: `${all6}/${queries.length}`,
    hits: hits.length,
    denseNull: hits.length ? hits.every((h) => h.denseRank == null) : null,
    recalls: recalls.length,
    planned: planned.length,
    missingRecall,
    zeroRecall: recalls
      .filter((r) => r.uniqueCandidateCount === 0)
      .map((r) => r.requirementId),
    expandMax: Object.values(expandPer).length
      ? Math.max(...Object.values(expandPer))
      : 0,
    expandReasons,
    fHits: hits.filter((h) => h.requirementId === "art28_3_f_security_assistance")
      .length,
    fInternal: expands.filter(
      (e) =>
        e.requirementId === "art28_3_f_security_assistance" &&
        e.reason === "internal_reference"
    ).length,
    durationPartitions: durParts,
    exclReasons,
    incompatible_scope: exclReasons.incompatible_scope || 0,
    recon: recon && {
      planned: recon.planned,
      terminal: recon.terminal,
      missing: recon.missingRequirementIds,
    },
  };
}

const out = files.map((x) => summarize(x.f, x.m));
fs.writeFileSync("logs/analysis/eval/_check_now_latest.txt", JSON.stringify(out, null, 2));
