import type { EvidenceSpan } from "./locator.js";
import type { RuleSourceTier } from "./rule-source.js";
import type { TerminalStatus } from "./work-unit-outcome.js";

export type FindingKind =
  | "risk"
  | "compliance"
  | "comparison_delta"
  | "extraction"
  | "summary_point";

export type FindingStatus =
  | "present"
  | "absent_expected"
  | "insufficient_evidence"
  /** System coverage gap — rule not authored; distinct from document-level insufficient_evidence. */
  | "not_covered";

export type FindingVisibility = "internal" | "user_facing";

export type MatrixAddressing = "named" | "generic" | "absent";

export interface Finding {
  findingId: string;
  kind: FindingKind;
  /** Member of risk taxonomy or rule_id — versioned. */
  category: string;
  status: FindingStatus;
  claim: string;
  evidence: EvidenceSpan[];
  ruleId?: string;
  ruleVersion?: string;
  severity?: "low" | "medium" | "high";
  taxonomyVersion: string;
  workUnitId?: string;
  skillId?: string;
  /** Package that emitted this finding, when the unit was package-scoped. */
  packageId?: string;
  /** Audit vs user report. Default treated as user_facing when omitted. */
  visibility?: FindingVisibility;
  matrixRowId?: string;
  matrixAddressing?: MatrixAddressing;
  gap?: string;
  /** Authored relatedChecks subgraph — render under "Related, not requested". */
  relatedNotRequested?: boolean;
  /** Org playbook override — never blended silently into skill findings. */
  orgPlaybook?: boolean;
  orgPlaybookNote?: string;
  /**
   * Tier C live-search finding. Must never render in the same table as
   * authored (Tier B) compliance findings.
   */
  unverified?: boolean;
  sourceUrl?: string;
  /** ISO retrieval time for Tier C staleness visibility. */
  retrievedAt?: string;
  /**
   * Trust tier for renderer separation:
   * B = authored regime, P = playbook-derived, C = web-derived.
   */
  ruleSourceTier?: RuleSourceTier;
  playbookPositionId?: string;
  /** Set when CRITIQUE resolves a unit as not_covered or retries_exhausted. */
  terminalStatus?: TerminalStatus;
  /**
   * PLAN requirement id this finding helps establish. Enables per-requirement
   * aggregation (RequirementAssessment) and independent CRITIQUE verification
   * without making the finding itself requirement-scoped.
   */
  requirementId?: string;
}
