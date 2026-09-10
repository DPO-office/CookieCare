import fs from "fs";
const events = fs
  .readFileSync(
    "logs/analysis/an_75bdc670-6047-489f-bce4-bc493264bda9.compliance.log",
    "utf8"
  )
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
for (const q of by("compliance.investigate.queries")) {
  const kinds = [...new Set((q.queries || []).map((x) => x.kind))];
  const ok = KINDS.every((k) => kinds.includes(k));
  out.push(`${q.requirementId} all6=${ok} kinds=${kinds.join(",")}`);
}
const defHits = by("compliance.investigate.hit").filter(
  (h) =>
    (h.selectedBy || []).includes("definition") ||
    String(h.queryId || "").includes("definition")
);
// find hits whose query was definition kind
const defQueryIds = new Set();
for (const q of by("compliance.investigate.queries")) {
  for (const qq of q.queries || []) {
    if (qq.kind === "definition") defQueryIds.add(qq.queryId);
  }
}
const hitsFromDef = by("compliance.investigate.hit").filter((h) =>
  defQueryIds.has(h.queryId)
);
out.push(`\ndefinition_query_ids=${defQueryIds.size}`);
out.push(`hits_from_definition_queries=${hitsFromDef.length}`);
out.push(
  `sample_def_hits=${JSON.stringify(
    hitsFromDef.slice(0, 5).map((h) => ({
      req: h.requirementId,
      span: h.spanId,
      selectedBy: h.selectedBy,
    }))
  )}`
);

const iref = by("compliance.investigate.expand").filter(
  (e) => e.reason === "internal_reference"
);
out.push(`\ninternal_reference expands=${iref.length}`);
for (const e of iref) {
  out.push(
    JSON.stringify({
      req: e.requirementId,
      seed: e.seedSpanId,
      added: e.addedSpanId,
    })
  );
}

const dur = by("compliance.investigate.queries").find(
  (q) => q.requirementId === "duration"
);
out.push(
  `\nduration_has_definition=${(dur?.queries || []).some((q) => q.kind === "definition")}`
);
const cat = by("compliance.investigate.queries").find(
  (q) => q.requirementId === "data_categories"
);
out.push(
  `data_categories_has_definition=${(cat?.queries || []).some((q) => q.kind === "definition")}`
);

fs.writeFileSync("logs/analysis/eval/_check_75_detail.txt", out.join("\n"));
