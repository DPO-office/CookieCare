import fs from "fs";

const path =
  "logs/analysis/an_fdaf056a-ca56-4447-ba31-c9b41660a342.compliance.log";
if (!fs.existsSync(path)) {
  fs.writeFileSync(
    "logs/analysis/eval/_check_fdaf.txt",
    "LOG_MISSING " + path
  );
  process.exit(0);
}
const events = fs
  .readFileSync(path, "utf8")
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
out.push(`phase=${events[0]?.implementationPhase} events=${events.length}`);

const sum = by("compliance.structure.summary")[0];
out.push("summary=" + JSON.stringify(sum && {
  countsByKind: sum.countsByKind,
  orphanCount: sum.orphanCount,
  totalNodes: sum.totalNodes,
}));

const apps = by("compliance.structure.node").filter((n) => n.kind === "appendix");
out.push(`appendices=${apps.length}`);
for (const a of apps) {
  const kids = by("compliance.structure.node").filter(
    (n) => n.parentSpanId === a.spanId
  );
  out.push(
    `${a.structuralPath} childCount=${a.childCount} kids=${kids
      .map((k) => k.kind)
      .join(",")}`
  );
}

const lists = by("compliance.structure.node").filter((n) => n.kind === "list");
out.push(
  `lists=${lists.length} parents=` +
    lists
      .map((l) => (l.structuralPath || "").split("/").slice(0, 3).join("/"))
      .join(" | ")
);

const defs = by("compliance.definition.indexed").filter(
  (d) => String(d.term).toLowerCase() === "term"
);
out.push(`Term_indexed=${defs.length > 0}`);

const orphans = by("compliance.structure.orphan");
out.push(`orphans=${orphans.length}`);

const appRefs = [
  ...by("compliance.reference.resolved"),
  ...by("compliance.reference.unresolved"),
].filter((r) => r.referenceKind === "appendix");
const resolved = appRefs.filter(
  (r) => !r.resolutionState || r.resolutionState === "resolved_internal"
);
out.push(
  `appendix_refs=${appRefs.length} resolved_internalish=${resolved.length}`
);

// Personal details anywhere in node previews?
const hit = by("compliance.structure.node").filter((n) =>
  /Personal details|Staff including|Collecting, recording/.test(
    n.normalizedPreview || ""
  )
);
out.push(
  `category_lines_in_emitted_nodes=${hit.length} kinds=${[
    ...new Set(hit.map((h) => h.kind)),
  ].join(",")}`
);

const recon = by("compliance.run.reconciliation")[0];
out.push(
  "recon=" +
    JSON.stringify(
      recon && {
        planned: recon.planned,
        terminal: recon.terminal,
        missing: recon.missingRequirementIds,
      }
    )
);

const locks = fs.existsSync("logs/analysis/eval/_diag_now2.txt")
  ? fs.readFileSync("logs/analysis/eval/_diag_now2.txt", "utf8")
  : "";
out.push("\n--- db diag snippet ---");
out.push(
  locks
    .split(/\n/)
    .filter((l) => /count=|idle_in|ALTER|waiting/.test(l))
    .slice(0, 20)
    .join("\n")
);

fs.writeFileSync("logs/analysis/eval/_check_fdaf.txt", out.join("\n"));
