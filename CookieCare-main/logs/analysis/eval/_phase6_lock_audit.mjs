import fs from "fs";
import path from "path";

const dir = "logs/analysis";
const outPath = "logs/analysis/eval/_phase6_lock_audit.json";

const EXPECTED_REASON_CODES = [
  "CANONICAL_KEY_MISSING",
  "SCHEMA_VERSION_MISSING",
  "DUPLICATE_CANONICAL_ASSESSMENT",
  "ELEMENT_STATE_INVALID",
  "ELEMENT_STATE_MISSING",
  "EVIDENCE_ID_NOT_IN_BUNDLE",
  "QUOTE_NOT_VERIFIED",
  "INCOMPATIBLE_SCOPE_JOINT_SUPPORT",
  "UNRESOLVED_INTERNAL_REFERENCE",
  "GAP_WITHOUT_COMPLETENESS_BASIS",
  "STATUS_AGGREGATION_MISMATCH",
  "EXPLANATION_STATUS_MISMATCH",
  "EXPLANATION_SUPPORTED_MISMATCH",
  "EXPLANATION_MISSING_MISMATCH",
  "REMEDIATION_MISALIGNED",
  "DOCUMENT_HASH_MISSING",
  "RULE_VERSION_MISSING",
];

function load(file) {
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

function classify(ev) {
  const sample = ev
    .filter((e) => e.event === "compliance.bundle.created")
    .flatMap((e) => (e.items || []).slice(0, 3).map((i) => i.quotedText || ""))
    .join(" ");
  if (/Mastercard|3\.5\.6 Return and Deletion/i.test(sample)) return "mastercard";
  if (/Alaio|Bitrix|Deletion on Term Expiry/i.test(sample)) return "bitrix";
  return "unknown";
}

const logs = fs
  .readdirSync(dir)
  .filter((n) => n.endsWith(".compliance.log"))
  .map((n) => {
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    return { n, p, mtime: st.mtimeMs, iso: st.mtime.toISOString() };
  })
  .sort((a, b) => b.mtime - a.mtime);

const withLock = [];
for (const L of logs.slice(0, 25)) {
  const text = fs.readFileSync(L.p, "utf8");
  if (!/compliance\.lock\./.test(text)) continue;
  const ev = load(L.p);
  const attempts = ev.filter((e) => e.event === "compliance.lock.attempt");
  const accepted = ev.filter((e) => e.event === "compliance.lock.accepted");
  const rejected = ev.filter((e) => e.event === "compliance.lock.rejected");
  const summaries = ev.filter((e) => e.event === "compliance.lock.summary");

  const reasonCodeHist = {};
  for (const r of rejected) {
    for (const c of r.reasonCodes || []) {
      reasonCodeHist[c] = (reasonCodeHist[c] || 0) + 1;
    }
  }

  const attemptFields = attempts.slice(0, 3).map((a) => ({
    requirementId: a.requirementId,
    canonicalKey: a.canonicalKey,
    assessmentHash: a.assessmentHash,
    keys: Object.keys(a).filter(
      (k) =>
        ![
          "event",
          "analysisId",
          "timestamp",
          "implementationPhase",
        ].includes(k)
    ),
  }));

  const acceptedSample = accepted.slice(0, 3).map((a) => ({
    requirementId: a.requirementId,
    lockedAssessmentId: a.lockedAssessmentId,
    assessmentHash: a.assessmentHash,
    documentHash: a.documentHash,
    ruleVersion: a.ruleVersion,
    status: a.status,
  }));

  const rejectedSample = rejected.slice(0, 8).map((r) => ({
    requirementId: r.requirementId,
    canonicalKey: r.canonicalKey,
    reasonCodes: r.reasonCodes,
    details: (r.details || []).slice(0, 5),
  }));

  const summary = summaries[0]
    ? {
        attempted: summaries[0].attempted,
        accepted: summaries[0].accepted,
        rejected: summaries[0].rejected,
        duplicateCanonicalKeys: summaries[0].duplicateCanonicalKeys,
        plannedButNotAttempted: summaries[0].plannedButNotAttempted,
        rawKeys: Object.keys(summaries[0]),
      }
    : null;

  // Also check Phase 5 still present (side-channel) and no obvious live wiring marker
  const phases = [
    ...new Set(ev.map((e) => e.implementationPhase).filter(Boolean)),
  ];
  const eventTypes = [...new Set(ev.map((e) => e.event))].filter((e) =>
    e.startsWith("compliance.lock")
  );

  withLock.push({
    log: L.n,
    iso: L.iso,
    doc: classify(ev),
    analysisId: ev[0]?.analysisId,
    implementationPhases: phases,
    lockEventTypes: eventTypes,
    counts: {
      attempt: attempts.length,
      accepted: accepted.length,
      rejected: rejected.length,
      summary: summaries.length,
    },
    attemptFields,
    acceptedSample,
    rejectedSample,
    reasonCodeHist,
    summary,
    acceptanceChecks: {
      hasAttemptPerAcceptedOrRejected:
        attempts.length === accepted.length + rejected.length ||
        attempts.length >= accepted.length,
      hasExactlyOneSummary: summaries.length === 1,
      summaryCountsMatch:
        summary &&
        summary.attempted === attempts.length &&
        summary.accepted === accepted.length &&
        summary.rejected === rejected.length,
      allAttemptsHaveCanonicalAndHash: attempts.every(
        (a) => a.canonicalKey && a.assessmentHash
      ),
      allAcceptedHaveDocHashAndRuleVersion: accepted.every(
        (a) => a.documentHash && a.ruleVersion && a.lockedAssessmentId && a.status
      ),
      plannedButNotAttemptedIsArray: Array.isArray(
        summary?.plannedButNotAttempted
      ),
      duplicateCanonicalKeysIsArray: Array.isArray(
        summary?.duplicateCanonicalKeys
      ),
    },
  });
}

// Unit/fixture presence for deliberate injection tests
const phase6Path = "backend/src/modules/analysis/capabilities/act/phase6-lock.ts";
const phase6Src = fs.existsSync(phase6Path)
  ? fs.readFileSync(phase6Path, "utf8")
  : "";
const hasQuoteGate = /QUOTE_NOT_VERIFIED/.test(phase6Src);
const hasDupGate = /DUPLICATE_CANONICAL_ASSESSMENT/.test(phase6Src);
const hasExplGate = /EXPLANATION_STATUS_MISMATCH/.test(phase6Src);

const out = {
  checkedAt: new Date().toISOString(),
  sessionsWithLock: withLock,
  codeGatesPresent: {
    QUOTE_NOT_VERIFIED: hasQuoteGate,
    DUPLICATE_CANONICAL_ASSESSMENT: hasDupGate,
    EXPLANATION_STATUS_MISMATCH: hasExplGate,
    gateReasonCodesFoundInSource: EXPECTED_REASON_CODES.filter((c) =>
      phase6Src.includes(c)
    ),
    gateReasonCodesMissingInSource: EXPECTED_REASON_CODES.filter(
      (c) => !phase6Src.includes(c)
    ),
  },
  overall: {
    sessionCount: withLock.length,
    anyRejected: withLock.some((s) => s.counts.rejected > 0),
    allHaveSummary: withLock.every((s) => s.counts.summary === 1),
  },
};

fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log("wrote", outPath, "sessions", withLock.length);
