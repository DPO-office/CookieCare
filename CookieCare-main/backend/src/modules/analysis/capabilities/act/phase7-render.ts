/**
 * PHASE 7 — locked-only rendering (side-channel).
 *
 * Turns Phase 6's `LockedAssessment` decisions into rendered rows for the
 * requirement matrix, plus a bottom-line synthesis fragment. Live rendering
 * (`renderOutput` etc.) is untouched — this module produces the events the
 * plan §Phase 7 Required logs specify so a reviewer can compare the locked-
 * only projection against today's output before Phase 8 swaps them.
 *
 * Invariants (plan §Phase 7 Implementation):
 *   1. Matrix reads ONLY from accepted LockedAssessment ids (rejected locks
 *      never become rows).
 *   2. One canonical requirement → exactly one row.
 *   3. Evidence per row: canonical structural locator + exact quote.
 *   4. `cannot_determine`, `gap`, `verification_incomplete` render with
 *      distinct labels and distinct recommended actions.
 *   5. Unmatched user-request propositions land in a separate section.
 *   6. Bottom-line synthesis references locked assessment ids only; every
 *      claim carries at least one lockedAssessmentId anchor.
 */

import type { AssessmentResult } from "./phase5-assess.js";
import type { ExplanationDraft } from "./phase5-assess.js";
import type { RequirementMatrix } from "./phase4-verify.js";
import type { Phase3Bundle } from "./phase3-investigate.js";
import type { RequirementElementSchema } from "./element-schemas.js";

export type RenderedStatusLabel =
  | "Present"
  | "Partial"
  | "Gap"
  | "Cannot determine"
  | "Not applicable"
  | "Conflicting"
  | "Judgment required"
  | "Verification incomplete";

const STATUS_LABELS: Record<AssessmentResult["status"], RenderedStatusLabel> = {
  present: "Present",
  partial: "Partial",
  gap: "Gap",
  cannot_determine: "Cannot determine",
  not_applicable: "Not applicable",
  conflicting: "Conflicting",
  judgment_required: "Judgment required",
  verification_incomplete: "Verification incomplete",
};

const STATUS_ACTIONS: Record<AssessmentResult["status"], string> = {
  present: "None — obligation satisfied.",
  partial:
    "Amend contract to address the missing / narrower elements identified below.",
  gap: "Add the required clause — the obligation is not present in the reviewed scope.",
  cannot_determine:
    "Obtain the missing referenced material (annex, schedule, or same-document dependency) before concluding.",
  not_applicable: "None — obligation is out of scope for this arrangement.",
  conflicting:
    "Reconcile the conflicting provisions before relying on either.",
  judgment_required:
    "Escalate to counsel — the deterministic rule cannot resolve this without contextual judgment.",
  verification_incomplete:
    "Re-run analysis — technical verification did not return a valid element matrix.",
};

export interface RenderedEvidence {
  spanId: string;
  quote: string;
  structuralPath: string;
  charRange: [number, number];
  documentId?: string;
}

export interface RenderedRow {
  rowId: string;
  requirementId: string;
  canonicalKey: string;
  lockedAssessmentId: string;
  legalCitation: string;
  title: string;
  status: AssessmentResult["status"];
  statusLabel: RenderedStatusLabel;
  recommendedAction: string;
  supportedElementIds: string[];
  missingElementIds: string[];
  evidence: RenderedEvidence[];
  whatTheDocumentProvides: string;
  whatIsMissingOrUnclear: string;
  whyItMatters: string;
  conclusion: string;
  ruleVersion: string;
  documentHash: string;
}

export interface SupplementalRequestRow {
  requestId: string;
  reason: string;
  requirementType?: string;
}

export interface BottomLineClaim {
  claim: string;
  lockedAssessmentIds: string[];
}

export interface RenderedReport {
  rows: RenderedRow[];
  supplementalRequests: SupplementalRequestRow[];
  bottomLine: BottomLineClaim[];
  reconciliation: {
    lockedAssessmentIds: string[];
    renderedAssessmentIds: string[];
    missing: string[];
    duplicates: string[];
  };
}

export interface Phase7Input {
  accepted: Array<{
    requirementId: string;
    canonicalKey: string;
    lockedAssessmentId: string;
    documentHash: string;
    ruleVersion: string;
    assessment: AssessmentResult;
    explanation: ExplanationDraft;
    matrix: RequirementMatrix;
    bundle: Phase3Bundle;
    schema: RequirementElementSchema;
  }>;
  supplementalRequests: SupplementalRequestRow[];
}

export function renderLockedOnly(input: Phase7Input): RenderedReport {
  // Enforce one canonical row per canonical key. Prefer the row whose status
  // is the most-informative (present/partial/gap over not_applicable) when a
  // duplicate somehow reaches this point.
  const byCanonical = new Map<string, Phase7Input["accepted"][number]>();
  const duplicates: string[] = [];
  for (const a of input.accepted) {
    const existing = byCanonical.get(a.canonicalKey);
    if (!existing) {
      byCanonical.set(a.canonicalKey, a);
      continue;
    }
    duplicates.push(a.canonicalKey);
    if (statusRank(a.assessment.status) > statusRank(existing.assessment.status)) {
      byCanonical.set(a.canonicalKey, a);
    }
  }

  const rows: RenderedRow[] = [];
  for (const a of byCanonical.values()) {
    rows.push(buildRow(a));
  }

  const lockedAssessmentIds = input.accepted.map((a) => a.lockedAssessmentId);
  const renderedAssessmentIds = rows.map((r) => r.lockedAssessmentId);
  const missing = lockedAssessmentIds.filter(
    (id) => !renderedAssessmentIds.includes(id)
  );

  const bottomLine = buildBottomLine(rows);

  return {
    rows,
    supplementalRequests: input.supplementalRequests,
    bottomLine,
    reconciliation: {
      lockedAssessmentIds,
      renderedAssessmentIds,
      missing,
      duplicates: [...new Set(duplicates)],
    },
  };
}

function statusRank(s: AssessmentResult["status"]): number {
  switch (s) {
    case "present":
      return 6;
    case "partial":
      return 5;
    case "gap":
      return 4;
    case "cannot_determine":
      return 3;
    case "conflicting":
      return 3;
    case "verification_incomplete":
      return 2;
    case "judgment_required":
      return 2;
    case "not_applicable":
      return 1;
  }
}

function buildRow(
  a: Phase7Input["accepted"][number]
): RenderedRow {
  const evidence: RenderedEvidence[] = [];
  const seenSpanIds = new Set<string>();
  // Evidence must come from the matrix's supported elements only, and every
  // quote must resolve to a bundle item's exact substring (Phase 6 already
  // verified this; we just carry it through).
  const supported = a.matrix.elements.filter((e) => e.state === "supported");
  const bundleItemById = new Map(a.bundle.items.map((i) => [i.spanId, i]));
  for (const el of supported) {
    for (const q of el.quotes) {
      if (seenSpanIds.has(q.spanId)) continue;
      const item = bundleItemById.get(q.spanId);
      if (!item) continue; // impossible after lock, defensive
      // Never mix scopes on a rendered row's evidence — the lock rejects that,
      // so any span we see here is already scope-compatible with the row.
      seenSpanIds.add(q.spanId);
      evidence.push({
        spanId: q.spanId,
        quote: q.quote,
        structuralPath: item.structuralPath,
        charRange: q.charRange,
        documentId: item.scope?.documentId,
      });
    }
  }

  return {
    rowId: `R-${a.canonicalKey}`,
    requirementId: a.requirementId,
    canonicalKey: a.canonicalKey,
    lockedAssessmentId: a.lockedAssessmentId,
    legalCitation: a.schema.legalCitation,
    title: a.schema.title,
    status: a.assessment.status,
    statusLabel: STATUS_LABELS[a.assessment.status],
    recommendedAction: renderedActionFor(a.assessment.status, a.explanation),
    supportedElementIds: a.explanation.supportedElementIds,
    missingElementIds: a.explanation.missingElementIds,
    evidence,
    whatTheDocumentProvides: a.explanation.whatTheDocumentProvides,
    whatIsMissingOrUnclear: a.explanation.whatIsMissingOrUnclear,
    whyItMatters: a.explanation.whyItMatters,
    conclusion: a.explanation.conclusion,
    ruleVersion: a.ruleVersion,
    documentHash: a.documentHash,
  };
}

function renderedActionFor(
  status: AssessmentResult["status"],
  explanation: ExplanationDraft
): string {
  // Prefer the explanation-authored recommendation when present; fall back to
  // the status's canonical action text so the label and action stay in sync
  // even if the explanation is empty.
  const authored = explanation.recommendedAction?.trim();
  if (authored && authored !== "No remedial action indicated by the current matrix.") {
    return authored;
  }
  return STATUS_ACTIONS[status];
}

function buildBottomLine(rows: RenderedRow[]): BottomLineClaim[] {
  const claims: BottomLineClaim[] = [];
  const byStatus = new Map<AssessmentResult["status"], RenderedRow[]>();
  for (const r of rows) {
    const list = byStatus.get(r.status) ?? [];
    list.push(r);
    byStatus.set(r.status, list);
  }
  const push = (
    status: AssessmentResult["status"],
    template: (rs: RenderedRow[]) => string
  ) => {
    const list = byStatus.get(status);
    if (!list || list.length === 0) return;
    claims.push({
      claim: template(list),
      lockedAssessmentIds: list.map((r) => r.lockedAssessmentId),
    });
  };
  push(
    "present",
    (rs) =>
      `${rs.length} obligation${rs.length === 1 ? "" : "s"} present: ${rs.map((r) => r.title).join("; ")}.`
  );
  push(
    "partial",
    (rs) =>
      `${rs.length} obligation${rs.length === 1 ? "" : "s"} partially met — remediation required: ${rs.map((r) => r.title).join("; ")}.`
  );
  push(
    "gap",
    (rs) =>
      `${rs.length} gap${rs.length === 1 ? "" : "s"} — obligation${rs.length === 1 ? "" : "s"} not present: ${rs.map((r) => r.title).join("; ")}.`
  );
  push(
    "cannot_determine",
    (rs) =>
      `${rs.length} obligation${rs.length === 1 ? "" : "s"} could not be determined without further material: ${rs.map((r) => r.title).join("; ")}.`
  );
  push(
    "conflicting",
    (rs) =>
      `${rs.length} obligation${rs.length === 1 ? "" : "s"} shows conflicting evidence in scope: ${rs.map((r) => r.title).join("; ")}.`
  );
  push(
    "judgment_required",
    (rs) =>
      `${rs.length} obligation${rs.length === 1 ? "" : "s"} require${rs.length === 1 ? "s" : ""} legal judgment beyond the deterministic rule: ${rs.map((r) => r.title).join("; ")}.`
  );
  push(
    "verification_incomplete",
    (rs) =>
      `${rs.length} obligation${rs.length === 1 ? "" : "s"} could not be verified — re-run required: ${rs.map((r) => r.title).join("; ")}.`
  );
  return claims;
}
