// ─── LORA AI — Type Definitions ─────────────────────────────────────────

export type WorkflowId =
  | "dpa-review"
  | "vendor-review"
  | "ai-ethics"
  | "compare-documents"
  | "analyze-agreement"
  | "draft-agreement"
  | "cookie-review"
  | "website-analysis"
  | "privacy-assessment";

export interface QuickAction {
  id: WorkflowId;
  label: string;
  icon: React.ElementType;
  prompt: string;
  available: boolean;
  description: string;
  primary?: boolean;
}

export interface UploadedFile {
  id: string;
  file: File;
  name: string;
  size: number;
}

export type MessageRole = "user" | "assistant";

// ─── Compare Result Types (subset of backend CompareState) ───────────────────

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type RiskCategory =
  | "liability" | "indemnity" | "ip" | "termination" | "data_protection"
  | "payment" | "confidentiality" | "governing_law" | "audit_rights" | "other";

export interface CompareRiskFinding {
  id: string;
  pairId: string;
  level: RiskLevel;
  category: RiskCategory;
  rationale: string;
  confidence: number;
  source: "deterministic" | "llm";
  /**
   * Populated only for deterministic rule-based findings.
   * e.g. "LIABILITY_CAP_REMOVED"
   */
  triggeredRule?: string;
}

export type DiffClassification =
  | "UNCHANGED" | "ADDED" | "REMOVED"
  | "MODIFIED_BROADER" | "MODIFIED_NARROWER" | "NEUTRAL_REPHRASE";

/** Classification values a single atomic (granular) change can carry. */
export type AtomicChangeClassification =
  | "MODIFIED_BROADER" | "MODIFIED_NARROWER" | "NEUTRAL_REPHRASE";

/**
 * One evidenced obligation/metric/right edit inside a matched clause pair —
 * e.g. "TLS → TLS 1.2+" or "annual → quarterly". Backend-sourced; the frontend
 * never invents these, only renders what the pipeline already extracted.
 */
export interface AtomicChange {
  /** Normalised snake_case subject, e.g. tls_in_transit */
  topic: string;
  classification: AtomicChangeClassification;
  /** Factual one-line description of this one change */
  summary: string;
  /** Verbatim span copied from the Original (A) text */
  originalSnippet: string;
  /** Verbatim span copied from the Modified (B) text */
  modifiedSnippet: string;
  confidence: number;
}

export interface CompareClauseDifference {
  pairId: string;
  clauseAId: string | null;
  clauseBId: string | null;
  classification: DiffClassification;
  semanticSummary: string;
  confidence: number;
  /**
   * How the classification was produced:
   * "identical" | "similarity" | "llm" | "fallback"
   */
  detectionMethod?: "identical" | "similarity" | "llm" | "fallback";
  /**
   * Independent evidenced edits inside this pair (e.g. "30 days → 1 year").
   * Empty/absent for ADDED/REMOVED/UNCHANGED/UNCERTAIN and when no concrete
   * granular change could be quoted from both sides.
   */
  changes?: AtomicChange[];
}

export type AlignmentStatus = "matched" | "added" | "removed" | "restructured";

/**
 * Canonical relationship type — preserved from the backend AlignedPair.
 * This is the source of truth for structural correspondence; the legacy
 * alignmentType/status fields are a UI projection derived from it.
 *
 * MATCH/MOVED  — confirmed 1:1 correspondence (MOVED = different position)
 * MERGED       — one B clause absorbs multiple A clauses (condensation)
 * SPLIT        — one A clause maps to multiple B clauses
 * ADDED        — no counterpart in Original
 * REMOVED      — no counterpart in Modified
 * UNCERTAIN    — correspondence could not be established (NOT a confirmed change)
 */
export type AlignmentRelationshipType =
  | "MATCH"
  | "ADDED"
  | "REMOVED"
  | "MOVED"
  | "SPLIT"
  | "MERGED"
  | "UNCERTAIN";

export interface CompareAlignedPair {
  id: string;
  clauseAId: string | null;
  clauseBId: string | null;
  alignmentType: "exact" | "semantic" | "unmatched";
  matchConfidence: number;
  alignmentReason: string;
  status: AlignmentStatus;
  /**
   * Canonical structural relationship from the backend alignment pipeline.
   * Optional for backwards compatibility with cached/historical results that
   * pre-date this field being mapped through.
   */
  relationshipType?: AlignmentRelationshipType;
}

export interface CompareExecutiveSummary {
  overallAssessment: string;
  overallRisk: RiskLevel;
  keyFindings: string[];
  criticalRedlines: string[];
  missingProtections: string[];
  negotiationPriorities: string[];
  recommendation: string;
}

/**
 * Lightweight clause record — subset of the backend ExtractedClause.
 * Passed to CompareEvidencePane for rendering inline diff evidence.
 */
export interface CompareClauseRecord {
  id: string;
  title: string;
  text: string;
  position?: number;
  sectionPath?: string[];
  /** 1-indexed PDF page number. Only present for PDF documents. */
  pageNumber?: number;
}

/** Structured compare results attached to a chat message for interactive rendering */
export interface CompareResult {
  executiveSummary: CompareExecutiveSummary;
  risks: CompareRiskFinding[];
  differences: CompareClauseDifference[];
  alignment: CompareAlignedPair[];
  originalFileName: string;
  revisedFileName: string;
  /**
   * Extracted clause records from the original (baseline) document.
   * Present after pipeline completion — required for inline diff evidence.
   */
  clausesA?: CompareClauseRecord[];
  /**
   * Extracted clause records from the revised document.
   * Present after pipeline completion — required for inline diff evidence.
   */
  clausesB?: CompareClauseRecord[];
  /**
   * The original uploaded File objects retained in-memory for the active session.
   * Never persisted to localStorage. Absent for historical comparisons.
   */
  pdfFiles?: {
    original?: File;
    revised?: File;
  };
  /**
   * The job_id / session key returned by POST /api/compare/start.
   * Present after pipeline completion — used to route follow-up questions
   * to the Compare Chat agent instead of the generic AI endpoint.
   */
  sessionId?: string;
}

// ─── ChatMessage ──────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  files?: { name: string; size: number }[];
  /** Present only on compare-documents assistant messages */
  compareResult?: CompareResult;
}
