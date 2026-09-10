import fs from "fs";

const f =
  "logs/analysis/an_e76559f4-3126-45df-9de8-ca7529a3da3f.compliance.log";
const t = fs.readFileSync(f, "utf8");
const lines = t
  .split(/\n/)
  .filter((l) => l.startsWith("{"))
  .map((l) => JSON.parse(l));

const by = (n) => lines.filter((e) => e.event === n);
const counts = {};
for (const e of lines) counts[e.event] = (counts[e.event] || 0) + 1;

const out = [];
out.push(`phase=${lines[0]?.implementationPhase}`);
out.push(`header=${t.includes("EVIDENCE BUNDLES ONLY") || t.slice(0, 200)}`);
out.push(`counts=${JSON.stringify(counts)}`);
out.push(`bundles=${by("compliance.bundle.created").length}`);
out.push(`registry=${by("compliance.element.registry").length}`);
out.push(`verify.input=${by("compliance.verify.input").length}`);
out.push(`verify.element=${by("compliance.verify.element").length}`);
out.push(
  `verify.completeness=${by("compliance.verify.completeness").length}`
);

const inputs = by("compliance.verify.input");
const elements = by("compliance.verify.element");
const comps = by("compliance.verify.completeness");

out.push(`verify.input reqs=${JSON.stringify(inputs.map((e) => e.requirementId))}`);

const stateByReq = {};
for (const e of elements) {
  const r = e.requirementId;
  stateByReq[r] = stateByReq[r] || {};
  stateByReq[r][e.state] = (stateByReq[r][e.state] || 0) + 1;
  stateByReq[r]._els = (stateByReq[r]._els || 0) + 1;
}

out.push("---per_req_states---");
for (const [req, st] of Object.entries(stateByReq)) {
  out.push(`${req}: ${JSON.stringify(st)}`);
}

const global = {};
for (const e of elements) global[e.state] = (global[e.state] || 0) + 1;
out.push(`global_states=${JSON.stringify(global)}`);

out.push("---completeness---");
for (const c of comps) {
  out.push(
    `${c.requirementId}: expected=${(c.expectedElementIds || []).length} returned=${(c.returnedElementIds || []).length} missing=${JSON.stringify(c.missingElementIds || [])} schema=${c.schemaVersion} review=${c.reviewStatus || inputs.find((i) => i.requirementId === c.requirementId)?.reviewStatus}`
  );
}

// Sample key requirements for content quality
function sample(req) {
  return elements
    .filter((e) => e.requirementId === req)
    .map((e) => ({
      id: e.elementId,
      state: e.state,
      spans: (e.evidenceSpanIds || []).length,
      quotes: (e.quotes || []).length,
      quoteVerified: e.quoteVerified,
      fact: (e.establishedFact || "").slice(0, 120),
      gap: (e.gapDescription || "").slice(0, 120),
      q0: e.quotes?.[0]?.quote?.slice(0, 100),
    }));
}
out.push("---sample duration---");
out.push(JSON.stringify(sample("duration"), null, 2));
out.push("---sample data_categories---");
out.push(JSON.stringify(sample("data_categories"), null, 2));
out.push("---sample art28_3_f---");
out.push(JSON.stringify(sample("art28_3_f_security_assistance"), null, 2));
out.push("---sample art28_3_g---");
out.push(JSON.stringify(sample("art28_3_g_deletion_return"), null, 2));

// Registry coverage
const reg = by("compliance.element.registry");
out.push("---registry---");
out.push(
  `keys=${JSON.stringify(reg.map((r) => r.canonicalKey || r.requirementUid))}`
);
out.push(
  `reviewStatuses=${JSON.stringify([...new Set(reg.map((r) => r.reviewStatus))])}`
);

// Bundles still present for all 15?
const bundleReqs = by("compliance.bundle.created").map((e) => e.requirementId);
out.push(`bundle_reqs=${bundleReqs.length} ${JSON.stringify(bundleReqs)}`);
out.push(
  `inputs_vs_bundles_missing=${JSON.stringify(
    bundleReqs.filter((id) => !inputs.some((i) => i.requirementId === id))
  )}`
);

fs.writeFileSync("logs/analysis/eval/_phase4_check.txt", out.join("\n"));
console.log("wrote");
