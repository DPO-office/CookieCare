import fs from "fs";

const path =
  "logs/analysis/an_a5a9bb6f-821b-4f32-bde5-1829d7c43772.compliance.log";
const events = fs
  .readFileSync(path, "utf8")
  .split(/\n/)
  .filter((l) => l.startsWith("{"))
  .map((l) => JSON.parse(l));
const by = (n) => events.filter((e) => e.event === n);
const out = [];
out.push(`events=${events.length} phase=${events[0]?.implementationPhase}`);
out.push(
  `markers=${JSON.stringify(by("compliance.source.marker").map((m) => m.marker + "=" + m.present))}`
);
out.push(
  `pools=${JSON.stringify(by("compliance.retrieval.pool").map((p) => ({ pkg: p.packageId, src: p.source, before: p.beforeFilter, after: p.afterCap })))}`
);
out.push(
  `plan=${JSON.stringify(by("compliance.plan.requirements")[0] && { count: by("compliance.plan.requirements")[0].count, n: (by("compliance.plan.requirements")[0].requirementIds || []).length })}`
);
out.push(
  `queries=${by("compliance.investigate.queries").length} recalls=${by("compliance.investigate.recall_summary").length}`
);
out.push(
  `recall_ids=${by("compliance.investigate.recall_summary").map((r) => r.requirementId + ":" + r.uniqueCandidateCount).join(", ")}`
);
out.push(
  `query_ids=${by("compliance.investigate.queries").map((q) => q.requirementId).join(", ")}`
);

// sample query kinds for first req
for (const q of by("compliance.investigate.queries").slice(0, 3)) {
  out.push(
    JSON.stringify({
      req: q.requirementId,
      kinds: (q.queries || []).map((x) => x.kind),
    })
  );
}

const scopes = by("compliance.bundle.scope_partition").filter(
  (s) => s.requirementId === "duration"
);
out.push(
  `duration_scopes=${JSON.stringify(scopes.map((s) => ({ part: s.partitionId, rel: s.scope?.relationship, n: (s.evidenceSpanIds || []).length })))}`
);

const excl = by("compliance.bundle.excluded").filter(
  (e) => e.reason === "incompatible_scope"
);
out.push(`incompatible_scope_samples=${excl.length}`);
for (const e of excl.slice(0, 5)) {
  out.push(
    JSON.stringify({
      req: e.requirementId,
      reason: e.reason,
      detail: e.detail || e.scope || e.fromScope || e.toScope,
    })
  );
}

const recon = by("compliance.run.reconciliation")[0];
out.push(`recon=${JSON.stringify(recon && { planned: recon.planned, terminal: recon.terminal, missing: recon.missingRequirementIds })}`);

const f = by("compliance.investigate.recall_summary").find(
  (r) => r.requirementId === "art28_3_f_security_assistance"
);
out.push(`f_recall=${JSON.stringify(f)}`);

fs.writeFileSync("logs/analysis/eval/_p3_mc_detail.txt", out.join("\n"));
