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
  | "executive_summary"
  | "conclusion"
  /** @deprecated Prefer separate `scope` and `conclusion`. Kept for legacy ReportSpec payloads. */
  | "scope_and_conclusion"
  | "chapeau_particulars"
  | "requirements_matrix"
  | "key_findings"
  | "requirements_detail"
  | "material_gaps"
  | "risk_summary"
  | "comparison"
  | "qualifications"
  | "limitations"
  | "recommendations"
  | "missing_materials"
  | "evidence";

/**
 * Semantic role used by PLAN to build a dynamic outline.
 * Analysis extras are top-level `##` sections, not nested under requirements_detail.
 */
export type ReportSectionRole =
  | "scope"
  | "executive_summary"
  | "analysis"
  | "requirements_matrix"
  | "key_findings"
  | "chapeau_particulars"
  | "material_gaps"
  | "risk_summary"
  | "comparison"
  | "qualifications"
  | "limitations"
  | "recommendations"
  | "missing_materials"
  | "evidence"
  | "conclusion";

export interface ReportOutlineItem {
  /** Stable key, e.g. `analysis.chapeau` or `analysis.mandatory_clauses`. */
  id: string;
  /** Semantic role of this outline item. */
  role: ReportSectionRole;
  /** Registry section this outline item renders as. */
  sectionId?: ReportSectionId;
  /** User-facing heading used by synthesis as a top-level `##` heading. */
  heading: string;
  /** Which semantic intent requirements this outline item covers. */
  requirementIds: string[];
  /** Optional structured artifact types this section should consume. */
  artifactTypes?: string[];
  /** Whether the outline was created deterministically or refined. */
  source: "deterministic" | "catalog_llm";
}

export interface ReportSpec {
  reportType: ReportType;
  depth: ReportDepth;
  sections: ReportSectionId[];
  /**
   * Optional dynamic outline that synthesis uses to create user-shaped middle
   * sections. When absent, synthesis falls back to legacy sections.
   */
  outline?: ReportOutlineItem[];
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
  /**
   * Whose side the ask is being answered from (e.g. "customer", "processor").
   * Inferred from context where possible; asked when genuinely ambiguous (§5.2).
   */
  partyPerspective?: string | null;
  /**
   * User-stated scoping instruction ("just the top 3 risks", "skip drafting
   * nitpicks"), separate from the Lite/Deep compute budget (Gap 2).
   */
  exhaustiveness?: IntentExhaustiveness;
  /**
   * Document version/hash per docId, so a follow-up turn can tell whether a
   * prior-turn locked assessment is still valid or must be re-investigated
   * after a revised upload (§5.5).
   */
  documentVersionRef?: Record<string, string> | null;
}

export interface IntentExhaustiveness {
  mode: "default" | "user_capped";
  /** Present when mode === "user_capped", e.g. "top 3 risks" → 3. */
  limit?: number;
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
  depth: ReportDepth,
  operation?: OperationAxis
): ReportSectionId[] {
  if (reportType === "qa_answer") {
    return depth === "narrow"
      ? ["key_findings", "evidence"]
      : ["key_findings", "evidence", "qualifications"];
  }

  if (reportType === "rights_matrix") {
    return [
      "executive_summary",
      "requirements_matrix",
      "material_gaps",
      "recommendations",
      "conclusion",
    ];
  }

  // Open risk questions ("what's the biggest risk if we onboard this vendor")
  // are answered as a risk narrative, not a compliance matrix: lead with the
  // direct answer / biggest exposure, then the ranked risks, what to negotiate,
  // and the bottom line. Gated to risk_flag so it lines up with the risk lane
  // in PLAN (generate-propositions) and ACT (buildVerifiedFinding).
  if (operation === "risk_flag") {
    if (depth === "narrow") return ["executive_summary", "conclusion"];
    return ["executive_summary", "risk_summary", "recommendations", "conclusion"];
  }

  // Comparison questions ("is this termination clause balanced between the
  // parties") are answered side-by-side, not as a compliance matrix: lead
  // with the direct answer, then the comparison itself, what to negotiate,
  // and the bottom line. Gated to `compare` so it lines up with PLAN's
  // decomposeReasoningAsk (paired side_a/side_b propositions) and ACT's
  // comparison_delta finding kind.
  if (operation === "compare") {
    if (depth === "narrow") return ["executive_summary", "conclusion"];
    return ["executive_summary", "comparison", "recommendations", "conclusion"];
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
