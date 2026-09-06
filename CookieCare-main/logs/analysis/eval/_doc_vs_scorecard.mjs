import fs from "fs";

const bx =
  "logs/analysis/an_5c929289-33e1-4303-abac-47779f4d5e91.compliance.log";
const mc =
  "logs/analysis/an_7d107bb4-4d03-4e4d-93d5-343457f3f598.compliance.log";

function load(f) {
  return fs
    .readFileSync(f, "utf8")
    .split(/\n/)
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l));
}

function bundleItems(ev, req) {
  const b = ev.find(
    (e) => e.event === "compliance.bundle.created" && e.requirementId === req
  );
  return b?.items || [];
}

const bev = load(bx);
const g = bundleItems(bev, "art28_3_g_deletion_return");
const hit = g.filter((i) =>
  /unless any applicable law requires storage|Deletion on Term Expiry|2\.5 /i.test(
    i.quotedText || ""
  )
);
const verifyG = bev.filter(
  (e) =>
    e.event === "compliance.verify.element" &&
    e.requirementId === "art28_3_g_deletion_return"
);

const mev = load(mc);
const all = mev
  .filter((e) => e.event === "compliance.bundle.created")
  .flatMap((e) =>
    (e.items || []).map((i) => ({
      req: e.requirementId,
      path: i.structuralPath,
      q: (i.quotedText || "").replace(/\s+/g, " "),
    }))
  );
const dpias = all.filter((i) =>
  /dpia|impact assessment|prior consultation|article 35|article 36/i.test(i.q)
);
const verifyMcG = mev.filter(
  (e) =>
    e.event === "compliance.verify.element" &&
    e.requirementId === "art28_3_g_deletion_return"
);
const verifyMcF = mev.filter(
  (e) =>
    e.event === "compliance.verify.element" &&
    e.requirementId === "art28_3_f_security_assistance"
);

const out = {
  bitrix: {
    g_bundle_n: g.length,
    proviso_in_g_bundle: hit.map((i) => ({
      path: i.structuralPath,
      q: (i.quotedText || "").replace(/\s+/g, " ").slice(0, 240),
    })),
    verifyG: verifyG.map((e) => ({
      el: e.elementId,
      state: e.state,
      reason: e.reasonCode || e.reason || null,
    })),
  },
  mastercard: {
    dpia_hits_in_any_bundle: dpias.length,
    dpia_samples: dpias.slice(0, 8).map((i) => ({
      req: i.req,
      path: i.path,
      q: i.q.slice(0, 200),
    })),
    verifyG: verifyMcG.map((e) => ({ el: e.elementId, state: e.state })),
    verifyF: verifyMcF.map((e) => ({ el: e.elementId, state: e.state })),
    clause_356_full: all.find((i) => i.path === "clause-3.5.6")?.q || null,
  },
};

fs.writeFileSync(
  "logs/analysis/eval/_doc_vs_scorecard.json",
  JSON.stringify(out, null, 2)
);
console.log("wrote");
