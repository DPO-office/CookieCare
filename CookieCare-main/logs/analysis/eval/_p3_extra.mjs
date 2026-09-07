import fs from "fs";

const path =
  "logs/analysis/an_965ab7ee-ca25-427c-8230-e22c5c75e45a.compliance.log";
const events = fs
  .readFileSync(path, "utf8")
  .split(/\n/)
  .filter((l) => l.startsWith("{"))
  .map((l) => JSON.parse(l));
const by = (n) => events.filter((e) => e.event === n);

const app = by("compliance.structure.node").find(
  (n) => n.kind === "appendix" && /appendix-1/.test(n.structuralPath || "")
);
const [a0, a1] = app?.charRange || [30465, 32955];

function spanOffsets(spanId) {
  const m = String(spanId).match(/::(\d+)-(\d+)$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}
function overlapsAppendix(spanId) {
  const o = spanOffsets(spanId);
  if (!o) return false;
  return o[0] < a1 && o[1] > a0;
}

const out = [];
out.push(`app1=${a0}-${a1}`);

const plan = by("compliance.plan.requirements")[0];
out.push(`plan=${JSON.stringify(plan && { count: plan.count, ids: plan.requirementIds })}`);

const recalls = by("compliance.investigate.recall_summary");
out.push(`recall_reqs=${recalls.map((r) => r.requirementId).join(",")}`);

for (const req of ["data_categories", "data_subject_categories", "duration"]) {
  const hits = by("compliance.investigate.hit").filter(
    (h) => h.requirementId === req
  );
  const appSpans = [
    ...new Set(hits.map((h) => h.spanId).filter(overlapsAppendix)),
  ];
  const defQ = by("compliance.investigate.queries").find(
    (q) => q.requirementId === req
  );
  const kinds = (defQ?.queries || []).map((q) => q.kind);
  out.push(
    JSON.stringify({
      req,
      hits: hits.length,
      appendixOverlapSpans: appSpans.length,
      sampleApp: appSpans.slice(0, 3),
      queryKinds: kinds,
    })
  );
}

const expands = by("compliance.investigate.expand");
const per = {};
for (const e of expands) {
  per[e.requirementId] = (per[e.requirementId] || 0) + 1;
}
out.push(`expand_per_req=${JSON.stringify(per)}`);

const selectedBy = {};
for (const h of by("compliance.investigate.hit")) {
  for (const s of h.selectedBy || []) {
    selectedBy[s] = (selectedBy[s] || 0) + 1;
  }
}
out.push(`selectedBy=${JSON.stringify(selectedBy)}`);

const queriesRaw = by("compliance.investigate.queries")[0];
out.push(`sample_queries_payload=${JSON.stringify(queriesRaw?.queries)}`);

fs.writeFileSync("logs/analysis/eval/_p3_extra.txt", out.join("\n"));
