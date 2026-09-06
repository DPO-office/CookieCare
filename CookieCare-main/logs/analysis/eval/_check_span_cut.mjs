import fs from "fs";
const bx =
  "logs/analysis/an_5c929289-33e1-4303-abac-47779f4d5e91.compliance.log";
const ev = fs
  .readFileSync(bx, "utf8")
  .split(/\n/)
  .filter((l) => l.startsWith("{"))
  .map((l) => JSON.parse(l));
const b = ev.find(
  (e) =>
    e.event === "compliance.bundle.created" &&
    e.requirementId === "art28_3_g_deletion_return"
);
const item = (b.items || []).find((i) => i.structuralPath === "clause-2.5");
const q = item?.quotedText || "";
fs.writeFileSync(
  "logs/analysis/eval/_bitrix_g_clause25.json",
  JSON.stringify(
    {
      path: item?.structuralPath,
      len: q.length,
      full: q.replace(/\s+/g, " "),
      hasProviso: /unless any applicable law requires storage/i.test(q),
      endsWith: q.slice(-80).replace(/\s+/g, " "),
    },
    null,
    2
  )
);

// Also check MC 3.5.5 full for DPIA words
const mc =
  "logs/analysis/an_7d107bb4-4d03-4e4d-93d5-343457f3f598.compliance.log";
const mev = fs
  .readFileSync(mc, "utf8")
  .split(/\n/)
  .filter((l) => l.startsWith("{"))
  .map((l) => JSON.parse(l));
const fb = mev.find(
  (e) =>
    e.event === "compliance.bundle.created" &&
    e.requirementId === "art28_3_f_security_assistance"
);
const c355 = (fb?.items || []).find((i) => i.structuralPath === "clause-3.5.5");
const q355 = (c355?.quotedText || "").replace(/\s+/g, " ");
fs.writeFileSync(
  "logs/analysis/eval/_mc_f_clause355.json",
  JSON.stringify(
    {
      len: q355.length,
      full: q355,
      hasDpiA: /dpia|impact assessment|prior consultation|article 35|article 36/i.test(
        q355
      ),
    },
    null,
    2
  )
);
console.log("ok");
