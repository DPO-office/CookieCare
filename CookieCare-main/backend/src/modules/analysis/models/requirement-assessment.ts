import type { ReportSectionId } from "./intent.js";

/**
 * Reporting/aggregation status for a single user requirement.
 *
 * Derived deterministically from the supporting `Finding`s — never an
 * independent legal verdict. `Finding` remains the single source of truth.
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

/**
 * User-facing Status cell. Internal enums stay on RequirementAssessment.status.
 * Cannot determine is only for truly empty/unreadable extracts — not annex pointers.
 */
export function displayRequirementStatus(status: RequirementStatus): string {
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

/**
 * RequirementAssessment — a reporting view over Findings, keyed by the PLAN
 * requirement it answers. It links to the authoritative Findings via
 * `supportingFindingIds` and never stores a competing verdict.
 */
export interface RequirementAssessment {
  requirementId: string;
  /** Ids of the authoritative Findings that support this assessment. */
  supportingFindingIds: string[];
  /** Human-readable one/two line summary for synthesis input. */
  summary: string;
  status: RequirementStatus;
  recommendation?: string;
  /** Optional hint for which report section this assessment belongs under. */
  reportSection?: ReportSectionId;
}

/**
 * GroupedRequirementResult — the raw, per-requirement output of ONE grouped
 * evaluation LLM call. It is NOT persisted as truth: each result is translated
 * into the existing Finding architecture, and CRITIQUE verifies each one
 * independently against its supporting evidence.
 */
export interface GroupedRequirementResult {
  requirementId: string;
  status: RequirementStatus;
  rationale: string;
  gap?: string;
  /** Ids/keys of the shared evidence spans this result relies on. */
  evidenceRefs: string[];
  recommendation?: string;
}
