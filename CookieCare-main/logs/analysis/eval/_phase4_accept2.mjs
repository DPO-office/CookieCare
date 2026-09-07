import fs from "fs";

const dir = "logs/analysis";
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".compliance.log"))
  .map((f) => ({ f, m: fs.statSync(`${dir}/${f}`).mtimeMs }))
  .sort((a, b) => b.m - a.m);

const f = files[0].f;
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
const out = [];
out.push(`file=${f}`);
out.push(`phase=${events[0]?.implementationPhase}`);
out.push(`mtime=${new Date(files[0].m).toISOString()}`);

const counts = {};
for (const e of events) counts[e.event] = (counts[e.event] || 0) + 1;
out.push(`counts=${JSON.stringify(counts)}`);

const reg = by("compliance.element.registry");
const inputs = by("compliance.verify.input");
const els = by("compliance.verify.element");
const comps = by("compliance.verify.completeness");

out.push("\n=== 4A registry ===");
out.push(`count=${reg.length}`);
out.push(
  `review=${JSON.stringify([...new Set(reg.map((r) => r.reviewStatus))])}`
);
for (const r of reg) {
  out.push(
    `${r.canonicalKey} aliases=${JSON.stringify(r.aliases || [])} elems=${(r.elements || []).map((e) => e.elementId).join(",")}`
  );
}

out.push("\n=== 4B inputs (expect 8) ===");
out.push(`unique_reqs=${new Set(inputs.map((i) => i.requirementId)).size}`);
for (const i of inputs) {
  out.push(
    JSON.stringify({
      req: i.requirementId,
      canonicalKey: i.canonicalKey,
      schemaCanonicalKey: i.schemaCanonicalKey,
      matchedVia: i.matchedVia,
      schemaVersion: i.schemaVersion,
      reviewStatus: i.reviewStatus,
      elementIds: i.elementIds,
    })
  );
}

out.push("\n=== matchedVia != canonicalKey ===");
const nonExact = inputs.filter((i) => i.matchedVia && i.matchedVia !== "canonicalKey");
out.push(`count=${nonExact.length}`);
for (const i of nonExact) {
  out.push(
    `${i.requirementId}: matchedVia=${i.matchedVia} canon=${i.canonicalKey} schema=${i.schemaCanonicalKey}`
  );
}

out.push("\n=== completeness missing ===");
const bad = comps.filter((c) => (c.missingElementIds || []).length > 0);
out.push(`any_missing=${bad.length}`);
for (const c of comps) {
  out.push(
    `${c.requirementId}: expected=${(c.expectedElementIds || []).join(",")} missing=${JSON.stringify(c.missingElementIds)}`
  );
}

function dumpEls(reqHint, ids) {
  const rows = els.filter(
    (e) =>
      e.requirementId === reqHint ||
      (e.requirementId || "").includes(reqHint) ||
      ids.includes(e.elementId)
  );
  // prefer exact requirement match if any
  const exact = els.filter((e) => e.requirementId === reqHint);
  const use = exact.length ? exact : rows.filter((e) => ids.includes(e.elementId));
  return use;
}

function spanPaths(req, spanIds) {
  const bundle = by("compliance.bundle.created").find((b) => b.requirementId === req);
  const map = new Map((bundle?.items || []).map((i) => [i.spanId, i]));
  return (spanIds || []).map((id) => {
    const it = map.get(id);
    return {
      span: id?.slice(-40),
      path: it?.structuralPath,
      q: (it?.quotedText || "").slice(0, 100).replace(/\s+/g, " "),
    };
  });
}

out.push("\n=== (f) F1/F2/F3 ===");
const fReq =
  inputs.find((i) => /f_|security_assistance|controller_assistance/i.test(i.requirementId))
    ?.requirementId || "art28_3_f_security_assistance";
const fRows = els.filter((e) => e.requirementId === fReq);
out.push(`fReq=${fReq} rows=${fRows.length}`);
for (const e of fRows) {
  const paths = spanPaths(fReq, e.evidenceSpanIds);
  const has64 = paths.some(
    (p) => /6\.4|clause-6\.4/i.test(p.path || "") || /6\.4|Security Assistance/i.test(p.q || "")
  );
  const has10 = paths.some(
    (p) => /clause-10\b|^10\b/i.test(p.path || "") || /DATA PROTECTION IMPACT|DPIA/i.test(p.q || "")
  );
  const hasBreach = paths.some((p) => /breach|incident|33|34/i.test((p.path || "") + (p.q || "")));
  out.push(
    JSON.stringify({
      elementId: e.elementId,
      state: e.state,
      nSpans: (e.evidenceSpanIds || []).length,
      quoteVerified: e.quoteVerified,
      scope: e.scope,
      has64,
      has10,
      hasBreach,
      paths: paths.slice(0, 5).map((p) => p.path),
      fact: (e.establishedFact || "").slice(0, 140),
      gap: (e.gapDescription || "").slice(0, 140),
      q0: e.quotes?.[0]?.quote?.slice(0, 120),
    })
  );
}

out.push("\n=== (g) G1-G4 ===");
const gReq =
  inputs.find((i) => /g_|deletion|return/i.test(i.requirementId))?.requirementId ||
  "art28_3_g_deletion_return";
const gRows = els.filter((e) => e.requirementId === gReq);
out.push(`gReq=${gReq} rows=${gRows.length}`);
for (const e of gRows) {
  out.push(
    JSON.stringify({
      elementId: e.elementId,
      state: e.state,
      nSpans: (e.evidenceSpanIds || []).length,
      scope: e.scope,
      fact: (e.establishedFact || "").slice(0, 140),
      gap: (e.gapDescription || "").slice(0, 140),
      q0: e.quotes?.[0]?.quote?.slice(0, 120),
    })
  );
}

out.push("\n=== (a) A1/A2 ===");
const aReq =
  inputs.find((i) => /a_|instructions/i.test(i.requirementId))?.requirementId ||
  "art28_3_a_instructions";
for (const e of els.filter((x) => x.requirementId === aReq)) {
  out.push(
    JSON.stringify({
      elementId: e.elementId,
      state: e.state,
      nSpans: (e.evidenceSpanIds || []).length,
      paths: spanPaths(aReq, e.evidenceSpanIds)
        .slice(0, 4)
        .map((p) => p.path),
      gap: (e.gapDescription || "").slice(0, 100),
      q0: e.quotes?.[0]?.quote?.slice(0, 100),
    })
  );
}

out.push("\n=== Appendix particulars (status only) ===");
for (const [req, elId] of [
  ["subject_matter", "SM1"],
  ["data_categories", "CD1"],
  ["data_subject_categories", "DS1"],
]) {
  const e = els.find((x) => x.requirementId === req && x.elementId === elId);
  if (!e) {
    out.push(`${req}/${elId}: NO_ROW`);
    continue;
  }
  const paths = spanPaths(req, e.evidenceSpanIds).map((p) => p.path);
  out.push(
    `${req}/${elId}: state=${e.state} appendixPath=${paths.filter((p) => /appendix/i.test(p || "")).length} paths0=${paths[0]}`
  );
}

out.push("\n=== scope mix on supported ===");
for (const e of els.filter((x) => x.state === "supported")) {
  out.push(
    `${e.requirementId}/${e.elementId}: rel=${e.scope?.relationship ?? "∅"}`
  );
}

fs.writeFileSync("logs/analysis/eval/_phase4_accept2.txt", out.join("\n"));
console.log("wrote", f);
