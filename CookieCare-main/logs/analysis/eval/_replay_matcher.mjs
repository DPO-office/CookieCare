import fs from "fs";

const SUPPORT_SCORE_THRESHOLD = 2;

function signalTokens(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4);
}

function distinctivePhrases(text) {
  const out = [];
  const re = /[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){1,5}/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[0].toLowerCase());
  return out;
}

const F3 = {
  proofGuidance:
    "A DPIA / prior-consultation assistance clause (often bundled with 33-34 assistance).",
  nonProofTraps: [
    "A blanket 'assists with data protection obligations' clause with no DPIA scope.",
  ],
  distinctiveTokens: [
    "dpia",
    "impact assessment",
    "prior consultation",
    "article 35",
    "article 36",
    "data protection impact",
  ],
  requiredTokenGroups: [
    [
      "impact assessment",
      "dpia",
      "prior consultation",
      "consult",
      "article 35",
      "article 36",
    ],
    [
      "assist",
      "support",
      "provide",
      "cooperat",
      "help",
      "make available",
    ],
  ],
};

const G4 = {
  proofGuidance:
    "The 28(3)(g) closing proviso — retention only where required by law, with the residual data still subject to processor obligations.",
  distinctiveTokens: [
    "unless required by",
    "except as required by",
    "except to the extent required",
    "required by union or member state law",
    "otherwise required by law",
    "statutory retention",
    "required by applicable law to retain",
    "required to retain",
  ],
  requiredTokenGroups: [
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
  ],
};

const G1 = {
  proofGuidance:
    "A clause explicitly giving the controller the choice (e.g. 'at the Controller's option, delete or return').",
  distinctiveTokens: [
    "delete or return",
    "return or delete",
    "return and delete",
    "delete and return",
    "delete or destroy or return",
    "at the choice",
    "at the option",
    "controller's choice",
    "controller's option",
    "controller may elect",
    "as instructed by the controller",
    "as directed by the controller",
    "at the customer's option",
    "customer's choice",
  ],
  requiredTokenGroups: [],
};

function scoreItem(el, quotedText) {
  const hay = quotedText.toLowerCase();
  const distinctiveTokens = (el.distinctiveTokens ?? []).map((t) =>
    t.toLowerCase()
  );
  const requiredTokenGroups = (el.requiredTokenGroups ?? []).map((g) =>
    g.map((t) => t.toLowerCase())
  );
  const proofSignals = signalTokens(el.proofGuidance);
  if (
    distinctiveTokens.length > 0 &&
    !distinctiveTokens.some((tok) => hay.includes(tok))
  ) {
    return { rejected: "distinctive_gate", score: 0 };
  }
  if (
    requiredTokenGroups.length > 0 &&
    !requiredTokenGroups.every((group) =>
      group.some((tok) => hay.includes(tok))
    )
  ) {
    return { rejected: "required_groups", score: 0 };
  }
  let score = 0;
  const hitTokens = [];
  for (const tok of proofSignals) {
    if (hay.includes(tok)) {
      score += 1;
      hitTokens.push(tok);
    }
  }
  for (const phrase of distinctivePhrases(el.proofGuidance)) {
    if (hay.includes(phrase)) {
      score += 3;
      hitTokens.push(phrase);
    }
  }
  for (const tok of distinctiveTokens) {
    if (hay.includes(tok)) {
      score += 2;
      hitTokens.push(tok);
    }
  }
  return {
    rejected: null,
    score,
    hitTokens,
    supports: score >= SUPPORT_SCORE_THRESHOLD,
  };
}

const mc = fs
  .readFileSync(
    "logs/analysis/an_7d107bb4-4d03-4e4d-93d5-343457f3f598.compliance.log",
    "utf8"
  )
  .split(/\n/)
  .filter((l) => l.startsWith("{"))
  .map((l) => JSON.parse(l));
const bx = fs
  .readFileSync(
    "logs/analysis/an_5c929289-33e1-4303-abac-47779f4d5e91.compliance.log",
    "utf8"
  )
  .split(/\n/)
  .filter((l) => l.startsWith("{"))
  .map((l) => JSON.parse(l));

function bundle(ev, req) {
  return (
    ev.find(
      (e) =>
        e.event === "compliance.bundle.created" && e.requirementId === req
    )?.items || []
  );
}

function best(el, items) {
  const rows = items.map((i) => ({
    path: i.structuralPath,
    ...scoreItem(el, i.quotedText || ""),
    snippet: (i.quotedText || "").replace(/\s+/g, " ").slice(0, 160),
  }));
  const passed = rows.filter((r) => !r.rejected);
  const supported = rows.filter((r) => r.supports);
  return {
    itemCount: items.length,
    passedGate: passed.length,
    supportCount: supported.length,
    topPassed: passed
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((r) => ({
        path: r.path,
        score: r.score,
        hitTokens: r.hitTokens,
        snippet: r.snippet,
      })),
    rejectedSample: rows
      .filter((r) => r.rejected)
      .slice(0, 3)
      .map((r) => ({ path: r.path, rejected: r.rejected, snippet: r.snippet })),
    clause356: items
      .filter((i) => /3\.5\.6|clause-3\.5\.6/i.test(i.structuralPath || ""))
      .map((i) => scoreItem(el, i.quotedText || "")),
    clause25: items
      .filter((i) => i.structuralPath === "clause-2.5")
      .map((i) => ({
        ...scoreItem(el, i.quotedText || ""),
        fullHasProviso: /unless any applicable law requires storage/i.test(
          i.quotedText || ""
        ),
      })),
    clause355: items
      .filter((i) => i.structuralPath === "clause-3.5.5")
      .map((i) => scoreItem(el, i.quotedText || "")),
  };
}

const out = {
  bitrix_G4_on_g_bundle: best(G4, bundle(bx, "art28_3_g_deletion_return")),
  bitrix_G1_on_g_bundle: best(G1, bundle(bx, "art28_3_g_deletion_return")),
  mc_G1_on_g_bundle: best(G1, bundle(mc, "art28_3_g_deletion_return")),
  mc_G4_on_g_bundle: best(G4, bundle(mc, "art28_3_g_deletion_return")),
  mc_F3_on_f_bundle: best(F3, bundle(mc, "art28_3_f_security_assistance")),
};

fs.writeFileSync(
  "logs/analysis/eval/_replay_matcher.json",
  JSON.stringify(out, null, 2)
);
