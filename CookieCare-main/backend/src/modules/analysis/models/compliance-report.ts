import type { RequirementStatus, EvidenceRole, ComplianceCheckOutcome } from "../capabilities/act/compliance/contracts/index.js";

/** Canonical results and source locators, independent of the in-memory run tracker. */
export interface ComplianceEvidence {
  spanId: string;
  quote: string;
  structuralPath: string;
  charRange: [number, number];
  originalRole?: EvidenceRole;
  use?: "proof" | "related" | "conflict";
  contribution?: string;
  citationId: string;
  documentId: string;
  documentTitle: string;
  pointer: string;
}

export interface ComplianceReportRow {
  rowId: string;
  requirementId: string;
  canonicalKey: string;
  legalCitation: string;
  title: string;
  status: RequirementStatus;
  statusLabel: "Present" | "Partial" | "Gap" | "Cannot determine" | "Not applicable" | "Conflicting" | "Judgment required" | "Verification incomplete";
  recommendedAction: string;
  supportedElementIds: string[];
  missingElementIds: string[];
  whatTheDocumentProvides: string;
  whatIsMissingOrUnclear: string;
  whyItMatters: string;
  conclusion: string;
  ruleVersion: string;
  documentHash: string;
  outcomeId?: string;
  outcomeKind?: "assessment" | "incomplete";
  checkId?: string;
  lockedAssessmentId?: string;
  answers?: Array<{
    questionId: string;
    /** Original request/facet wording retained at the reporting handoff. */
    question?: string;
    answer: string;
    elementIds: string[];
    evidenceIds: string[];
  }>;
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
  version: 1 | 2;
  /** Versioned canonical decisions retained for replay; absent for historical/legacy snapshots. */
  outcomes?: ComplianceCheckOutcome[];
  instruction: string;
  scope: string;
  documents: Array<{ documentId: string; title: string; contentHash: string; role?: string }>;
  rows: ComplianceReportRow[];
  outstandingChecks: ComplianceOutstandingCheck[];
  limitations: ComplianceLimitation[];
}

export type CompliancePresentationMode = "layered" | "short" | "detailed" | "narrative" | "table_only";
export type ComplianceSectionKind = "answer" | "overview" | "details" | "actions" | "limitations" | "sources";
export type ComplianceTableColumn =
  | "Requirement"
  | "Status"
  | "Contract provision"
  | "Assessment"
  | "Gap or qualification"
  | "Recommended action"
  | "Parties and roles"
  | "Transfer mechanism"
  | "Destination"
  | "Legal basis"
  | "Timing";

export interface CompliancePresentationPlan {
  version: 1 | 2;
  mode: CompliancePresentationMode;
  rationale: string;
  sections: Array<{
    /** Stable report-local identity and request coverage mappings; required in version 2 plans. */
    id?: string;
    requestItemIds?: string[];
    questionIds?: string[];
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
  /** Exact instruction packages used for this composition, retained for replay and diagnostics. */
  guidanceVersions?: {
    shared: string;
    compliance: string;
    examples: string[];
  };
  /** Safe generation diagnostics. Source prose and document contents are never stored here. */
  generation?: {
    schemaVersion: "1.0";
    rendererVersion: string;
    provider: string;
    model: string;
    task: string;
    startedAt: string;
    completedAt: string;
    elapsedMs: number;
    deadlineMs: number;
    inputChars: number;
    maxInputChars: number;
    evidenceCount: number;
    uniqueEvidenceCount: number;
    modelCalls: number;
    tokenDelta: number;
    fallbackReason?: "adaptive_disabled" | "context_limit" | "token_budget" | "composition_failed" | "validation_failed";
  };
  coverage?: Array<{
    itemId: string;
    sectionIds: string[];
    disposition: "answered" | "answered_with_limitation" | "unresolved";
  }>;
  /** Binds the release gate to exactly the validated Markdown. */
  outputHash: string;
}
