import type { ReportSectionId } from "./intent.js";

/**
 * Reporting/aggregation status for a single user requirement.
 *
 * Derived deterministically from the supporting `Finding`s (and optional
 * locked judgement axes) — never an independent legal verdict.
 * `Finding` remains the single source of truth.
 */
export type RequirementStatus =
  | "strong"
  | "adequate"
  | "conditional"
  | "gap"
  | "covered"
  | "partial"
  | "missing"
  | "not_applicable"
  | "cannot_determine";

/** Legal coverage of the requirement — not evidence availability, not NLI. */
export type ComplianceStatus =
  | "present"
  | "partial"
  | "gap"
  | "insufficient_evidence"
  | "not_applicable";

export type EvidenceState =
  | "direct"
  | "incorporated"
  | "truncated"
  | "unavailable"
  | "conflicting"
  | "not_found";

/** Whether an annex/schedule pointer is a binding incorporation. */
export type ReferenceBinding = "binding" | "floating" | "none";

export type EvidenceConfidence = "high" | "medium" | "low";

export type DraftingQuality = "clean" | "could_be_clearer" | "operational_weakness";

export type MaterialityLevel = "low" | "medium" | "high";

/** Entailment of the hypothesis only. Never treated as compliance. */
export type NliLabel = "entailed" | "contradicted" | "not_mentioned";

export type RecommendationKind = "none" | "obtain" | "confirm" | "clarify" | "amend";

/**
 * Locked requirement-level judgement. NLI answers "does the text support the
 * hypothesis?"; compliance answers "does that satisfy the requirement?"
 */
export interface RequirementJudgement {
  compliance: ComplianceStatus;
  evidenceState: EvidenceState;
  referenceBinding: ReferenceBinding;
  evidenceConfidence: EvidenceConfidence;
  draftingQuality?: DraftingQuality;
  materiality: MaterialityLevel;
  nli?: NliLabel;
  recommendationKind: RecommendationKind;
}

/** Map legacy statuses to the 5-tier vocab; identity for already-canonical values. */
export function canonicalRequirementStatus(status: RequirementStatus): RequirementStatus {
  if (status === "covered") return "adequate";
  if (status === "partial") return "conditional";
  if (status === "missing") return "gap";
  return status;
}

export function isCoveredLike(status: RequirementStatus): boolean {
  return status === "strong" || status === "adequate" || status === "covered";
}

export function isConditionalLike(status: RequirementStatus): boolean {
  return status === "conditional" || status === "partial";
}

export function isGapLike(status: RequirementStatus): boolean {
  return status === "gap" || status === "missing";
}

export function isMaterialIssueStatus(status: RequirementStatus): boolean {
  return isGapLike(status) || isConditionalLike(status);
}

export function displayFromStatus(status: RequirementStatus): string {
  switch (canonicalRequirementStatus(status)) {
    case "strong":
      return "Strong";
    case "adequate":
      return "Present & adequate";
    case "conditional":
      return "Minor drafting gap";
    case "gap":
      return "Gap";
    case "not_applicable":
      return "Not applicable";
    case "cannot_determine":
      return "Cannot determine";
    default:
      return "Cannot determine";
  }
}

export function displayFromJudgement(judgement: RequirementJudgement): string {
  if (judgement.compliance === "not_applicable") return "Not applicable";
  // No related clause in the reviewed text — not a legal gap, just nothing to score.
  if (judgement.evidenceState === "not_found") return "Insufficient data";
  if (judgement.evidenceState === "truncated") return "Cannot determine";
  if (judgement.compliance === "insufficient_evidence") return "Cannot determine";

  if (judgement.compliance === "present") {
    if (
      (judgement.evidenceState === "incorporated" ||
        judgement.evidenceState === "unavailable") &&
      judgement.referenceBinding === "binding"
    ) {
      return "Present, particulars in schedule";
    }
    if (
      judgement.draftingQuality === "could_be_clearer" ||
      judgement.draftingQuality === "operational_weakness"
    ) {
      return "Minor drafting gap";
    }
    if (judgement.evidenceConfidence === "high" && judgement.draftingQuality === "clean") {
      return "Strong";
    }
    return "Present & adequate";
  }

  if (judgement.compliance === "partial") {
    // `truncated` / `not_found` already returned above (lines ~112-113) before
    // compliance is inspected, so only annex-pointer states can reach here.
    const evidentiary =
      judgement.evidenceState === "incorporated" ||
      judgement.evidenceState === "unavailable";
    if (evidentiary && judgement.referenceBinding === "binding") {
      return "Present, particulars in schedule";
    }
    if (evidentiary && judgement.referenceBinding !== "binding") {
      return "Cannot determine";
    }
    return "Minor drafting gap";
  }

  if (judgement.compliance === "gap") return "Gap";
  return "Cannot determine";
}

/**
 * User-facing Status cell. Pass a full assessment when axes are available so
 * annex pointers are not shown as Minor drafting gap.
 */
export function displayRequirementStatus(
  statusOrAssessment: RequirementStatus | Pick<RequirementAssessment, "status" | "judgement">
): string {
  if (typeof statusOrAssessment === "string") {
    return displayFromStatus(statusOrAssessment);
  }
  if (statusOrAssessment.judgement) {
    return displayFromJudgement(statusOrAssessment.judgement);
  }
  return displayFromStatus(statusOrAssessment.status);
}

export function statusFromJudgement(judgement: RequirementJudgement): RequirementStatus {
  if (judgement.compliance === "not_applicable") return "not_applicable";
  if (judgement.evidenceState === "truncated") return "cannot_determine";
  if (judgement.compliance === "insufficient_evidence") return "cannot_determine";
  if (judgement.compliance === "gap") return "gap";
  if (judgement.compliance === "partial") {
    if (
      (judgement.evidenceState === "incorporated" ||
        judgement.evidenceState === "unavailable") &&
      judgement.referenceBinding !== "binding"
    ) {
      return "cannot_determine";
    }
    return "conditional";
  }
  if (judgement.compliance === "present") {
    if (
      judgement.draftingQuality === "could_be_clearer" ||
      judgement.draftingQuality === "operational_weakness"
    ) {
      return "conditional";
    }
    if (judgement.evidenceConfidence === "high" && judgement.draftingQuality === "clean") {
      return "strong";
    }
    return "adequate";
  }
  return "cannot_determine";
}

export function recommendationKindFromAxes(
  judgement: Omit<RequirementJudgement, "recommendationKind">
): RecommendationKind {
  if (
    judgement.compliance === "insufficient_evidence" ||
    judgement.evidenceState === "truncated" ||
    judgement.evidenceState === "unavailable" ||
    judgement.evidenceState === "not_found" ||
    judgement.evidenceState === "conflicting"
  ) {
    return "obtain";
  }
  if (judgement.evidenceState === "incorporated") {
    return "obtain";
  }
  if (judgement.compliance === "gap") return "amend";
  if (judgement.compliance === "partial") {
    return judgement.draftingQuality === "could_be_clearer" ? "clarify" : "amend";
  }
  if (judgement.draftingQuality === "could_be_clearer") return "clarify";
  if (judgement.compliance === "not_applicable") return "none";
  return "none";
}

export function recommendationText(
  kind: RecommendationKind,
  gap?: string
): string | undefined {
  switch (kind) {
    case "obtain":
      return "Obtain or confirm the referenced materials or unread remainder of the clause. Do not amend the agreement from incomplete evidence.";
    case "confirm":
      return "Confirm the unread remainder of the clause or the incorporated schedule before treating this as a drafting defect.";
    case "clarify":
      return gap
        ? `Clarify the existing wording: ${gap}`
        : "Clarify the existing wording so the obligation is specific and verifiable.";
    case "amend":
      return gap ? `Address the gap: ${gap}` : "Amend the agreement to close the identified gap.";
    default:
      return undefined;
  }
}

export function withRecommendationKind(
  judgement: Omit<RequirementJudgement, "recommendationKind">
): RequirementJudgement {
  return {
    ...judgement,
    recommendationKind: recommendationKindFromAxes(judgement),
  };
}

/** `{ document, whyNeeded }` — only resolvable via an incorporated-but-unsupplied document. */
export interface AssessmentDependency {
  document: string;
  whyNeeded: string;
}

/** Below / meets / exceeds a stated standard, with the reason — not a bare pass/fail. */
export interface BaselineComparison {
  comparison: "below" | "meets" | "exceeds";
  reason: string;
}

/**
 * RequirementAssessment — canonical reporting object keyed by PLAN requirement.
 * `status` is a derived projection for older consumers; `judgement` is the
 * locked two-axis verdict the writer may explain but not change.
 */
export interface RequirementAssessment {
  requirementId: string;
  /** Request requirement whose composite analysis this native component belongs to. */
  componentOfRequirementId?: string;
  /** Ids of the authoritative Findings that support this assessment. */
  supportingFindingIds: string[];
  /** Human-readable one/two line summary for synthesis input. */
  summary: string;
  status: RequirementStatus;
  judgement?: RequirementJudgement;
  recommendation?: string;
  /** Optional hint for which report section this assessment belongs under. */
  reportSection?: ReportSectionId;
  /**
   * Enrichment fields (ACT-Phase 2) — VERIFY is the only stage that ever
   * reads the evidence, so it captures the rich reasoning behind a status
   * enum as structured data instead of discarding it. RENDER may only
   * rephrase/compose these; it cannot invent a claim, comparison, or
   * remediation VERIFY didn't establish (same discipline
   * `unsupported-inference.ts` already enforces for gap language).
   */
  /** What the evidence actually shows, in the verifier's own words. */
  establishedBy?: string;
  /** The specific delta between proof standard and what was found. */
  gapDescription?: string;
  /** Set when only resolvable via an incorporated-but-unsupplied document. */
  dependency?: AssessmentDependency;
  /** Below/meets/exceeds a stated standard, with reason — not bare pass/fail. */
  baselineComparison?: BaselineComparison;
  /** Drafting-quality observation in prose (e.g. "dispersed across several clauses"). */
  structuralNote?: string;
  /** The specific action that closes the gap, as an instruction — not "needs improvement". */
  remediation?: string;
}

/**
 * GroupedRequirementResult — the raw, per-requirement output of ONE grouped
 * evaluation LLM call. It is NOT persisted as truth: each result is translated
 * into Findings, then aggregated into a locked RequirementAssessment.
 */
export interface GroupedRequirementResult {
  requirementId: string;
  /** Legacy single-axis field; ignored when `compliance` is present. */
  status: RequirementStatus;
  compliance?: ComplianceStatus;
  evidenceState?: EvidenceState;
  referenceBinding?: ReferenceBinding;
  evidenceConfidence?: EvidenceConfidence;
  draftingQuality?: DraftingQuality;
  materiality?: MaterialityLevel;
  nli?: NliLabel;
  rationale: string;
  gap?: string;
  /** Ids/keys of the shared evidence spans this result relies on. */
  evidenceRefs: string[];
  recommendation?: string;
}
