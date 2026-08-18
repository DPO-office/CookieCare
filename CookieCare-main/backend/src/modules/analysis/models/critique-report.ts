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
}
