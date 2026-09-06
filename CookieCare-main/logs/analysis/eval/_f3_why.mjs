import fs from "fs";

const mc = fs
  .readFileSync(
    "logs/analysis/an_7d107bb4-4d03-4e4d-93d5-343457f3f598.compliance.log",
    "utf8"
  )
  .split(/\n/)
  .filter((l) => l.startsWith("{"))
  .map((l) => JSON.parse(l));

const fb = mc.find(
  (e) =>
    e.event === "compliance.bundle.created" &&
    e.requirementId === "art28_3_f_security_assistance"
);
const items = (fb?.items || []).filter(
  (i) =>
    /3\.5\.5|impact assessment|dpia|consultation/i.test(
      (i.structuralPath || "") + " " + (i.quotedText || "")
    )
);

const toks = [
  "dpia",
  "impact assessment",
  "prior consultation",
  "article 35",
  "article 36",
  "data protection impact",
];

const rows = items.map((i) => {
  const hay = (i.quotedText || "").toLowerCase();
  return {
    path: i.structuralPath,
    len: (i.quotedText || "").length,
    hits: toks.filter((t) => hay.includes(t)),
    // show chars around "impact" if any
    aroundImpact: (() => {
      const idx = hay.indexOf("impact");
      return idx < 0 ? null : hay.slice(Math.max(0, idx - 40), idx + 60);
    })(),
    // unicode check
    hasSpecial: /[’‘“”]/.test(i.quotedText || ""),
    snippet: (i.quotedText || "").replace(/\s+/g, " ").slice(0, 300),
  };
});

// Also check 3.5.6 for G1/G4 phrases
const gb = mc.find(
  (e) =>
    e.event === "compliance.bundle.created" &&
    e.requirementId === "art28_3_g_deletion_return"
);
const c356 = (gb?.items || []).find((i) => i.structuralPath === "clause-3.5.6");
const h356 = (c356?.quotedText || "").toLowerCase();

fs.writeFileSync(
  "logs/analysis/eval/_f3_why.json",
  JSON.stringify(
    {
      f_items_matching: rows,
      c356_len: (c356?.quotedText || "").length,
      c356_g1_checks: {
        "delete or return": h356.includes("delete or return"),
        "at the option": h356.includes("at the option"),
        "sole option": h356.includes("sole option"),
        "or return": h356.includes("or return"),
        around_option: (() => {
          const i = h356.indexOf("option");
          return i < 0 ? null : h356.slice(i - 30, i + 80);
        })(),
        around_unless: (() => {
          const i = h356.indexOf("unless");
          return i < 0 ? null : h356.slice(i, i + 80);
        })(),
        g4_dist: [
          "unless required by",
          "required to retain",
          "otherwise required by law",
        ].filter((t) => h356.includes(t)),
      },
      c356_full: (c356?.quotedText || "").replace(/\s+/g, " "),
    },
    null,
    2
  )
);
