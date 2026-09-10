import fs from "fs";
import path from "path";

const LOG_DIR = "logs/analysis";
const OUT = "logs/analysis/eval/_recheck_now.json";

function loadEvents(file) {
  return fs
    .readFileSync(file, "utf8")
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
}

function listLogs() {
  return fs
    .readdirSync(LOG_DIR)
    .filter((n) => n.endsWith(".compliance.log"))
    .map((n) => {
      const p = path.join(LOG_DIR, n);
      const st = fs.statSync(p);
      return { n, p, mtime: st.mtimeMs, mtimeIso: st.mtime.toISOString(), size: st.size };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function classify(ev) {
  const text = JSON.stringify(
    ev
      .filter((e) => e.event === "compliance.bundle.created")
      .slice(0, 3)
      .map((e) => (e.items || []).slice(0, 2).map((i) => i.quotedText || "").join(" "))
  );
  const isMc = /Mastercard|3\.5\.6 Return and Deletion/i.test(text);
  const isBx = /Alaio|Bitrix|Deletion on Term Expiry/i.test(text);
  return { isMc, isBx };
}

function verifyMap(ev, req) {
  return ev
    .filter(
      (e) =>
        e.event === "compliance.verify.element" && e.requirementId === req
    )
    .map((e) => ({ el: e.elementId, state: e.state }));
}

function assessOf(ev, req) {
  return ev
    .filter(
      (e) =>
        (e.event === "compliance.assess.requirement" ||
          e.event === "assess.requirement") &&
        e.requirementId === req
    )
    .map((e) => ({
      status: e.status,
      reasonCodes: e.reasonCodes || [],
    }));
}

function bundleItems(ev, req) {
  const b = ev.find(
    (e) => e.event === "compliance.bundle.created" && e.requirementId === req
  );
  return b?.items || [];
}

function norm(s) {
  return s.toLowerCase().replace(/\s+/g, " ");
}

function includesRaw(hay, tok) {
  return hay.toLowerCase().includes(tok.toLowerCase());
}
function includesNorm(hay, tok) {
  return norm(hay).includes(tok.toLowerCase());
}

const G4_DIST = [
  "unless required by",
  "except as required by",
  "except to the extent required",
  "required by union or member state law",
  "otherwise required by law",
  "statutory retention",
  "required by applicable law to retain",
  "required to retain",
];
const G4_GROUPS = [
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
];
const G1_DIST = [
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
  "sole option",
];
const F3_DIST = [
  "dpia",
  "impact assessment",
  "prior consultation",
  "article 35",
  "article 36",
  "data protection impact",
];

function gateReport(quoted, distinctive, groups) {
  const rawHits = distinctive.filter((t) => includesRaw(quoted, t));
  const normHits = distinctive.filter((t) => includesNorm(quoted, t));
  const groupsRaw =
    !groups || groups.length === 0
      ? null
      : groups.map((g) => g.some((t) => includesRaw(quoted, t)));
  const groupsNorm =
    !groups || groups.length === 0
      ? null
      : groups.map((g) => g.some((t) => includesNorm(quoted, t)));
  return {
    len: quoted.length,
    hasDoubleSpaceOrNL: /  |\n/.test(quoted),
    distinctiveRawHits: rawHits,
    distinctiveNormHits: normHits,
    distinctiveGateRawPass: distinctive.length === 0 || rawHits.length > 0,
    distinctiveGateNormPass: distinctive.length === 0 || normHits.length > 0,
    groupsRaw,
    groupsNorm,
    groupsRawPass: groupsRaw == null ? null : groupsRaw.every(Boolean),
    groupsNormPass: groupsNorm == null ? null : groupsNorm.every(Boolean),
    snippetNorm: norm(quoted).slice(0, 220),
  };
}

// Document ground truth from Downloads extract
const bxDocPath = path.resolve(
  "../..",
  "Users/abhinav.yadav_randst/Downloads/DPA-1-extracted.txt"
);
// workspace is CookieCare-main; Downloads is outside
const candidates = [
  "C:/Users/abhinav.yadav_randst/Downloads/DPA-1-extracted.txt",
  "logs/analysis/eval/_bitrix_dpa_full.txt",
];
let bxDoc = "";
for (const c of candidates) {
  if (fs.existsSync(c)) {
    bxDoc = fs.readFileSync(c, "utf8");
    break;
  }
}

const logs = listLogs();
let latestBx = null;
let latestMc = null;
for (const L of logs) {
  const ev = loadEvents(L.p);
  const { isMc, isBx } = classify(ev);
  if (!latestMc && isMc) latestMc = { ...L, ev };
  if (!latestBx && isBx && !isMc) latestBx = { ...L, ev };
  if (latestBx && latestMc) break;
}

function packageSession(label, sess) {
  if (!sess) return { label, missing: true };
  const ev = sess.ev;
  const gItems = bundleItems(ev, "art28_3_g_deletion_return");
  const fItems = bundleItems(ev, "art28_3_f_security_assistance");
  const find = (items, pred) => items.find((i) => pred(i));

  const c25 = find(gItems, (i) => i.structuralPath === "clause-2.5");
  const c356 = find(
    gItems,
    (i) =>
      i.structuralPath === "clause-3.5.6" ||
      /Return and Deletion/i.test(i.quotedText || "")
  );
  const c355 = find(
    fItems,
    (i) =>
      i.structuralPath === "clause-3.5.5" ||
      /impact\s+assess/i.test(i.quotedText || "")
  );

  return {
    label,
    log: sess.n,
    mtime: sess.mtimeIso,
    verifyG: verifyMap(ev, "art28_3_g_deletion_return"),
    verifyF: verifyMap(ev, "art28_3_f_security_assistance"),
    assessG: assessOf(ev, "art28_3_g_deletion_return"),
    assessF: assessOf(ev, "art28_3_f_security_assistance"),
    bundle: {
      gCount: gItems.length,
      fCount: fItems.length,
      has_clause_2_5: !!c25,
      has_clause_3_5_6: !!c356,
      has_clause_3_5_5_or_dpia: !!c355,
    },
    gates: {
      bitrix_G4_on_2_5: c25
        ? gateReport(c25.quotedText || "", G4_DIST, G4_GROUPS)
        : null,
      mc_G1_on_3_5_6: c356
        ? gateReport(c356.quotedText || "", G1_DIST, null)
        : null,
      mc_G4_on_3_5_6: c356
        ? gateReport(c356.quotedText || "", G4_DIST, G4_GROUPS)
        : null,
      mc_F3_on_3_5_5: c355
        ? gateReport(c355.quotedText || "", F3_DIST, [
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
          ])
        : null,
    },
  };
}

const docTruth = {
  bitrix_source: bxDoc
    ? {
        g4_proviso_in_doc: /unless any applicable law requires storage/i.test(
          bxDoc
        ),
        g2_delete_in_doc: /Deletion on Term Expiry/i.test(bxDoc),
        g1_chooser_hits: (
          bxDoc.match(
            /at the (choice|option)|delete or return|return or delete|sole option/i
          ) || []
        ).length,
        g3_return_obligation_hits: (
          bxDoc.match(
            /shall return|must return|return all personal data|return the personal data/i
          ) || []
        ).length,
        f3_dpia_in_doc: /DATA PROTECTION IMPACT ASSESSMENT/i.test(bxDoc),
        g4_quote: (() => {
          const m = bxDoc.match(
            /unless any applicable law requires storage[\s\S]{0,20}/i
          );
          return m ? m[0].replace(/\s+/g, " ") : null;
        })(),
      }
    : { missingDocExtract: true },
};

const out = {
  checkedAt: new Date().toISOString(),
  docTruth,
  latestBitrix: packageSession("bitrix", latestBx),
  latestMastercard: packageSession("mastercard", latestMc),
  verdict: null,
};

// Build verdict table
function stateOf(arr, el) {
  return (arr || []).find((x) => x.el === el)?.state || null;
}

const bx = out.latestBitrix;
const mc = out.latestMastercard;
out.verdict = {
  bitrix: [
    {
      el: "G1",
      matrix: stateOf(bx.verifyG, "G1"),
      inDoc: false,
      ok: stateOf(bx.verifyG, "G1") === "not_located",
    },
    {
      el: "G2",
      matrix: stateOf(bx.verifyG, "G2"),
      inDoc: true,
      ok: stateOf(bx.verifyG, "G2") === "supported",
    },
    {
      el: "G3",
      matrix: stateOf(bx.verifyG, "G3"),
      inDoc: false,
      ok: stateOf(bx.verifyG, "G3") === "not_located",
    },
    {
      el: "G4",
      matrix: stateOf(bx.verifyG, "G4"),
      inDoc: true,
      ok: stateOf(bx.verifyG, "G4") === "supported",
      note: "FALSE MISS if not_located",
    },
  ],
  mastercard: [
    {
      el: "G1",
      matrix: stateOf(mc.verifyG, "G1"),
      inDoc: true,
      ok: stateOf(mc.verifyG, "G1") === "supported",
      note: "FALSE MISS if not_located",
    },
    {
      el: "G2",
      matrix: stateOf(mc.verifyG, "G2"),
      inDoc: true,
      ok: stateOf(mc.verifyG, "G2") === "supported",
    },
    {
      el: "G3",
      matrix: stateOf(mc.verifyG, "G3"),
      inDoc: true,
      ok: stateOf(mc.verifyG, "G3") === "supported",
    },
    {
      el: "G4",
      matrix: stateOf(mc.verifyG, "G4"),
      inDoc: true,
      ok: stateOf(mc.verifyG, "G4") === "supported",
      note: "FALSE MISS / cascade if not supported",
    },
    {
      el: "F3",
      matrix: stateOf(mc.verifyF, "F3"),
      inDoc: true,
      ok: stateOf(mc.verifyF, "F3") === "supported",
      note: "FALSE MISS if not_located",
    },
  ],
};

out.summary = {
  bitrixFalseMisses: out.verdict.bitrix.filter((r) => !r.ok),
  mastercardFalseMisses: out.verdict.mastercard.filter((r) => !r.ok),
  diagnosisStillHolds:
    out.verdict.bitrix.some((r) => r.el === "G4" && !r.ok) ||
    out.verdict.mastercard.some((r) => !r.ok),
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log("wrote", OUT);
