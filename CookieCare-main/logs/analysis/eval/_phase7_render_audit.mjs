import fs from "fs";
import path from "path";

const OUT = "logs/analysis/eval/_phase7_render_audit.json";

const STATUS_LABEL_MAP = {
  present: "Present",
  partial: "Partial",
  gap: "Gap",
  cannot_determine: "Cannot determine",
  not_applicable: "Not applicable",
  conflicting: "Conflicting",
  judgment_required: "Judgment required",
  verification_incomplete: "Verification incomplete",
};

const REQUIRED_ROW_FIELDS = [
  "requirementId",
  "canonicalKey",
  "lockedAssessmentId",
  "status",
  "statusLabel",
  "recommendedAction",
  "supportedElementIds",
  "missingElementIds",
  "evidenceSpanIds",
  "evidence",
  "whatTheDocumentProvides",
  "whatIsMissingOrUnclear",
  "whyItMatters",
  "conclusion",
  "ruleVersion",
  "documentHash",
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

function bundleQuoteIndex(ev) {
  const map = new Map();
  for (const e of ev.filter((x) => x.event === "compliance.bundle.created")) {
    for (const it of e.items || []) {
      if (it.spanId) map.set(it.spanId, it.quotedText || "");
    }
  }
  return map;
}

function audit(filePath, name) {
  const ev = load(filePath);
  const doc = classify(ev);
  const rows = ev.filter((e) => e.event === "compliance.render.row");
  const supplemental = ev.filter(
    (e) => e.event === "compliance.render.supplemental"
  );
  const bottomLines = ev.filter(
    (e) => e.event === "compliance.render.bottom_line"
  );
  const recon = ev.find(
    (e) => e.event === "compliance.render.reconciliation"
  );
  const locks = ev.filter((e) => e.event === "compliance.lock.accepted");
  const quotes = bundleQuoteIndex(ev);

  if (rows.length === 0 && !recon) {
    return { log: name, doc, hasPhase7: false };
  }

  const missingRowFields = [];
  for (const r of rows) {
    for (const f of REQUIRED_ROW_FIELDS) {
      if (!(f in r) || r[f] === undefined || r[f] === null) {
        missingRowFields.push(`${r.requirementId}.${f}`);
      }
    }
  }

  const statusLabelMismatches = rows
    .filter(
      (r) => STATUS_LABEL_MAP[r.status] && STATUS_LABEL_MAP[r.status] !== r.statusLabel
    )
    .map((r) => ({
      requirementId: r.requirementId,
      status: r.status,
      statusLabel: r.statusLabel,
      expected: STATUS_LABEL_MAP[r.status],
    }));

  const unknownStatuses = rows
    .filter((r) => !STATUS_LABEL_MAP[r.status])
    .map((r) => ({ requirementId: r.requirementId, status: r.status }));

  // Distinct labels + recommendedAction for key statuses present in this run
  const byStatus = {};
  for (const r of rows) {
    byStatus[r.status] = byStatus[r.status] || [];
    byStatus[r.status].push({
      requirementId: r.requirementId,
      statusLabel: r.statusLabel,
      recommendedAction: (r.recommendedAction || "").slice(0, 120),
    });
  }

  // Evidence locator + quote substring check
  let evidenceEntries = 0;
  let evidenceOk = 0;
  let evidenceBad = [];
  for (const r of rows) {
    for (const e of r.evidence || []) {
      evidenceEntries++;
      const hasLocator =
        e.structuralPath != null &&
        e.charRange != null &&
        typeof e.quote === "string" &&
        e.spanId &&
        e.documentId;
      const bundleText = quotes.get(e.spanId) || "";
      const quoteInBundle =
        !e.quote || bundleText.includes(e.quote) || bundleText.replace(/\s+/g, " ").includes((e.quote || "").replace(/\s+/g, " "));
      if (hasLocator && quoteInBundle) evidenceOk++;
      else
        evidenceBad.push({
          requirementId: r.requirementId,
          spanId: e.spanId,
          hasLocator,
          quoteInBundle,
          quoteLen: (e.quote || "").length,
        });
    }
  }

  const lockedFromAccept = locks.map((l) => l.lockedAssessmentId);
  const lockedFromRecon = recon?.lockedAssessmentIds || [];
  const renderedFromRecon = recon?.renderedAssessmentIds || [];
  const renderedFromRows = rows.map((r) => r.lockedAssessmentId);

  const bottomLineIds = bottomLines.flatMap(
    (b) => b.lockedAssessmentIds || []
  );
  const lockedSet = new Set(lockedFromRecon.length ? lockedFromRecon : lockedFromAccept);
  const bottomLineOutsideLock = bottomLineIds.filter((id) => !lockedSet.has(id));

  // Supplemental: open.p*
  const supplementalIds = supplemental.map(
    (s) => s.propositionId || s.requestId || s.id || s.userPropositionId
  );

  const acceptance = {
    noDuplicateRows: Array.isArray(recon?.duplicates) && recon.duplicates.length === 0,
    noRenderedWithoutLock:
      Array.isArray(recon?.missing) &&
      recon.missing.length === 0 &&
      renderedFromRecon.every((id) => lockedSet.has(id)),
    statusLabel1to1: statusLabelMismatches.length === 0 && unknownStatuses.length === 0,
    bottomLineRefsLocksOnly: bottomLineOutsideLock.length === 0,
    evidenceHasLocatorAndQuote:
      evidenceEntries === 0 || (evidenceBad.length === 0 && evidenceOk === evidenceEntries),
    reconCounts:
      recon &&
      recon.rowCount === rows.length &&
      recon.supplementalCount === supplemental.length &&
      recon.bottomLineClaimCount === bottomLines.length,
    rowCountEqualsAcceptedLocks: rows.length === locks.length,
    allRequiredRowFieldsPresent: missingRowFields.length === 0,
  };

  return {
    log: name,
    doc,
    analysisId: ev[0]?.analysisId,
    hasPhase7: true,
    counts: {
      rows: rows.length,
      supplemental: supplemental.length,
      bottomLines: bottomLines.length,
      reconciliation: recon ? 1 : 0,
      lockAccepted: locks.length,
    },
    rowSample: rows.slice(0, 2).map((r) => ({
      requirementId: r.requirementId,
      canonicalKey: r.canonicalKey,
      lockedAssessmentId: r.lockedAssessmentId,
      status: r.status,
      statusLabel: r.statusLabel,
      recommendedAction: (r.recommendedAction || "").slice(0, 100),
      supportedElementIds: r.supportedElementIds,
      missingElementIds: r.missingElementIds,
      evidenceCount: (r.evidence || []).length,
      evidenceSample: (r.evidence || [])[0]
        ? {
            spanId: r.evidence[0].spanId,
            structuralPath: r.evidence[0].structuralPath,
            charRange: r.evidence[0].charRange,
            documentId: r.evidence[0].documentId,
            quotePreview: (r.evidence[0].quote || "").slice(0, 80),
          }
        : null,
      hasNarrative: Boolean(
        r.whatTheDocumentProvides &&
          r.whatIsMissingOrUnclear &&
          r.whyItMatters &&
          r.conclusion
      ),
      ruleVersion: r.ruleVersion,
      documentHash: r.documentHash,
    })),
    statusBucketsInRows: byStatus,
    bottomLines: bottomLines.map((b) => ({
      status: b.status || b.bucket || b.statusLabel,
      statusLabel: b.statusLabel,
      claim: (b.claim || b.text || b.bottomLine || "").slice?.(0, 120) ?? b.claim,
      lockedAssessmentIds: b.lockedAssessmentIds,
      keys: Object.keys(b).filter(
        (k) => !["event", "analysisId", "timestamp", "implementationPhase"].includes(k)
      ),
    })),
    supplemental: supplemental.map((s) => ({
      keys: Object.keys(s).filter(
        (k) => !["event", "analysisId", "timestamp", "implementationPhase"].includes(k)
      ),
      propositionId:
        s.propositionId || s.requestId || s.id || s.userPropositionId || null,
      text: (s.text || s.proposition || s.label || "").slice?.(0, 100),
    })),
    reconciliation: recon
      ? {
          lockedAssessmentIds: recon.lockedAssessmentIds,
          renderedAssessmentIds: recon.renderedAssessmentIds,
          missing: recon.missing,
          duplicates: recon.duplicates,
          rowCount: recon.rowCount,
          supplementalCount: recon.supplementalCount,
          bottomLineClaimCount: recon.bottomLineClaimCount,
        }
      : null,
    checks: {
      missingRowFields: missingRowFields.slice(0, 20),
      statusLabelMismatches,
      unknownStatuses,
      evidenceEntries,
      evidenceOk,
      evidenceBad: evidenceBad.slice(0, 10),
      bottomLineOutsideLock,
      lockedFromAcceptCount: lockedFromAccept.length,
      renderedFromRowsCount: renderedFromRows.length,
    },
    acceptance,
  };
}

const dir = "logs/analysis";
const logs = fs
  .readdirSync(dir)
  .filter((n) => n.endsWith(".compliance.log"))
  .map((n) => {
    const p = path.join(dir, n);
    return { n, p, mtime: fs.statSync(p).mtimeMs };
  })
  .sort((a, b) => b.mtime - a.mtime);

const results = [];
for (const L of logs.slice(0, 20)) {
  const text = fs.readFileSync(L.p, "utf8");
  if (!/compliance\.render\./.test(text)) continue;
  results.push(audit(L.p, L.n));
  if (results.length >= 5) break;
}

// Also check code label map for distinct statuses
const src = fs.readFileSync(
  "backend/src/modules/analysis/capabilities/act/phase7-render.ts",
  "utf8"
);

fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      sessions: results,
      codeHasDistinctLabels: {
        cannot_determine: /cannot_determine:\s*"Cannot determine"/.test(src),
        gap: /gap:\s*"Gap"/.test(src),
        verification_incomplete:
          /verification_incomplete:\s*"Verification incomplete"/.test(src),
      },
      overall: {
        sessionCount: results.length,
        allPassCore: results
          .filter((r) => r.hasPhase7)
          .every(
            (r) =>
              r.acceptance.noDuplicateRows &&
              r.acceptance.noRenderedWithoutLock &&
              r.acceptance.statusLabel1to1 &&
              r.acceptance.bottomLineRefsLocksOnly &&
              r.acceptance.evidenceHasLocatorAndQuote &&
              r.acceptance.reconCounts
          ),
      },
    },
    null,
    2
  )
);
