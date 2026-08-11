import type { EvidenceSpan } from "./locator.js";

export type FindingKind =
  | "risk"
  | "compliance"
  | "comparison_delta"
  | "extraction"
  | "summary_point";

export type FindingStatus = "present" | "absent_expected" | "insufficient_evidence";

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
}
