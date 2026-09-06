import fs from "fs";

const path =
  "logs/analysis/an_80bfbbe5-6826-4847-8b22-b4d50837fb1a.compliance.log";
const lines = fs.readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
const events = lines
  .filter((l) => l.startsWith("{"))
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const by = (name) => events.filter((e) => e.event === name);
const out = [];

out.push(`session=an_80bfbbe5 phase=${events[0]?.implementationPhase}`);
out.push(`total_json_events=${events.length}`);

const summaries = by("compliance.structure.summary");
out.push("\n=== structure.summary ===");
for (const s of summaries) {
  out.push(
    JSON.stringify({
      documentId: s.documentId,
      totalNodes: s.totalNodes,
      orphanCount: s.orphanCount,
      countsByKind: s.countsByKind,
    })
  );
}

const appendices = by("compliance.structure.node").filter(
  (n) => n.kind === "appendix"
);
out.push(`\n=== appendix nodes (${appendices.length}) ===`);
for (const a of appendices) {
  out.push(
    JSON.stringify({
      spanId: a.spanId,
      path: a.structuralPath,
      parentSpanId: a.parentSpanId,
      childCount: a.childCount,
      preview: a.normalizedPreview,
    })
  );
  const kids = by("compliance.structure.node").filter(
    (n) => n.parentSpanId === a.spanId
  );
  out.push(
    `  children(${kids.length}): ` +
      kids.map((k) => `${k.kind}:${(k.structuralPath || "").split("/").pop()}`).join(", ")
  );
}

const orphans = by("compliance.structure.orphan");
out.push(`\n=== orphans (${orphans.length}) ===`);
for (const o of orphans.slice(0, 10)) out.push(JSON.stringify(o));

const defs = by("compliance.definition.indexed");
out.push(`\n=== definitions (${defs.length}) ===`);
const termDefs = defs.filter((d) => String(d.term).toLowerCase() === "term");
out.push(`Term indexed=${termDefs.length > 0}`);
for (const d of termDefs) out.push(JSON.stringify(d));
out.push(
  "sample defs: " +
    defs
      .slice(0, 12)
      .map((d) => d.term)
      .join(" | ")
);

const detected = by("compliance.reference.detected");
const resolved = by("compliance.reference.resolved");
const unresolved = by("compliance.reference.unresolved");
out.push(
  `\n=== refs detected=${detected.length} resolved=${resolved.length} unresolved=${unresolved.length}`
);

const amb = unresolved.filter((r) => r.resolutionState === "ambiguous");
const unres = unresolved.filter((r) => r.resolutionState === "unresolved");
const ext = unresolved.filter(
  (r) => r.resolutionState === "unresolved_external"
);
out.push(
  `unresolved breakdown: ambiguous=${amb.length} unresolved=${unres.length} unresolved_external=${ext.length}`
);

const appRefs = [...resolved, ...unresolved].filter(
  (r) => r.referenceKind === "appendix"
);
out.push(`\n=== appendix references (${appRefs.length}) ===`);
for (const r of appRefs.slice(0, 20)) {
  out.push(
    JSON.stringify({
      text: r.referenceText,
      state: r.resolutionState || "resolved_internal",
      targets: r.targetSpanIds || r.candidateTargetSpanIds,
    })
  );
}

const kinds = {};
for (const n of by("compliance.structure.node")) {
  kinds[n.kind] = (kinds[n.kind] || 0) + 1;
}
out.push(`\n=== emitted structure.node kinds ===`);
out.push(JSON.stringify(kinds));

const markers = by("compliance.source.marker");
out.push(`\n=== source markers ===`);
for (const m of markers) {
  out.push(`${m.marker} present=${m.present}`);
}

const recon = by("compliance.run.reconciliation")[0];
if (recon) {
  out.push(`\n=== reconciliation ===`);
  out.push(
    JSON.stringify({
      planned: recon.planned,
      terminal: recon.terminal,
      missing: recon.missingRequirementIds,
    })
  );
}

fs.writeFileSync(
  "logs/analysis/eval/_check_1bc_acceptance.txt",
  out.join("\n"),
  "utf8"
);
console.log("wrote eval/_check_1bc_acceptance.txt");
