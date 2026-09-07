import fs from "fs";
import { execSync } from "child_process";

const hay =
  "at mastercard's sole option, securely delete existing copies of the personal data or return the same".toLowerCase();
const g1 = [
  "delete or return",
  "return or delete",
  "return and delete",
  "delete and return",
  "at the choice",
  "at the option",
  "controller's choice",
  "controller's option",
  "controller may elect",
  "as instructed by the controller",
  "as directed by the controller",
  "at the customer's option",
  "customer's choice",
];
const out = {
  g1_hits: g1.filter((t) => hay.includes(t)),
  g1_hay: hay,
  g4_distinctive_hits: [
    "unless required by",
    "except as required by",
    "except to the extent required",
    "required by union or member state law",
    "otherwise required by law",
    "statutory retention",
    "required by applicable law to retain",
    "required to retain",
  ].filter((t) =>
    "unless any applicable law requires storage".includes(t)
  ),
  g4_groups_pass: [
    ["unless", "except", "save", "provided that", "to the extent"],
    [
      "retain",
      "retention",
      "store",
      "storage",
      "keep",
      "maintain",
      "hold",
      "preserve",
    ],
    [
      "law",
      "laws",
      "statute",
      "statutory",
      "regulation",
      "regulatory",
      "legal obligation",
      "member state",
      "union law",
      "applicable law",
    ],
  ].map((g) =>
    g.some((t) => "unless any applicable law requires storage".includes(t))
  ),
  f3_distinctive: [
    "dpia",
    "impact assessment",
    "prior consultation",
    "article 35",
    "article 36",
    "data protection impact",
  ].filter((t) =>
    "conducting data protection impact assessments and consultations".includes(
      t
    )
  ),
};

// list logs
const dir = "logs/analysis";
const logs = fs
  .readdirSync(dir)
  .filter((n) => n.endsWith(".compliance.log"))
  .map((n) => {
    const st = fs.statSync(`${dir}/${n}`);
    return { n, mtime: st.mtime.toISOString(), size: st.size };
  })
  .sort((a, b) => (a.mtime < b.mtime ? 1 : -1))
  .slice(0, 20);

fs.writeFileSync(
  "logs/analysis/eval/_core_problem_evidence.json",
  JSON.stringify({ gates: out, recentLogs: logs }, null, 2)
);
