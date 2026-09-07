import fs from "fs";

const LOG =
  "logs/analysis/an_ebde9e22-646d-4050-ba51-45760df5e49f.compliance.log";

const ev = fs
  .readFileSync(LOG, "utf8")
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

function classify() {
  const sample = ev
    .filter((e) => e.event === "compliance.bundle.created")
    .flatMap((e) => (e.items || []).slice(0, 2).map((i) => i.quotedText || ""))
    .join(" ");
  if (/Mastercard|3\.5\.6 Return and Deletion/i.test(sample)) return "mastercard";
  if (/Alaio|Bitrix/i.test(sample)) return "bitrix";
  return "unknown";
}

const attempts = ev.filter((e) => e.event === "compliance.lock.attempt");
const accepted = ev.filter((e) => e.event === "compliance.lock.accepted");
const rejected = ev.filter((e) => e.event === "compliance.lock.rejected");
const summary = ev.find((e) => e.event === "compliance.lock.summary");

const reasonHist = {};
for (const r of rejected) {
  for (const c of r.reasonCodes || []) {
    reasonHist[c] = (reasonHist[c] || 0) + 1;
  }
}

const verifyG = ev
  .filter(
    (e) =>
      e.event === "compliance.verify.element" &&
      e.requirementId === "art28_3_g_deletion_return"
  )
  .map((e) => `${e.elementId}=${e.state}`);
const verifyF = ev
  .filter(
    (e) =>
      e.event === "compliance.verify.element" &&
      e.requirementId === "art28_3_f_security_assistance"
  )
  .map((e) => `${e.elementId}=${e.state}`);

const assessG = ev.find(
  (e) =>
    e.event === "compliance.assess.result" &&
    e.requirementId === "art28_3_g_deletion_return"
);
const assessF = ev.find(
  (e) =>
    e.event === "compliance.assess.result" &&
    e.requirementId === "art28_3_f_security_assistance"
);

const out = {
  log: LOG,
  doc: classify(),
  analysisId: ev[0]?.analysisId,
  counts: {
    attempt: attempts.length,
    accepted: accepted.length,
    rejected: rejected.length,
    summary: summary ? 1 : 0,
  },
  attempts: attempts.map((a) => ({
    requirementId: a.requirementId,
    canonicalKey: a.canonicalKey,
    assessmentHash: a.assessmentHash,
  })),
  accepted: accepted.map((a) => ({
    requirementId: a.requirementId,
    lockedAssessmentId: a.lockedAssessmentId,
    assessmentHash: a.assessmentHash,
    documentHash: a.documentHash,
    ruleVersion: a.ruleVersion,
    status: a.status,
  })),
  rejected: rejected.map((r) => ({
    requirementId: r.requirementId,
    canonicalKey: r.canonicalKey,
    reasonCodes: r.reasonCodes,
    details: (r.details || []).slice(0, 8),
  })),
  reasonHist,
  summary: summary
    ? {
        attempted: summary.attempted,
        accepted: summary.accepted,
        rejected: summary.rejected,
        duplicateCanonicalKeys: summary.duplicateCanonicalKeys,
        plannedButNotAttempted: summary.plannedButNotAttempted,
      }
    : null,
  matrix: { verifyG, verifyF, assessG: assessG && {
    status: assessG.status,
    reasonCodes: assessG.reasonCodes,
    elementStates: assessG.elementStates,
  }, assessF: assessF && {
    status: assessF.status,
    reasonCodes: assessF.reasonCodes,
    elementStates: assessF.elementStates,
  }},
  fieldChecks: {
    attemptsHaveFields: attempts.every(
      (a) => a.requirementId && a.canonicalKey && a.assessmentHash
    ),
    acceptedHaveFields: accepted.every(
      (a) =>
        a.lockedAssessmentId &&
        a.assessmentHash &&
        a.documentHash &&
        a.ruleVersion &&
        a.status
    ),
    summaryCountsMatch:
      summary &&
      summary.attempted === attempts.length &&
      summary.accepted === accepted.length &&
      summary.rejected === rejected.length,
  },
};

fs.writeFileSync(
  "logs/analysis/eval/_mc_phase6_lock.json",
  JSON.stringify(out, null, 2)
);
