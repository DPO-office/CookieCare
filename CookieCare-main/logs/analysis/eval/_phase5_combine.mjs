import fs from "fs";

const files = [
  "an_5c929289-33e1-4303-abac-47779f4d5e91.compliance.log",
  "an_7d107bb4-4d03-4e4d-93d5-343457f3f598.compliance.log",
  "an_70e8df41-a682-4ea2-b108-5ff52f0407a0.compliance.log",
];

function load(f) {
  const p = `logs/analysis/${f}`;
  if (!fs.existsSync(p)) return null;
  return fs
    .readFileSync(p, "utf8")
    .split(/\n/)
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l));
}

function fp(events) {
  const dur = events.find(
    (e) => e.event === "compliance.bundle.created" && e.requirementId === "duration"
  );
  const parts = (dur?.partitions || []).map((p) => p.scope?.relationship);
  const excl = {};
  for (const b of events.filter((e) => e.event === "compliance.bundle.created")) {
    for (const x of b.exclusions || []) excl[x.reason] = (excl[x.reason] || 0) + 1;
  }
  return (excl.incompatible_scope || 0) > 20 || parts.includes("controller_to_controller")
    ? "MC"
    : "Bitrix";
}

const out = [];
for (const f of files) {
  const events = load(f);
  if (!events) {
    out.push(`${f}: MISSING`);
    continue;
  }
  const label = fp(events);
  const results = events.filter((e) => e.event === "compliance.assess.result");
  const els = events.filter((e) => e.event === "compliance.verify.element");
  const byReq = {};
  for (const e of els) {
    byReq[e.requirementId] = byReq[e.requirementId] || {};
    byReq[e.requirementId][e.elementId] = {
      state: e.state,
      paths: (e.evidenceSpanIds || []).length,
      q0: (e.quotes?.[0]?.quote || "").slice(0, 140).replace(/\s+/g, " "),
    };
  }
  out.push(`\n==== ${label} ${f} ====`);
  for (const id of [
    "art28_3_g_deletion_return",
    "art28_3_f_security_assistance",
    "art28_3_a_instructions",
  ]) {
    const r = results.find((x) => x.requirementId === id);
    out.push(
      `${id}: status=${r?.status} reasons=${JSON.stringify(r?.reasonCodes)}`
    );
    out.push(`  matrix=${JSON.stringify(byReq[id])}`);
  }
  // g4 quote if supported
  const g4 = els.find(
    (e) => e.requirementId === "art28_3_g_deletion_return" && e.elementId === "G4"
  );
  const g3 = els.find(
    (e) => e.requirementId === "art28_3_g_deletion_return" && e.elementId === "G3"
  );
  const g1 = els.find(
    (e) => e.requirementId === "art28_3_g_deletion_return" && e.elementId === "G1"
  );
  const f3 = els.find(
    (e) => e.requirementId === "art28_3_f_security_assistance" && e.elementId === "F3"
  );
  out.push(
    `G1=${g1?.state} G3=${g3?.state} q3=${(g3?.quotes?.[0]?.quote || "").slice(0, 120).replace(/\s+/g, " ")}`
  );
  out.push(
    `G4=${g4?.state} q4=${(g4?.quotes?.[0]?.quote || "").slice(0, 120).replace(/\s+/g, " ")}`
  );
  out.push(
    `F3=${f3?.state} qF3=${(f3?.quotes?.[0]?.quote || "").slice(0, 120).replace(/\s+/g, " ")}`
  );
}

fs.writeFileSync("logs/analysis/eval/_phase5_combine.txt", out.join("\n"));
