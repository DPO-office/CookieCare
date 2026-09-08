import type { RenderedRow, RenderedEvidence } from "../capabilities/act/phase7-render.js";

/** Canonical results and source locators, independent of the in-memory run tracker. */
export interface ComplianceEvidence extends RenderedEvidence {
  citationId: string;
  documentId: string;
  documentTitle: string;
  pointer: string;
}

export interface ComplianceReportRow extends Omit<RenderedRow, "evidence"> {
  evidence: ComplianceEvidence[];
  /** Documents actually investigated for this row, including absence findings. */
  reviewedDocumentIds?: string[];
}

export interface ComplianceOutstandingCheck {
  requirementId: string;
  title: string;
  reason: string;
  kind: "unmatched" | "rejected" | "unfinished";
}

export interface ComplianceLimitation {
  id: string;
  requirementIds: string[];
  message: string;
}

export interface ComplianceReportSnapshot {
  version: 1;
  instruction: string;
  scope: string;
  documents: Array<{ documentId: string; title: string; contentHash: string; role?: string }>;
  rows: ComplianceReportRow[];
  outstandingChecks: ComplianceOutstandingCheck[];
  limitations: ComplianceLimitation[];
}

export type CompliancePresentationMode = "layered" | "short" | "detailed" | "narrative" | "table_only";
export type ComplianceSectionKind = "answer" | "overview" | "details" | "limitations" | "sources";
export type ComplianceTableColumn = "Requirement" | "Status" | "Contract provision" | "Assessment";

export interface CompliancePresentationPlan {
  version: 1;
  mode: CompliancePresentationMode;
  rationale: string;
  sections: Array<{
    kind: ComplianceSectionKind;
    heading: string;
    findingIds: string[];
    columns: ComplianceTableColumn[];
    detailWords: number;
  }>;
}

/** Only these prose fields may be rewritten; statuses, citations and actions are code-owned. */
export interface ComplianceReportDraft {
  answer: string;
  rows: Array<{ findingId: string; assessment: string; explanation: string }>;
}

export interface ComplianceReportValidation {
  passed: boolean;
  source: "validated_writer" | "deterministic" | "snapshot_unavailable";
  failures: string[];
  plannerFallback: boolean;
  repairAttempts: number;
  /** Binds the release gate to exactly the validated Markdown. */
  outputHash: string;
}
