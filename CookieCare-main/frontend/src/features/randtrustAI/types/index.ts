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
}

export type DiffClassification =
  | "UNCHANGED" | "ADDED" | "REMOVED"
  | "MODIFIED_BROADER" | "MODIFIED_NARROWER" | "NEUTRAL_REPHRASE";

export interface CompareClauseDifference {
  pairId: string;
  clauseAId: string | null;
  clauseBId: string | null;
  classification: DiffClassification;
  semanticSummary: string;
  confidence: number;
}

export type AlignmentStatus = "matched" | "added" | "removed" | "restructured";

export interface CompareAlignedPair {
  id: string;
  clauseAId: string | null;
  clauseBId: string | null;
  alignmentType: "exact" | "semantic" | "unmatched";
  matchConfidence: number;
  alignmentReason: string;
  status: AlignmentStatus;
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

/** Structured compare results attached to a chat message for interactive rendering */
export interface CompareResult {
  executiveSummary: CompareExecutiveSummary;
  risks: CompareRiskFinding[];
  differences: CompareClauseDifference[];
  alignment: CompareAlignedPair[];
  originalFileName: string;
  revisedFileName: string;
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
