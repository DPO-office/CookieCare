import fs from "fs";

const dir = "logs/analysis";
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".compliance.log"))
  .map((f) => ({ f, m: fs.statSync(`${dir}/${f}`).mtimeMs }))
  .sort((a, b) => b.m - a.m)
  .slice(0, 6);

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
  const dur = by("compliance.bundle.created").find((b) => b.requirementId === "duration");
  const parts = (dur?.partitions || []).map((p) => p.scope?.relationship);
  const excl = {};
  for (const b of by("compliance.bundle.created")) {
    for (const x of b.exclusions || []) excl[x.reason] = (excl[x.reason] || 0) + 1;
  }
  const fingerprint =
    (excl.incompatible_scope || 0) > 20 || parts.includes("controller_to_controller")
      ? "MC-like"
      : "Bitrix-like";

  const inputs = by("compliance.verify.input");
  const els = by("compliance.verify.element");
  const comps = by("compliance.verify.completeness");

  function spanPaths(req, spanIds) {
    const bundle = by("compliance.bundle.created").find((b) => b.requirementId === req);
    const map = new Map((bundle?.items || []).map((i) => [i.spanId, i]));
    return (spanIds || []).map((id) => {
      const it = map.get(id);
      return it?.structuralPath || "?";
    });
  }

  const fReq = "art28_3_f_security_assistance";
  const gReq = "art28_3_g_deletion_return";
  const fRows = els
    .filter((e) => e.requirementId === fReq)
    .map((e) => {
      const paths = spanPaths(fReq, e.evidenceSpanIds);
      return {
        id: e.elementId,
        state: e.state,
        n: (e.evidenceSpanIds || []).length,
        paths: paths.slice(0, 5),
        has64: paths.some((p) => /6\.4/.test(p)),
        has10: paths.some((p) => /clause-10\b/.test(p)),
        q0: (e.quotes?.[0]?.quote || "").slice(0, 90).replace(/\s+/g, " "),
      };
    });
  const gRows = els
    .filter((e) => e.requirementId === gReq)
    .map((e) => ({
      id: e.elementId,
      state: e.state,
      n: (e.evidenceSpanIds || []).length,
      paths: spanPaths(gReq, e.evidenceSpanIds).slice(0, 3),
      gap: (e.gapDescription || "").slice(0, 80),
      q0: (e.quotes?.[0]?.quote || "").slice(0, 90).replace(/\s+/g, " "),
    }));

  const appendix = ["subject_matter", "data_categories", "data_subject_categories"].map((req) => {
    const e = els.find(
      (x) =>
        x.requirementId === req &&
        (x.elementId === "SM1" || x.elementId === "CD1" || x.elementId === "DS1")
    );
    if (!e) return `${req}:NO`;
    const paths = spanPaths(req, e.evidenceSpanIds);
    return `${req}/${e.elementId}: state=${e.state} appendix=${paths.filter((p) => /appendix/i.test(p)).length} p0=${paths[0]}`;
  });

  return {
    f,
    fingerprint,
    phase: events[0]?.implementationPhase,
    mtime: new Date(files.find((x) => x.f === f).m).toISOString(),
    inputs: new Set(inputs.map((i) => i.requirementId)).size,
    elements: els.length,
    missing: comps.filter((c) => (c.missingElementIds || []).length > 0).length,
    parts,
    excl,
    fRows,
    gRows,
    appendix,
    aRows: els
      .filter((e) => e.requirementId === "art28_3_a_instructions")
      .map((e) => ({ id: e.elementId, state: e.state, n: (e.evidenceSpanIds || []).length })),
  };
}

const out = [];
for (const { f } of files.slice(0, 3)) {
  const r = analyze(f);
  out.push(`\n######## ${r.fingerprint} ${r.f}`);
  out.push(`phase=${r.phase} mtime=${r.mtime}`);
  out.push(
    `matrices=${r.inputs}/8 elements=${r.elements} missing=${r.missing} durationParts=${JSON.stringify(r.parts)} excl=${JSON.stringify(r.excl)}`
  );
  out.push("--- (a) ---");
  out.push(JSON.stringify(r.aRows));
  out.push("--- (f) ---");
  out.push(JSON.stringify(r.fRows, null, 0));
  out.push("--- (g) ---");
  out.push(JSON.stringify(r.gRows, null, 0));
  out.push("--- appendix ---");
  out.push(r.appendix.join("\n"));
}

fs.writeFileSync("logs/analysis/eval/_phase4_now.txt", out.join("\n"));
console.log("ok");
