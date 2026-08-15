/** Closed instruction taxonomy — PLAN classifies into these values only. */

export type ScopeAxis =
  | "whole_document"
  | "named_section"
  | "cross_cutting_theme"
  | "cross_document";

export type OperationAxis =
  | "extract"
  | "risk_flag"
  | "compliance_check"
  | "compare"
  | "summarize"
  | "explain_qa"
  | "draft_suggestion"
  | "out_of_scope";

export type StandardAxis =
  | "none"
  | `regime_pack:${string}`
  | `playbook_rule:${string}`
  | `reference_document:${string}`;

export type OutputFormAxis =
  | "table"
  | "checklist"
  | "redline_diff"
  | "memo"
  | "qa_thread";

export interface IntentAxisConfidence {
  scope: number;
  operation: number;
  standard: number;
  outputForm: number;
}

/** One distinct ask inside a compound instruction. */
export interface IntentSubIntent {
  operation: OperationAxis;
  standard: StandardAxis;
  outputForm: OutputFormAxis;
  /** Short label, e.g. "GDPR compliance check". */
  description?: string;
}

export interface IntentClassification {
  scope: ScopeAxis;
  operation: OperationAxis;
  standard: StandardAxis;
  outputForm: OutputFormAxis;
  compound: boolean;
  subIntents: IntentSubIntent[];
  confidence: IntentAxisConfidence;
  /** Decline-and-redirect message when operation === out_of_scope. */
  outOfScopeReason?: string;
  suggestedReframes?: string[];
  /**
   * LLM named a standard that is not in the skill/rule registry.
   * PLAN schedules web_assisted_reference (Tier C), never silently drops to none.
   */
  unresolvedStandard?: string;
  /** Detected document type passed into classification (audit). */
  docTypeHint?: string;
}

/** Axes that change what runs — low confidence → ASK. */
export const INTENT_CONFIDENCE_THRESHOLD = 0.6;

export type ClarificationAxis = "operation" | "standard";

/** Typed ASK payload produced immediately after classification (§4). */
export interface ClarificationRequest {
  axes: ClarificationAxis[];
  questions: Array<{
    field: ClarificationAxis;
    question: string;
    options?: string[];
  }>;
  docTypeHint?: string;
}

export const LEGAL_ADVICE_DECLINE_MESSAGE =
  "CookieCare analyzes documents (risks, compliance, extraction, comparison). " +
  "It does not provide legal advice on whether you should sign, litigate, or predict dispute outcomes. " +
  "Please rephrase as a document-analysis question.";

export const LEGAL_ADVICE_REFRAMES = [
  "Flag high-risk clauses in this agreement and cite the source text.",
  "Check this document for missing limitation-of-liability or indemnity provisions.",
  "Summarize the termination and liability sections with evidence quotes.",
];
