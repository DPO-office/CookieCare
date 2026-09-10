import fs from "fs";

const path =
  "logs/analysis/an_313bf2c5-c208-4ddd-b96f-39a437333e5f.compliance.log";
const events = fs
  .readFileSync(path, "utf8")
  .split(/\n/)
  .filter((l) => l.startsWith("{"))
  .map((l) => JSON.parse(l));

const by = (n) => events.filter((e) => e.event === n);
const out = [];

out.push(`session=an_313bf2c5 phase=${events[0]?.implementationPhase}`);
out.push(`total_events=${events.length}`);

const resolved = by("compliance.requirement.resolved");
const conflicts = by("compliance.requirement.conflict");
const reqRes = by("compliance.request.resolve");
const reqUn = by("compliance.request.unresolved");

out.push("\n=== Phase 2A counts ===");
out.push(`requirement.resolved=${resolved.length}`);
out.push(`requirement.conflict=${conflicts.length}`);

const fieldOk = resolved.every(
  (r) =>
    r.inputId &&
    r.canonicalKey &&
    (r.matchedBy === "alias" || r.matchedBy === "canonical") &&
    r.packageId &&
    r.version
);
out.push(`resolved_fields_complete=${fieldOk}`);
out.push(
  `matchedBy breakdown: alias=${resolved.filter((r) => r.matchedBy === "alias").length} canonical=${resolved.filter((r) => r.matchedBy === "canonical").length}`
);

out.push("\n=== sample resolved (first 3) ===");
for (const r of resolved.slice(0, 3)) {
  out.push(
    JSON.stringify({
      inputId: r.inputId,
      canonicalKey: r.canonicalKey,
      matchedBy: r.matchedBy,
      packageId: r.packageId,
      version: r.version,
    })
  );
}

out.push("\n=== Phase 2B counts ===");
out.push(`request.resolve=${reqRes.length}`);
out.push(`request.unresolved=${reqUn.length}`);

const openRes = reqRes.filter((r) => String(r.requestId).startsWith("open.p"));
const openUn = reqUn.filter((r) => String(r.requestId).startsWith("open.p"));
out.push(`open.p* resolve=${openRes.length} unresolved=${openUn.length}`);
out.push(
  `non-open requestIds=${reqRes
    .filter((r) => !String(r.requestId).startsWith("open.p"))
    .map((r) => r.requestId)
    .join(", ")}`
);

const resFieldOk = reqRes.every(
  (r) =>
    ["matched", "split_match", "supplemental", "ambiguous"].includes(
      r.resolution
    ) &&
    Array.isArray(r.canonicalRequirementIds) &&
    Array.isArray(r.nativeRequirementIds) &&
    Array.isArray(r.packageIds) &&
    Array.isArray(r.articles) &&
    Array.isArray(r.bindingSources)
);
out.push(`request.resolve_fields_complete=${resFieldOk}`);

out.push("\n=== each request.resolve ===");
for (const r of reqRes) {
  out.push(
    JSON.stringify({
      requestId: r.requestId,
      resolution: r.resolution,
      nativeLen: r.nativeRequirementIds?.length,
      canonLen: r.canonicalRequirementIds?.length,
      packageIds: r.packageIds,
      articles: r.articles,
      bindingSources: r.bindingSources,
      natives: r.nativeRequirementIds,
    })
  );
}

out.push("\n=== unresolved ===");
for (const u of reqUn) {
  out.push(JSON.stringify(u));
}

const recon = by("compliance.run.reconciliation")[0];
out.push(
  "\nrecon=" +
    JSON.stringify(
      recon && {
        planned: recon.planned,
        terminal: recon.terminal,
        missing: recon.missingRequirementIds,
        dupes: recon.duplicateRequirementIds,
      }
    )
);

fs.writeFileSync("logs/analysis/eval/_phase2_detail.txt", out.join("\n"));
