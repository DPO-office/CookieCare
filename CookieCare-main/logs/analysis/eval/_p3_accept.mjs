import fs from "fs";

const dir = "logs/analysis";
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".compliance.log"))
  .map((f) => ({ f, m: fs.statSync(`${dir}/${f}`).mtimeMs }))
  .sort((a, b) => b.m - a.m);

function count(t, k) {
  return t.split(k).length - 1;
}

const scan = [];
for (const { f, m } of files.slice(0, 10)) {
  const t = fs.readFileSync(`${dir}/${f}`, "utf8");
  const phase = (t.match(/"implementationPhase":"([^"]+)"/) || [])[1];
  scan.push({
    f,
    phase,
    mtime: new Date(m).toISOString(),
    queries: count(t, "compliance.investigate.queries"),
    hit: count(t, "compliance.investigate.hit"),
    recall: count(t, "compliance.investigate.recall_summary"),
    expand: count(t, "compliance.investigate.expand"),
    expLimit: count(t, "compliance.investigate.expansion_limit"),
    bundle: count(t, "compliance.bundle.created"),
    scope: count(t, "compliance.bundle.scope_partition"),
    excluded: count(t, "compliance.bundle.excluded"),
    dep: count(t, "compliance.bundle.dependency"),
  });
}
fs.writeFileSync("logs/analysis/eval/_p3_scan.txt", JSON.stringify(scan, null, 2));

const target =
  scan.find((s) => s.queries > 0 || s.hit > 0 || s.phase?.startsWith("3")) ||
  null;

if (!target) {
  fs.writeFileSync(
    "logs/analysis/eval/_p3_accept.txt",
    "NO_PHASE3_LOGS\n" + JSON.stringify(scan, null, 2)
  );
  process.exit(0);
}

const events = fs
  .readFileSync(`${dir}/${target.f}`, "utf8")
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
const out = [];
out.push(`TARGET=${target.f} phase=${target.phase}`);
out.push(JSON.stringify(target));

const KINDS = [
  "requirement",
  "element",
  "exact_anchor",
  "clause_type",
  "definition",
  "cross_reference",
];

const queries = by("compliance.investigate.queries");
out.push(`\n=== queries (${queries.length}) ===`);
let kindsOk = 0;
for (const q of queries) {
  const kinds = new Set((q.queries || []).map((x) => x.kind || x));
  const missing = KINDS.filter((k) => !kinds.has(k));
  if (missing.length === 0) kindsOk += 1;
  out.push(
    JSON.stringify({
      requirementId: q.requirementId,
      queryCount: (q.queries || []).length,
      kinds: [...kinds],
      missing,
    })
  );
}
out.push(`queries_with_all_6_kinds=${kindsOk}/${queries.length}`);

const hits = by("compliance.investigate.hit");
out.push(`\n=== hits (${hits.length}) sample ===`);
out.push(
  JSON.stringify(
    hits.slice(0, 5).map((h) => ({
      requirementId: h.requirementId,
      spanId: h.spanId,
      selectedBy: h.selectedBy,
      lexicalRank: h.lexicalRank,
      denseRank: h.denseRank,
      queryKind: h.queryKind || h.kind,
    }))
  )
);
const denseNull = hits.filter((h) => h.denseRank == null).length;
out.push(`hits_denseRank_null=${denseNull}/${hits.length}`);

const recalls = by("compliance.investigate.recall_summary");
out.push(`\n=== recall_summary (${recalls.length}) ===`);
for (const r of recalls) {
  out.push(
    JSON.stringify({
      requirementId: r.requirementId,
      uniqueCandidateCount: r.uniqueCandidateCount,
      elementsWithCandidates: r.elementsWithCandidates,
      elementsWithoutCandidates: r.elementsWithoutCandidates,
    })
  );
}
const zero = recalls.filter((r) => r.uniqueCandidateCount === 0);
out.push(`silent_zero_recall_count=${zero.length}`);

const planned = by("compliance.plan.requirements")[0];
const plannedIds = planned?.requirementIds || [];
const recallIds = new Set(recalls.map((r) => r.requirementId));
const missingRecall = plannedIds.filter((id) => !recallIds.has(id));
out.push(
  `planned=${plannedIds.length} with_recall=${[...recallIds].length} missing_recall=${JSON.stringify(missingRecall)}`
);

// Appendix / definition hits for categories & duration
const appNodes = by("compliance.structure.node").filter(
  (n) => n.kind === "appendix" && String(n.structuralPath || "").includes("appendix-1")
);
const app1 = appNodes[0];
out.push(`\n=== appendix-1 span=${app1?.spanId} range=${JSON.stringify(app1?.charRange)} ===`);

function inAppendix(spanId) {
  if (!app1) return false;
  // span may be list/paragraph under appendix path, or char overlap via structure nodes
  const node = by("compliance.structure.node").find((n) => n.spanId === spanId);
  if (!node) return String(spanId || "").includes("appendix");
  const path = node.structuralPath || "";
  if (path.includes("appendix-1")) return true;
  const [a, b] = app1.charRange || [];
  const [s, e] = node.charRange || [];
  return typeof s === "number" && s >= a && s < b;
}

for (const req of [
  "data_categories",
  "data_subject_categories",
  "duration",
  "gdpr.article28.categories_of_data",
  "gdpr.article28.duration",
  "art28_3_f_security_assistance",
  "gdpr.article28.3f.controller_assistance",
]) {
  const rh = hits.filter((h) => h.requirementId === req);
  const spans = [...new Set(rh.map((h) => h.spanId))];
  const defHits = rh.filter(
    (h) =>
      (h.queryKind || h.kind) === "definition" ||
      (Array.isArray(h.selectedBy) && h.selectedBy.includes("definition")) ||
      String(JSON.stringify(h)).includes("definition")
  );
  const appHits = rh.filter((h) => inAppendix(h.spanId));
  out.push(
    JSON.stringify({
      req,
      hitCount: rh.length,
      uniqueSpans: spans.length,
      appendixHits: appHits.length,
      definitionish: defHits.length,
      sampleSpans: spans.slice(0, 5),
    })
  );
}

// (f) clause 6.4 / 10
const fHits = hits.filter(
  (h) =>
    /3f|security_assistance|controller_assistance/i.test(h.requirementId || "")
);
const fSpanText = fHits.map((h) => {
  const n = by("compliance.structure.node").find((n) => n.spanId === h.spanId);
  return {
    spanId: h.spanId,
    path: n?.structuralPath,
    preview: (n?.normalizedPreview || "").slice(0, 80),
  };
});
out.push(`\n=== (f) hits (${fHits.length}) ===`);
out.push(JSON.stringify(fSpanText.slice(0, 20)));
const has64 = fSpanText.some(
  (x) =>
    /6\.4|clause-6\.4|\/6\.4/.test(x.path || "") ||
    /6\.4/.test(x.preview || "")
);
const has10 = fSpanText.some(
  (x) =>
    /clause-10|\/10[^\d]|clause 10/i.test(x.path || "") ||
    /\b10\b/.test(x.preview || "")
);
out.push(`f_has_6.4_signal=${has64} f_has_10_signal=${has10}`);

const expands = by("compliance.investigate.expand");
out.push(`\n=== expands (${expands.length}) ===`);
const byReqExpand = new Map();
for (const e of expands) {
  const k = e.requirementId || "unknown";
  byReqExpand.set(k, (byReqExpand.get(k) || 0) + 1);
}
const overCap = [...byReqExpand.entries()].filter(([, n]) => n > 20);
out.push(`reqs_with_expand=${byReqExpand.size} over_20=${JSON.stringify(overCap)}`);
const reasons = {};
for (const e of expands) {
  reasons[e.reason] = (reasons[e.reason] || 0) + 1;
}
out.push(`expand_reasons=${JSON.stringify(reasons)}`);
const fExpand = expands.filter((e) =>
  /3f|security_assistance|controller_assistance/i.test(e.requirementId || "")
);
out.push(
  `f_internal_ref_expands=${fExpand.filter((e) => e.reason === "internal_reference").length}`
);

const limits = by("compliance.investigate.expansion_limit");
out.push(`\n=== expansion_limit (${limits.length}) ===`);
for (const l of limits.slice(0, 10)) {
  out.push(
    JSON.stringify({
      requirementId: l.requirementId,
      limitType: l.limitType,
      omitted: (l.omittedSpanIds || []).length,
    })
  );
}

const bundles = by("compliance.bundle.created");
const scopes = by("compliance.bundle.scope_partition");
const excluded = by("compliance.bundle.excluded");
const deps = by("compliance.bundle.dependency");
out.push(`\n=== bundles created=${bundles.length} scopes=${scopes.length} excluded=${excluded.length} deps=${deps.length}`);
out.push(
  `incompatible_scope=${excluded.filter((e) => e.reason === "incompatible_scope").length}`
);
out.push(
  `excluded_reasons=${JSON.stringify(
    excluded.reduce((a, e) => {
      a[e.reason] = (a[e.reason] || 0) + 1;
      return a;
    }, {})
  )}`
);

const durScopes = scopes.filter((s) =>
  /duration/i.test(s.requirementId || s.bundleId || "")
);
out.push(`duration_scope_partitions=${durScopes.length}`);
for (const s of durScopes.slice(0, 10)) {
  out.push(JSON.stringify(s));
}

const depStates = {};
for (const d of deps) {
  depStates[d.state] = (depStates[d.state] || 0) + 1;
}
out.push(`dep_states=${JSON.stringify(depStates)}`);

fs.writeFileSync("logs/analysis/eval/_p3_accept.txt", out.join("\n"));
