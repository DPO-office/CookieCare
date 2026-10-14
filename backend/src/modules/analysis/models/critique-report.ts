import type { WorkUnitOutcome } from "./work-unit-outcome.js";

/** One deterministic or semantic validation issue/result. */
export interface CritiqueIssue {
  itemId: string;
  status: "pass" | "fail" | "missing" | "ambiguous";
  evidenceQuote?: string;
  evidenceVerified: boolean;
  findingId?: string;
  workUnitId?: string;
  detail?: string;
}

/** @deprecated Compatibility alias; prefer CritiqueIssue for individual checks. */
export type CritiqueResult = CritiqueIssue;

export interface FixItem {
  workUnitId: string;
  instruction: string;
  sourceItemId: string;
  /** Narrow a grouped evaluation retry to one requirement when possible. */
  requirementId?: string;
  findingId?: string;
  previousAttemptFeedback?: string;
  attemptNumber?: number;
  /** Narrow a render retry to specific finalized outline/section ids. */
  retrySectionIds?: string[];
}

export type CritiqueTargetReason =
  | "weak_evidence"
  | "conflicting_evidence"
  | "low_confidence"
  | "high_materiality"
  | "internal_inconsistency"
  | "explicit_rigor_request";

/** Smallest useful semantic-verification target. */
export interface CritiqueTarget {
  requirementId?: string;
  findingId?: string;
  workUnitId: string;
  evidencePackageId?: string;
  reason: CritiqueTargetReason;
  instruction?: string;
}

export interface DeepCritiqueResult {
  targetId: string;
  verdict:
    | "supported"
    | "unsupported"
    | "partially_supported"
    | "insufficient_evidence";
  explanation: string;
  conflictingEvidence?: string[];
  recommendedAction:
    | "keep"
    | "retry_evidence"
    | "retry_evaluation"
    | "mark_uncertain";
}

export interface CritiqueMetrics {
  critiqueLiteMs: number;
  deepCritiqueMs: number;
  deepCritiqueTriggered: boolean;
  deepCritiqueTargets: number;
  targetedRedoCount: number;
  replanCount: number;
  askCount: number;
  critiqueLLMCalls: number;
}

export type ReleaseVerdict =
  | "release"
  | "release_with_limitations"
  | "withhold";

export type ReleaseReason =
  | "coverage_gap"
  | "alignment_mismatch"
  | "unsupported_finding"
  | "placeholder_output"
  | "blocked_by_budget"
  | "unrecoverable_execution_failure";

export type CoverageState =
  | "covered"
  | "not_covered"
  | "needs_replan"
  | "cannot_determine";

export interface RequirementCoverageEntry {
  requirementId: string;
  state: CoverageState;
  reason?: string;
}

export interface RequirementCoverageSummary {
  total: number;
  covered: number;
  entries: RequirementCoverageEntry[];
  notCovered: string[];
  needsReplan: string[];
}

export type AlignmentIssueKind =
  | "wrong_execution_shape"
  | "scope_creep"
  | "wrong_package";

export type AlignmentAction = "replan" | "targeted_redo" | "withhold";

export interface AlignmentIssue {
  kind: AlignmentIssueKind;
  action: AlignmentAction;
  requirementId?: string;
  packageId?: string;
  detail: string;
}

export interface AlignmentReport {
  issues: AlignmentIssue[];
}

export type PlaceholderReportKind =
  | "placeholder_text"
  | "all_not_covered"
  | "headings_only"
  | "empty_body";

export interface PlaceholderReport {
  detected: boolean;
  kind?: PlaceholderReportKind;
  detail?: string;
}

export interface ReleaseDecision {
  verdict: ReleaseVerdict;
  reasons: ReleaseReason[];
  requirementCoverage: RequirementCoverageSummary;
  alignment: AlignmentReport;
  placeholderReport: PlaceholderReport;
}

export interface CritiqueReport {
  /** @deprecated Graph completion only; do not interpret as legal correctness. */
  isGreen: boolean;
  iteration: number;
  /** Legacy check list retained for persistence/API compatibility. */
  results: CritiqueIssue[];
  /** Optional only for persisted pre-refactor reports; new runs always set it. */
  executionComplete?: boolean;
  structurallyValid?: boolean;
  structuralIssues?: CritiqueIssue[];
  deepCritiqueRequired?: boolean;
  deepCritiqueTargets?: CritiqueTarget[];
  deepCritiqueResults?: DeepCritiqueResult[];
  fixPlan: FixItem[];
  /** Intent classification itself was wrong → full replan. */
  skeletonMismatch: boolean;
  criticalFactSurfaced?: boolean;
  outcomes?: WorkUnitOutcome[];
  /** True when every scheduled work unit has reached a terminal status. */
  allUnitsTerminal?: boolean;
  metrics?: CritiqueMetrics;
  /** Correctness and release gate — controller and renderer consult this. */
  release?: ReleaseDecision;
}
