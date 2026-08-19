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
  | "qa_thread"
  | "brief_summary";

/** How multi-document results are presented. */
export type DocumentPresentation = "unified" | "individual";

/** User-facing answer style from the Analyze UI. */
export type AnswerStyle = "narrative" | "tabular";

export type ReportType =
  | "regime_compliance_memo"
  | "risk_audit"
  | "rights_matrix"
  | "qa_answer"
  | "extraction_table";

export type ReportDepth = "narrow" | "standard" | "deep";

export type ReportSectionId =
  | "scope"
  | "conclusion"
  /** @deprecated Prefer separate `scope` and `conclusion`. Kept for legacy ReportSpec payloads. */
  | "scope_and_conclusion"
  | "chapeau_particulars"
  | "requirements_detail"
  | "qualifications"
  | "recommendations"
  | "missing_materials";

export interface ReportSpec {
  reportType: ReportType;
  depth: ReportDepth;
  sections: ReportSectionId[];
}

export interface IntentAxisConfidence {
  scope: number;
  operation: number;
  standard: number;
  outputForm: number;
}

export type IntentRequirementType =
  | "verification"
  | "adequacy"
  | "extraction"
  | "comparison"
  | "coverage"
  | "recommendation"
  | "other";

export type IntentRequirementPriority = "required" | "supporting";

/** Semantic requirement from classify-intent — not a registry rule ID. */
export interface IntentRequirement {
  id: string;
  description: string;
  type: IntentRequirementType;
  priority: IntentRequirementPriority;
}

export interface UnresolvedIntentNeed {
  description: string;
  reason: string;
}

/** One distinct ask inside a compound instruction. */
export interface IntentSubIntent {
  operation: OperationAxis;
  standard: StandardAxis;
  outputForm: OutputFormAxis;
  reportType?: ReportType;
  depth?: ReportDepth;
  /** Short label, e.g. "GDPR compliance check". */
  description?: string;
  requirements?: IntentRequirement[];
}

export interface IntentClassification {
  scope: ScopeAxis;
  operation: OperationAxis;
  standard: StandardAxis;
  /** Semantic standard/regime named by the user (e.g. "GDPR Article 28"). */
  standardConcept?: string;
  outputForm: OutputFormAxis;
  /** unified = one combined report; individual = a section per uploaded document. */
  documentPresentation?: DocumentPresentation;
  reportType?: ReportType;
  depth?: ReportDepth;
  compound: boolean;
  subIntents: IntentSubIntent[];
  /** Concrete analytical requirements the user wants established. */
  requirements: IntentRequirement[];
  /** Semantic needs the classifier could not express as requirements. */
  unresolvedNeeds?: UnresolvedIntentNeed[];
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

export function deriveSections(
  reportType: ReportType,
  depth: ReportDepth
): ReportSectionId[] {
  if (reportType === "qa_answer") {
    return depth === "narrow" ? ["conclusion"] : ["scope", "conclusion"];
  }

  if (reportType === "rights_matrix") {
    return ["scope", "requirements_detail", "recommendations", "conclusion"];
  }

  const sections: ReportSectionId[] = ["scope"];

  if (depth === "narrow") {
    return ["scope", "conclusion"];
  }

  sections.push("requirements_detail");

  sections.push("qualifications", "recommendations");

  if (depth === "deep") {
    sections.push("missing_materials");
  }

  sections.push("conclusion");
  return sections;
}
