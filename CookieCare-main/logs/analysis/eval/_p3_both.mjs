import fs from "fs";

const dir = "logs/analysis";
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".compliance.log"))
  .map((f) => ({ f, m: fs.statSync(`${dir}/${f}`).mtimeMs }))
  .sort((a, b) => b.m - a.m);

function analyze(f) {
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
  const markers = by("compliance.source.marker");
  const sum = by("compliance.structure.summary")[0];
  const pools = by("compliance.retrieval.pool");
  const planned = by("compliance.plan.requirements")[0];
  const queries = by("compliance.investigate.queries");
  const hits = by("compliance.investigate.hit");
  const recalls = by("compliance.investigate.recall_summary");
  const expands = by("compliance.investigate.expand");
  const limits = by("compliance.investigate.expansion_limit");
  const bundles = by("compliance.bundle.created");
  const scopes = by("compliance.bundle.scope_partition");
  const excluded = by("compliance.bundle.excluded");
  const deps = by("compliance.bundle.dependency");
  const recon = by("compliance.run.reconciliation")[0];

  const KINDS = [
    "requirement",
    "element",
    "exact_anchor",
    "clause_type",
    "definition",
    "cross_reference",
  ];
  let all6 = 0;
  const kindUnion = new Set();
  for (const q of queries) {
    const kinds = new Set((q.queries || []).map((x) => x.kind));
    for (const k of kinds) kindUnion.add(k);
    if (KINDS.every((k) => kinds.has(k))) all6 += 1;
  }

  const plannedIds = planned?.requirementIds || [];
  const recallIds = new Set(recalls.map((r) => r.requirementId));
  const missingRecall = plannedIds.filter((id) => !recallIds.has(id));
  const zeroRecall = recalls
    .filter((r) => r.uniqueCandidateCount === 0)
    .map((r) => r.requirementId);

  const expandPer = {};
  for (const e of expands) {
    expandPer[e.requirementId] = (expandPer[e.requirementId] || 0) + 1;
  }
  const over20 = Object.entries(expandPer).filter(([, n]) => n > 20);

  const expandReasons = {};
  for (const e of expands) {
    expandReasons[e.reason] = (expandReasons[e.reason] || 0) + 1;
  }

  const app1 = by("compliance.structure.node").find(
    (n) => n.kind === "appendix" && /appendix-1/i.test(n.structuralPath || "")
  );
  const appRange = app1?.charRange;
  function overlapsApp(spanId) {
    if (!appRange) return false;
    const m = String(spanId).match(/::(\d+)-(\d+)$/);
    if (!m) return false;
    const s = Number(m[1]);
    const e = Number(m[2]);
    return s < appRange[1] && e > appRange[0];
  }

  const catHits = hits.filter((h) => h.requirementId === "data_categories");
  const durHits = hits.filter((h) => h.requirementId === "duration");
  const fHits = hits.filter(
    (h) => h.requirementId === "art28_3_f_security_assistance"
  );
  const fExp = expands.filter(
    (e) => e.requirementId === "art28_3_f_security_assistance"
  );
  const fInternal = fExp.filter((e) => e.reason === "internal_reference").length;

  const clauses = by("compliance.structure.node").filter((n) => n.kind === "clause");
  const c64 = clauses.filter((n) => /clause-6\.4/.test(n.structuralPath || ""));
  const c10 = clauses.filter(
    (n) =>
      /clause-10(?!\d)/.test(n.structuralPath || "") ||
      (n.structuralPath || "").endsWith("clause-10")
  );
  function overlaps(h, node) {
    const m = String(h.spanId).match(/::(\d+)-(\d+)$/);
    if (!m || !node.charRange) return false;
    return Number(m[1]) < node.charRange[1] && Number(m[2]) > node.charRange[0];
  }
  const f64 = fHits.filter((h) => c64.some((c) => overlaps(h, c))).length;
  const f10 = fHits.filter((h) => c10.some((c) => overlaps(h, c))).length;

  const termDef = by("compliance.structure.node").some(
    (n) => n.kind === "definition" && /^term$/i.test(n.definedTerm || "")
  );
  const defQuery = queries.some((q) =>
    (q.queries || []).some((x) => x.kind === "definition")
  );
  const defSelected = hits.some((h) =>
    (h.selectedBy || []).some((s) => String(s).includes("definition"))
  );

  const durScopes = scopes.filter((s) => s.requirementId === "duration");
  const exclReasons = {};
  for (const e of excluded) {
    exclReasons[e.reason] = (exclReasons[e.reason] || 0) + 1;
  }
  const depStates = {};
  for (const d of deps) {
    depStates[d.state] = (depStates[d.state] || 0) + 1;
  }

  const denseNull = hits.filter((h) => h.denseRank == null).length;
  const poolSig = pools
    .filter((p) => p.source === "document-sections")
    .map((p) => p.beforeFilter)
    .slice(0, 1)[0];

  // Heuristic doc label
  const appendixN = sum?.countsByKind?.appendix ?? 0;
  const listN = sum?.countsByKind?.list ?? 0;
  const termMarker = markers.find((m) => m.marker === "term_definition")?.present;
  let docGuess = "unknown";
  if (poolSig != null) {
    if (poolSig <= 90 && appendixN === 2 && termMarker) docGuess = "Bitrix-like";
    else if (poolSig > 150 || appendixN >= 5) docGuess = "Mastercard-like";
    else docGuess = `other(pools=${poolSig},app=${appendixN})`;
  }

  return {
    f,
    phase,
    docGuess,
    events: events.length,
    pools_sections: poolSig,
    structure: sum && {
      appendix: sum.countsByKind?.appendix,
      list: sum.countsByKind?.list,
      table: sum.countsByKind?.table,
      definition: sum.countsByKind?.definition,
      orphan: sum.orphanCount,
    },
    termMarker,
    termDefNode: termDef,
    // 3A
    queries: queries.length,
    queryKindsSeen: [...kindUnion],
    queriesAll6: `${all6}/${queries.length}`,
    hits: hits.length,
    denseRankNull: `${denseNull}/${hits.length}`,
    recalls: recalls.length,
    planned: plannedIds.length,
    missingRecall,
    zeroRecall,
    catAppendixHits: catHits.filter((h) => overlapsApp(h.spanId)).length,
    durAppendixHits: durHits.filter((h) => overlapsApp(h.spanId)).length,
    defQuery,
    defSelected,
    // 3B
    expands: expands.length,
    expandPerMax: Math.max(0, ...Object.values(expandPer)),
    over20,
    expandReasons,
    fHits: fHits.length,
    fOverlap64: f64,
    fOverlap10: f10,
    fInternalRefExpands: fInternal,
    expansionLimits: limits.length,
    limitTypeNode: limits.filter((l) => l.limitType === "node").length,
    // 3C
    bundles: bundles.length,
    scopes: scopes.length,
    durationPartitions: durScopes.map((s) => s.scope?.relationship || s.partitionId),
    excluded: excluded.length,
    exclReasons,
    incompatible_scope: exclReasons.incompatible_scope || 0,
    depStates,
    recon: recon && {
      planned: recon.planned,
      terminal: recon.terminal,
      missing: recon.missingRequirementIds,
    },
  };
}

const phase3 = files
  .map((x) => analyze(x.f))
  .filter((a) => a.phase?.startsWith("3") || a.queries > 0);

fs.writeFileSync(
  "logs/analysis/eval/_p3_bitrix_mc.txt",
  JSON.stringify(phase3.slice(0, 6), null, 2)
);
