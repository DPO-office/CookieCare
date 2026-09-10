import fs from "fs";
const dir = "logs/analysis";
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".compliance.log")).map((f) => ({ f, m: fs.statSync(`${dir}/${f}`).mtimeMs })).sort((a, b) => b.m - a.m);
const prefer = files.find((x) => x.f.includes("75bdc670")) || files.find((x) => x.f.includes("206e0591")) || files[0];
const events = fs.readFileSync(`${dir}/${prefer.f}`, "utf8").split(/\n/).filter((l) => l.startsWith("{")).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const by = (n) => events.filter((e) => e.event === n);
const duration = by("compliance.bundle.created").find((e) => e.requirementId === "duration") || by("compliance.bundle.created")[0];
const parts = by("compliance.bundle.scope_partition").filter((e) => e.requirementId === duration.requirementId).map((p) => ({ partitionId: p.partitionId, scope: p.scope, n: (p.evidenceSpanIds || []).length }));
const exclReasons = {};
for (const x of by("compliance.bundle.excluded").filter((e) => e.requirementId === duration.requirementId)) exclReasons[x.reason] = (exclReasons[x.reason] || 0) + 1;
const deps = by("compliance.bundle.dependency").filter((e) => e.requirementId === duration.requirementId);
const depStates = {};
for (const d of deps) depStates[d.state] = (depStates[d.state] || 0) + 1;
const out = {
  file: prefer.f,
  created: { requirementId: duration.requirementId, bundleId: duration.bundleId, nSpans: (duration.evidenceSpanIds || []).length, estimatedTokens: duration.estimatedTokens, first3: (duration.evidenceSpanIds || []).slice(0, 3) },
  partitions: parts,
  exclReasons,
  depCount: deps.length,
  depStates,
  sampleDep: deps[0] && { reference: deps[0].reference, state: deps[0].state, targets: (deps[0].targetSpanIds || []).length },
};
fs.writeFileSync("logs/analysis/eval/_bundle_sample_out.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
