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
  const resolved = by("compliance.requirement.resolved");
  const conflict = by("compliance.requirement.conflict");
  const reqRes = by("compliance.request.resolve");
  const reqUn = by("compliance.request.unresolved");
  const markers = by("compliance.source.marker");
  const sum = by("compliance.structure.summary")[0];
  const recon = by("compliance.run.reconciliation")[0];
  const pools = by("compliance.retrieval.pool");
  const openRes = reqRes.filter((r) => String(r.requestId).startsWith("open.p"));
  const openUn = reqUn.filter((r) => String(r.requestId).startsWith("open.p"));
  const appendixPresent = markers.find((m) => m.marker === "appendix_heading");
  const termPresent = markers.find((m) => m.marker === "term_definition");
  return {
    f,
    phase,
    events: events.length,
    resolved: resolved.length,
    conflict: conflict.length,
    matchedByAlias: resolved.filter((r) => r.matchedBy === "alias").length,
    matchedByCanonical: resolved.filter((r) => r.matchedBy === "canonical")
      .length,
    fieldsOk: resolved.every(
      (r) => r.inputId && r.canonicalKey && r.matchedBy && r.packageId && r.version
    ),
    reqResolve: reqRes.length,
    reqUnresolved: reqUn.length,
    openResolve: openRes.length,
    openUnresolved: openUn.length,
    unresolvedReasons: [...new Set(reqUn.map((u) => u.reason))],
    resolutions: Object.fromEntries(
      ["matched", "split_match", "supplemental", "ambiguous"].map((k) => [
        k,
        reqRes.filter((r) => r.resolution === k).length,
      ])
    ),
    shapeOk: reqRes.every((r) => {
      const n = (r.nativeRequirementIds || []).length;
      if (r.resolution === "matched") return n === 1;
      if (r.resolution === "split_match") return n > 1;
      return true;
    }),
    appendixHeading: appendixPresent?.present,
    termDef: termPresent?.present,
    structure: sum && {
      appendix: sum.countsByKind?.appendix ?? 0,
      list: sum.countsByKind?.list ?? 0,
      table: sum.countsByKind?.table ?? 0,
      definition: sum.countsByKind?.definition ?? 0,
      orphanCount: sum.orphanCount,
    },
    pools: pools.map((p) => ({
      pkg: p.packageId,
      src: p.source,
      before: p.beforeFilter,
      after: p.afterCap,
    })),
    recon: recon && {
      planned: recon.planned,
      terminal: recon.terminal,
      missing: recon.missingRequirementIds,
      dupes: recon.duplicateRequirementIds,
    },
    reqDetail: reqRes.map((r) => ({
      id: r.requestId,
      res: r.resolution,
      n: r.nativeRequirementIds?.length,
    })),
  };
}

const targets = files.slice(0, 4).map((x) => analyze(x.f));
fs.writeFileSync(
  "logs/analysis/eval/_check_now.txt",
  JSON.stringify(targets, null, 2)
);
