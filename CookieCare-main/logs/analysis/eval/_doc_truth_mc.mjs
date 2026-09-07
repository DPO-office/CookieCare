import fs from "fs";

const f =
  "logs/analysis/an_7d107bb4-4d03-4e4d-93d5-343457f3f598.compliance.log";
const events = fs
  .readFileSync(f, "utf8")
  .split(/\n/)
  .filter((l) => l.startsWith("{"))
  .map((l) => JSON.parse(l));

function allQuotes(req) {
  const b = events.find(
    (e) => e.event === "compliance.bundle.created" && e.requirementId === req
  );
  return (b?.items || []).map((i) => ({
    path: i.structuralPath,
    q: (i.quotedText || "").replace(/\s+/g, " "),
  }));
}

function search(items, re) {
  return items
    .filter((i) => re.test(i.path + " " + i.q))
    .map((i) => ({ path: i.path, q: i.q.slice(0, 280) }));
}

const g = allQuotes("art28_3_g_deletion_return");
const ff = allQuotes("art28_3_f_security_assistance");

// Also reconstruct: pull EVERY item quote mentioning 3.5.6 from any bundle
const allItems = events
  .filter((e) => e.event === "compliance.bundle.created")
  .flatMap((e) =>
    (e.items || []).map((i) => ({
      req: e.requirementId,
      path: i.structuralPath,
      q: (i.quotedText || "").replace(/\s+/g, " "),
    }))
  );

const clause356 = allItems.filter((i) =>
  /3\.5\.6|Return and Deletion/i.test(i.path + " " + i.q)
);
// unique by quote start
const seen = new Set();
const unique356 = [];
for (const i of clause356) {
  const k = i.q.slice(0, 100);
  if (seen.has(k)) continue;
  seen.add(k);
  unique356.push(i);
}

const out = {
  g_bundle_n: g.length,
  g_returnish: search(g, /return|export|hand over|provide a copy/i).slice(0, 8),
  g_retentionish: search(
    g,
    /unless|retain|storage|applicable law|member state|union law/i
  ).slice(0, 10),
  g_chooserish: search(
    g,
    /choice|option|return and delete|delete and return|or delete|directed by/i
  ).slice(0, 8),
  f_dpiaish: search(
    ff,
    /dpia|impact assessment|prior consultation|article 35|article 36|assist/i
  ).slice(0, 12),
  unique_3_5_6_quotes: unique356.slice(0, 5),
};

fs.writeFileSync(
  "logs/analysis/eval/_doc_truth_mc_from_bundles.json",
  JSON.stringify(out, null, 2)
);

// Simulate G4 groups on Bitrix 2.5 sentence
const sentence =
  "Alaio will comply with this instruction as soon as reasonably practicable and within a maximum period of 90 days, unless any applicable law requires storage.";
const g1 = [/unless/, /except/, /save/, /provided that/, /to the extent/];
const g2 = [/retain/, /retention/, /store/, /storage/, /keep/, /maintain/, /hold/, /preserve/];
const g3 = [/law/, /statute/, /regulation/, /legal obligation/, /member state/, /union law/, /applicable law/];
function groupHit(s, group) {
  const low = s.toLowerCase();
  return group.some((re) => re.test(low));
}
fs.writeFileSync(
  "logs/analysis/eval/_g4_simulate_bitrix.json",
  JSON.stringify(
    {
      sentence,
      group1_exception: groupHit(sentence, g1),
      group2_retention: groupHit(sentence, g2),
      group3_legal: groupHit(sentence, g3),
      wouldPassG4groups: groupHit(sentence, g1) && groupHit(sentence, g2) && groupHit(sentence, g3),
    },
    null,
    2
  )
);
console.log("ok");
