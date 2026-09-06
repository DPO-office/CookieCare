import fs from "fs";

const dir = "logs/analysis";
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".compliance.log"))
  .map((f) => ({ f, m: fs.statSync(`${dir}/${f}`).mtimeMs }))
  .sort((a, b) => b.m - a.m);
const f = files[0].f;
const path = `${dir}/${f}`;
const events = fs
  .readFileSync(path, "utf8")
  .split(/\n/)
  .filter((l) => l.startsWith("{"))
  .map((l) => JSON.parse(l));

const by = (n) => events.filter((e) => e.event === n);
const out = [];
out.push(`file=${f}`);
out.push(`phase=${events[0]?.implementationPhase}`);
out.push(`mtime=${new Date(files[0].m).toISOString()}`);

const counts = {};
for (const e of events) counts[e.event] = (counts[e.event] || 0) + 1;
out.push(`counts=${JSON.stringify(counts)}`);

// --- 4A registry ---
const reg = by("compliance.element.registry");
out.push("\n=== 4A registry ===");
out.push(`count=${reg.length} (expect 8)`);
out.push(
  `reviewStatuses=${JSON.stringify([...new Set(reg.map((r) => r.reviewStatus))])}`
);
for (const r of reg) {
  out.push(
    `${r.canonicalKey} | uid=${r.requirementUid} | elems=${(r.elements || []).map((e) => e.elementId).join(",")} | agg=${r.aggregationRule} | v=${r.version} | review=${r.reviewStatus}`
  );
}

// --- 4B coverage ---
const inputs = by("compliance.verify.input");
const els = by("compliance.verify.element");
const comps = by("compliance.verify.completeness");
out.push("\n=== 4B coverage ===");
out.push(`verify.input=${inputs.length} reqs=${JSON.stringify(inputs.map((i) => i.requirementId))}`);
out.push(`verify.element=${els.length}`);
out.push(`verify.completeness=${comps.length}`);

const expectedPriority = [
  "art28_3_a_instructions",
  "art28_3_f_security_assistance",
  "art28_3_g_deletion_return",
  "subject_matter",
  "duration",
  "nature_purpose",
  "data_categories",
  "data_subject_categories",
];
for (const id of expectedPriority) {
  const has = inputs.some((i) => i.requirementId === id);
  out.push(`matrix_for_${id}=${has}`);
}

// completeness missing
out.push("\n=== completeness ===");
const badMissing = comps.filter((c) => (c.missingElementIds || []).length > 0);
out.push(`any_missing=${badMissing.length}`);
for (const c of comps) {
  out.push(
    `${c.requirementId}: expected=${(c.expectedElementIds || []).join(",")} missing=${JSON.stringify(c.missingElementIds)}`
  );
}

// --- F1/F2/F3 ---
out.push("\n=== 28(3)(f) F1/F2/F3 ===");
const fEls = els.filter(
  (e) =>
    e.requirementId === "art28_3_f_security_assistance" ||
    /28_3\.f|security_assistance|controller_assistance/i.test(
      String(e.requirementId) + String(e.bundleId || "")
    )
);
out.push(`f_element_rows=${fEls.length}`);
for (const e of fEls) {
  out.push(
    JSON.stringify({
      req: e.requirementId,
      elementId: e.elementId,
      state: e.state,
      spans: e.evidenceSpanIds,
      nQuotes: (e.quotes || []).length,
      quoteVerified: e.quoteVerified,
      scope: e.scope,
      fact: (e.establishedFact || "").slice(0, 160),
      gap: (e.gapDescription || "").slice(0, 160),
      q0: e.quotes?.[0]?.quote?.slice(0, 120),
    })
  );
}
if (fEls.length === 0) {
  // check registry for F elements
  const fReg = reg.find((r) => /security_assistance|28_3\.f|28\(3\)\(f\)/i.test(JSON.stringify(r)));
  out.push(
    `registry_f=${fReg ? fReg.canonicalKey + " elems=" + fReg.elements.map((e) => e.elementId).join(",") : "NONE"}`
  );
}

// --- G1-G4 ---
out.push("\n=== 28(3)(g) G1-G4 ===");
const gEls = els.filter(
  (e) =>
    e.requirementId === "art28_3_g_deletion_return" ||
    /deletion|return_or_deletion|28_3\.g/i.test(String(e.requirementId))
);
out.push(`g_element_rows=${gEls.length}`);
for (const e of gEls) {
  out.push(
    JSON.stringify({
      req: e.requirementId,
      elementId: e.elementId,
      state: e.state,
      spans: (e.evidenceSpanIds || []).length,
      scope: e.scope,
      fact: (e.establishedFact || "").slice(0, 140),
      gap: (e.gapDescription || "").slice(0, 140),
      q0: e.quotes?.[0]?.quote?.slice(0, 100),
    })
  );
}
if (gEls.length === 0) {
  const gReg = reg.find((r) => /deletion|return_or/i.test(JSON.stringify(r)));
  out.push(
    `registry_g=${gReg ? gReg.canonicalKey + " elems=" + gReg.elements.map((e) => e.elementId).join(",") : "NONE"}`
  );
}

// --- Appendix particulars SM1/CD1/DS1 ---
out.push("\n=== Appendix particulars ===");
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
  const bundle = by("compliance.bundle.created").find((b) => b.requirementId === req);
  const spanSet = new Set(e.evidenceSpanIds || []);
  const cited = (bundle?.items || []).filter((i) => spanSet.has(i.spanId));
  const paths = cited.map((i) => i.structuralPath);
  const appendixPath = paths.filter((p) => /appendix/i.test(p || ""));
  const appendixOffset = cited.filter((i) =>
    /::section::30[0-9]{3}-|30754|30465|32965/.test(i.spanId || "")
  );
  const listish = cited.filter((i) => /●|personal details|contact details|processing subject/i.test(i.quotedText || ""));
  out.push(
    JSON.stringify({
      req,
      elId,
      state: e.state,
      nSpans: (e.evidenceSpanIds || []).length,
      scope: e.scope,
      gap: (e.gapDescription || "").slice(0, 120),
      paths: paths.slice(0, 8),
      appendixPathCount: appendixPath.length,
      appendixOffsetCount: appendixOffset.length,
      listishCount: listish.length,
      q0: e.quotes?.[0]?.quote?.slice(0, 140),
    })
  );
}

// --- scope mix on supported ---
out.push("\n=== scope on supported elements ===");
const supported = els.filter((e) => e.state === "supported");
for (const e of supported) {
  const rel = e.scope?.relationship;
  const excl = e.scope?.exception;
  out.push(
    `${e.requirementId}/${e.elementId}: relationship=${rel ?? "∅"} exception=${excl ?? "∅"} keys=${Object.keys(e.scope || {}).join(",")}`
  );
}

// --- key mismatch diagnostic ---
out.push("\n=== schema lookup diagnostic ===");
out.push(
  "Registry a/f/g keys: " +
    reg
      .filter((r) => /28_3|_3\./.test(r.canonicalKey))
      .map((r) => r.canonicalKey)
      .join(" | ")
);
out.push(
  "Expected identity canons: gdpr.article28.3a.documented_instructions | gdpr.article28.3f.controller_assistance | gdpr.article28.3g.deletion_or_return"
);

fs.writeFileSync("logs/analysis/eval/_phase4_accept.txt", out.join("\n"));
console.log("ok", f);
