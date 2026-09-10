import fs from "fs";

const f = "an_46c8c8c6-bc51-4d3b-8fd5-c10b1fffacbc.compliance.log";
const events = fs
  .readFileSync(`logs/analysis/${f}`, "utf8")
  .split(/\n/)
  .filter((l) => l.startsWith("{"))
  .map((l) => JSON.parse(l));

const by = (n) => events.filter((e) => e.event === n);
const out = [];
out.push(`file=${f}`);
out.push(`phase=${events[0]?.implementationPhase}`);

const counts = {};
for (const e of events) counts[e.event] = (counts[e.event] || 0) + 1;
out.push(`counts=${JSON.stringify(counts)}`);

// fingerprint vs Bitrix
const durBundle = by("compliance.bundle.created").find((b) => b.requirementId === "duration");
out.push(
  `duration_partitions=${JSON.stringify(
    (durBundle?.partitions || []).map((p) => ({
      id: p.partitionId,
      rel: p.scope?.relationship,
      n: (p.itemSpanIds || []).length,
    }))
  )}`
);
const excl = {};
for (const b of by("compliance.bundle.created")) {
  for (const x of b.exclusions || []) excl[x.reason] = (excl[x.reason] || 0) + 1;
}
out.push(`bundle_excl_totals=${JSON.stringify(excl)}`);
out.push(`dep_sample_duration=${(durBundle?.dependencies || []).length}`);

const inputs = by("compliance.verify.input");
const els = by("compliance.verify.element");
const comps = by("compliance.verify.completeness");
const reg = by("compliance.element.registry");

out.push(`\nregistry=${reg.length} review=${[...new Set(reg.map((r) => r.reviewStatus))]}`);
out.push(`verify.input unique=${new Set(inputs.map((i) => i.requirementId)).size}`);
for (const i of inputs) {
  out.push(
    `${i.requirementId}: matchedVia=${i.matchedVia} canon=${i.canonicalKey} schema=${i.schemaCanonicalKey}`
  );
}
out.push(
  `alias_or_loose=${inputs.filter((i) => i.matchedVia && i.matchedVia !== "canonicalKey").length}`
);
out.push(
  `completeness_missing=${comps.filter((c) => (c.missingElementIds || []).length > 0).length}`
);

function spanPaths(req, spanIds) {
  const bundle = by("compliance.bundle.created").find((b) => b.requirementId === req);
  const map = new Map((bundle?.items || []).map((i) => [i.spanId, i]));
  return (spanIds || []).map((id) => {
    const it = map.get(id);
    return {
      path: it?.structuralPath || "?",
      q: (it?.quotedText || "").slice(0, 110).replace(/\s+/g, " "),
    };
  });
}

out.push("\n=== (f) F1/F2/F3 ===");
const fReq = "art28_3_f_security_assistance";
for (const e of els.filter((x) => x.requirementId === fReq)) {
  const paths = spanPaths(fReq, e.evidenceSpanIds);
  out.push(
    JSON.stringify({
      id: e.elementId,
      state: e.state,
      n: (e.evidenceSpanIds || []).length,
      paths: paths.slice(0, 6).map((p) => p.path),
      has64: paths.some((p) => /6\.4/.test(p.path + p.q)),
      has10: paths.some((p) => /clause-10|\b10\b|DPIA|impact assessment/i.test(p.path + p.q)),
      hasBreach: paths.some((p) => /breach|incident|33|34/i.test(p.path + p.q)),
      q0: e.quotes?.[0]?.quote?.slice(0, 110),
      gap: (e.gapDescription || "").slice(0, 100),
    })
  );
}

out.push("\n=== (g) G1-G4 ===");
const gReq = "art28_3_g_deletion_return";
for (const e of els.filter((x) => x.requirementId === gReq)) {
  out.push(
    JSON.stringify({
      id: e.elementId,
      state: e.state,
      n: (e.evidenceSpanIds || []).length,
      paths: spanPaths(gReq, e.evidenceSpanIds)
        .slice(0, 4)
        .map((p) => p.path),
      q0: e.quotes?.[0]?.quote?.slice(0, 110),
      gap: (e.gapDescription || "").slice(0, 120),
      fact: (e.establishedFact || "").slice(0, 120),
    })
  );
}

out.push("\n=== (a) A1/A2 ===");
for (const e of els.filter((x) => x.requirementId === "art28_3_a_instructions")) {
  out.push(
    JSON.stringify({
      id: e.elementId,
      state: e.state,
      n: (e.evidenceSpanIds || []).length,
      paths: spanPaths("art28_3_a_instructions", e.evidenceSpanIds)
        .slice(0, 4)
        .map((p) => p.path),
      q0: e.quotes?.[0]?.quote?.slice(0, 100),
    })
  );
}

out.push("\n=== particulars appendix paths ===");
for (const [req, elId] of [
  ["subject_matter", "SM1"],
  ["data_categories", "CD1"],
  ["data_subject_categories", "DS1"],
  ["duration", "DU1"],
]) {
  const e = els.find((x) => x.requirementId === req && x.elementId === elId);
  if (!e) {
    out.push(`${req}/${elId}: NO`);
    continue;
  }
  const paths = spanPaths(req, e.evidenceSpanIds).map((p) => p.path);
  out.push(
    `${req}/${elId}: state=${e.state} appendix=${paths.filter((p) => /appendix/i.test(p || "")).length} rel=${e.scope?.relationship} p0=${paths[0]}`
  );
}

out.push("\n=== supported scopes ===");
for (const e of els.filter((x) => x.state === "supported")) {
  out.push(`${e.requirementId}/${e.elementId}: ${e.scope?.relationship ?? "∅"}`);
}

// compare to Bitrix session briefly
out.push("\n=== vs Bitrix an_db93a7eb (summary) ===");
out.push("MC fingerprint: higher deps (~690+), more budget excl, duration partitions often include C→C");

fs.writeFileSync("logs/analysis/eval/_phase4_mc.txt", out.join("\n"));
console.log("ok");
