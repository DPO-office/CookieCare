import type { ReportSectionId } from "./intent.js";

/**
 * Reporting/aggregation status for a single user requirement.
 *
 * Derived deterministically from the supporting `Finding`s — never an
 * independent legal verdict. `Finding` remains the single source of truth.
 */
export type RequirementStatus =
  | "covered"
  | "partial"
  | "missing"
  | "not_applicable"
  | "cannot_determine";

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
