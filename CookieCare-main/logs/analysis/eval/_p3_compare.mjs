import fs from "fs";

function load(f) {
  return fs
    .readFileSync(`logs/analysis/${f}`, "utf8")
    .split(/\n/)
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l));
}

function summarize(label, events) {
  const by = (n) => events.filter((e) => e.event === n);
  const KINDS = [
    "requirement",
    "element",
    "exact_anchor",
    "clause_type",
    "definition",
    "cross_reference",
  ];
  const queries = by("compliance.investigate.queries");
  const hits = by("compliance.investigate.hit");
  const recalls = by("compliance.investigate.recall_summary");
  const expands = by("compliance.investigate.expand");
  const excluded = by("compliance.bundle.excluded");
  const scopes = by("compliance.bundle.scope_partition");
  const planned = by("compliance.plan.requirements")[0]?.requirementIds;
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
  const fHits = hits.filter(
    (h) => h.requirementId === "art28_3_f_security_assistance"
  );
  const fExp = expands.filter(
    (e) => e.requirementId === "art28_3_f_security_assistance"
  );
  const exclReasons = {};
  for (const e of excluded) {
    exclReasons[e.reason] = (exclReasons[e.reason] || 0) + 1;
  }
  const dur = scopes
    .filter((s) => s.requirementId === "duration")
    .map((s) => s.scope?.relationship);
  const recallIds = recalls.map((r) => r.requirementId);
  const missing =
    planned?.filter((id) => !recallIds.includes(id)) ??
    ["(plan not flushed yet)"];

  return {
    label,
    phase: events[0]?.implementationPhase,
    events: events.length,
    queries: queries.length,
    kinds: [...kindUnion],
    all6: `${all6}/${queries.length}`,
    hits: hits.length,
    denseNull: hits.every((h) => h.denseRank == null),
    recalls: recalls.length,
    recallIds,
    missingRecall: missing,
    zeroRecall: recalls
      .filter((r) => r.uniqueCandidateCount === 0)
      .map((r) => r.requirementId),
    expandMax: Math.max(0, ...Object.values(expandPer)),
    expandReasons,
    fHits: fHits.length,
    fInternal: fExp.filter((e) => e.reason === "internal_reference").length,
    durationPartitions: dur,
    exclReasons,
    incompatible_scope: exclReasons.incompatible_scope || 0,
    deps: (() => {
      const d = {};
      for (const x of by("compliance.bundle.dependency")) {
        d[x.state] = (d[x.state] || 0) + 1;
      }
      return d;
    })(),
    structure: by("compliance.structure.summary")[0]?.countsByKind,
    termMarker: by("compliance.source.marker").find(
      (m) => m.marker === "term_definition"
    )?.present,
  };
}

const bitrix = summarize(
  "Bitrix an_965ab7ee",
  load("an_965ab7ee-ca25-427c-8230-e22c5c75e45a.compliance.log")
);
const mc = summarize(
  "Mastercard-like an_a5a9bb6f",
  load("an_a5a9bb6f-821b-4f32-bde5-1829d7c43772.compliance.log")
);

fs.writeFileSync(
  "logs/analysis/eval/_p3_compare.txt",
  JSON.stringify([bitrix, mc], null, 2)
);
