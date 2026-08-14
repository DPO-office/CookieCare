import type { EvidenceSpan } from "./locator.js";

export type FindingKind =
  | "risk"
  | "compliance"
  | "comparison_delta"
  | "extraction"
  | "summary_point";

export type FindingStatus = "present" | "absent_expected" | "insufficient_evidence";

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
}
