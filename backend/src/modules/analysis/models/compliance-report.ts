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
  /** Authored rule proposition used to explain the expected standard to the reader. */
  requirementStandard?: string;
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
  /** Presentation density selected for this run. It never changes the locked findings. */
  presentationDepth?: "lite" | "deep";
  scope: string;
  documents: Array<{ documentId: string; title: string; contentHash: string; role?: string }>;
  rows: ComplianceReportRow[];
  outstandingChecks: ComplianceOutstandingCheck[];
  limitations: ComplianceLimitation[];
}

export type CompliancePresentationMode = "layered" | "short" | "detailed" | "narrative" | "table_only";
export type ComplianceSectionKind = "answer" | "overview" | "risks" | "details" | "actions" | "conclusion" | "limitations" | "sources";
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
  /** 0 normally; 3 when the user explicitly asks for a three-paragraph answer. Required in version 2. */
  paragraphLimit?: 0 | 3;
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

/** Only these prose fields may be rewritten; statuses and citations remain code-owned. */
export interface ComplianceReportDraft {
  answer: string;
  rows: Array<{ findingId: string; assessment: string; explanation: string; recommendedAction: string }>;
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
    reportId: string;
    assessmentSnapshotId: string;
    pipeline: "compliance";
    rendererVersion: string;
    provider: string;
    model: string;
    task: string;
    settings: {
      temperature: number;
      thinkingLevel?: string;
      maxOutputTokens: { compose: number; check: number; repair: number };
    };
    startedAt: string;
    completedAt: string;
    elapsedMs: number;
    deadlineMs: number;
    totalRunBudgetMs: number;
    inputChars: number;
    outputChars: number;
    maxInputChars: number;
    evidenceCount: number;
    uniqueEvidenceCount: number;
    modelCalls: number;
    tokenDelta: number;
    fallbackReason?: "adaptive_disabled" | "context_limit" | "token_budget" | "deadline" | "composition_failed" | "validation_failed";
  };
  coverage?: Array<{
    itemId: string;
    sectionIds: string[];
    disposition: "answered" | "answered_with_limitation" | "unresolved";
  }>;
  /** Binds the release gate to exactly the validated Markdown. */
  outputHash: string;
}
