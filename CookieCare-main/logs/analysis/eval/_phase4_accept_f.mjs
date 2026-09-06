import fs from "fs";

const path =
  "logs/analysis/an_e76559f4-3126-45df-9de8-ca7529a3da3f.compliance.log";
const events = fs
  .readFileSync(path, "utf8")
  .split(/\n/)
  .filter((l) => l.startsWith("{"))
  .map((l) => JSON.parse(l));
const bundle = events.find(
  (e) =>
    e.event === "compliance.bundle.created" &&
    e.requirementId === "art28_3_f_security_assistance"
);
const items = bundle?.items || [];
const hits = items.filter((i) => {
  const p = i.structuralPath || "";
  const q = i.quotedText || "";
  return (
    /6\.4|clause-6\.4|clause-10\b|clause-10\.|dpiA|DPIA|breach|article 32|assist/i.test(
      p + " " + q
    )
  );
});
const out = [
  `f_bundle_items=${items.length}`,
  `f_relevant=${hits.length}`,
  ...hits.slice(0, 15).map((i) =>
    JSON.stringify({
      path: i.structuralPath,
      src: i.source,
      span: i.spanId?.slice(-45),
      q: (i.quotedText || "").slice(0, 130).replace(/\s+/g, " "),
    })
  ),
  `paths_with_6_4=${items.filter((i) => /6\.4/.test(i.structuralPath + i.quotedText)).length}`,
  `paths_with_clause10=${items.filter((i) => /clause-10\b|clause 10\b|10\./i.test(i.structuralPath || "")).length}`,
];

// SM1 first quote is appendix POINTER - check if any cited span is list body under appendix
const sm = events.find(
  (e) =>
    e.event === "compliance.verify.element" &&
    e.requirementId === "subject_matter" &&
    e.elementId === "SM1"
);
const smBundle = events.find(
  (e) => e.event === "compliance.bundle.created" && e.requirementId === "subject_matter"
);
const cited = new Set(sm.evidenceSpanIds || []);
const smItems = (smBundle.items || []).filter((i) => cited.has(i.spanId));
out.push("---SM1 cited detail---");
for (const i of smItems.slice(0, 12)) {
  out.push(
    `${i.structuralPath} | ${i.source} | pointer=${/appendix 1 to the agreement describes/i.test(i.quotedText || "")} | list=${/●/.test(i.quotedText || "")} | q=${(i.quotedText || "").slice(0, 90).replace(/\s+/g, " ")}`
  );
}

fs.writeFileSync("logs/analysis/eval/_phase4_accept_f.txt", out.join("\n"));
