import type { FindingStatus } from "./finding.js";
import type { RequirementStatus } from "./requirement-assessment.js";

export type AuditDowngradeReason =
  | "quote_not_in_source"
  | "covered_without_support"
  | "matrix_missing_row_id"
  | "duplicate_art28_quote";

export interface AuditFindingChange {
  findingId: string;
  from: FindingStatus;
  to: FindingStatus;
  reason: AuditDowngradeReason;
}

export interface AuditAssessmentChange {
  requirementId: string;
  from: RequirementStatus;
  to: RequirementStatus;
  reason: AuditDowngradeReason;
}

export interface AuditReport {
  findingsChanged: AuditFindingChange[];
  assessmentsChanged: AuditAssessmentChange[];
  contradictions: string[];
  notes: string[];
}
