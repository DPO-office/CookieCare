import type {
  IntentClassification,
  OperationAxis,
  OutputFormAxis,
  ReportDepth,
  ReportType,
  ScopeAxis,
} from "../../models/intent.js";
import { INTENT_CONFIDENCE_THRESHOLD } from "../../models/intent.js";

export const LEGAL_ADVICE_RE =
  /\b(should i sign|shall i sign|will i win|can i win|advise me to|is it safe to sign|predict.*(outcome|dispute|litigation)|legal advice)\b/i;

/**
 * Detects a reference to an actual document section/heading (e.g. "the Security
 * section", "Section 4.2", "the Termination clause"). Deliberately excludes bare
 * legal-article references such as "Article 28" — a statute/regulation article is
 * a legal focus, not a document section.
 */
const DOCUMENT_SECTION_PATTERNS: RegExp[] = [
  // "Section 4.2", "section 7"
  /\bsection\s+\d+(?:\.\d+)*\b/i,
  // "the Security section", "the Data Protection clause"
  /\bthe\s+[\w'&/-]+(?:\s+[\w'&/-]+){0,2}\s+(?:section|clause|heading|schedule|annex|appendix|exhibit|paragraph)\b/i,
  // common contract headings directly bound to a section/clause word
  /\b(?:security|termination|liability|indemnif\w*|confidentiality|payment|warrant(?:y|ies)|governing law|dispute resolution|force majeure)\s+(?:section|clause)\b/i,
];

export function namesDocumentSection(instruction: string): boolean {
  return DOCUMENT_SECTION_PATTERNS.some((re) => re.test(instruction));
}

/**
 * Conservative correction of the LLM scope classification. A legal article,
 * statute, or compliance subject must never by itself yield "named_section".
 * This only downgrades an incorrect "named_section" to "whole_document" when the
 * instruction does not actually name a document section; it never overrides a
 * correct "named_section" (one where a section is genuinely named) and never
 * touches "whole_document", "cross_cutting_theme", or "cross_document".
 */
export function refineScope(scope: ScopeAxis, instruction: string): ScopeAxis {
  if (scope === "named_section" && !namesDocumentSection(instruction)) {
    return "whole_document";
  }
  return scope;
}

/**
 * PLAN selection signal: whether the user actually asked for risk analysis /
 * risk flagging. Used to decide if related risk categories should be promoted to
 * required capabilities. This is a selection gate, not semantic intent
 * extraction, and never overrides the LLM's requirement understanding.
 */
export function requestsRiskAnalysis(
  instruction: string,
  operation: OperationAxis,
  subIntents?: Array<{ operation: OperationAxis }>
): boolean {
  if (operation === "risk_flag") return true;
  if (subIntents?.some((si) => si.operation === "risk_flag")) return true;
  return /\bflag\b[^.]*\brisks?\b|\ball (?:material|key|the)\s+risks?\b|\brisk (?:analysis|assessment|flagging|audit)\b/i.test(
    instruction
  );
}

export function isBriefSummaryInstruction(instruction: string): boolean {
  return /\b(brief(?:\s+(?:overview|summary))?|concise|short summary|quick overview|simple language|plain(?:\s|-)?english|plain language|nothing more(?:\s+than)?(?:\s+that)?|no more than that)\b/i.test(
    instruction
  );
}

/** Deterministic fallback when LLM unavailable — prefers risk_flag for risk-ish language. */
export function heuristicClassify(instruction: string): {
  scope: ScopeAxis;
  operation: OperationAxis;
  standard: string;
  outputForm: OutputFormAxis;
  reportType?: ReportType;
  depth?: ReportDepth;
  compound: boolean;
  subIntents?: Array<{
    operation: OperationAxis;
    standard: string;
    outputForm: OutputFormAxis;
    reportType?: ReportType;
    depth?: ReportDepth;
    description?: string;
  }>;
  confidence: IntentClassification["confidence"];
} {
  const lower = instruction.toLowerCase();
  let operation: OperationAxis = "explain_qa";
  let outputForm: OutputFormAxis = "memo";
  let reportType: ReportType = "qa_answer";
  let depth: ReportDepth = "standard";
  let confOp = 0.55;

  if (/\b(risk|flag|liability|indemnit|uncapped)\b/.test(lower)) {
    operation = "risk_flag";
    outputForm = "checklist";
    reportType = "risk_audit";
    confOp = 0.85;
  } else if (/\b(complian|gdpr|hipaa|cpra|check against)\b/.test(lower)) {
    operation = "compliance_check";
    outputForm = "checklist";
    reportType = "regime_compliance_memo";
    confOp = 0.8;
  } else if (/\b(summar|overview|tl;dr)\b/.test(lower)) {
    operation = "summarize";
    outputForm = "memo";
    reportType = "qa_answer";
    confOp = 0.8;
  } else if (/\b(extract|find clauses?|list)\b/.test(lower)) {
    operation = "extract";
    outputForm = "table";
    reportType = "extraction_table";
    confOp = 0.8;
  } else if (/\b(compar|diff|redline)\b/.test(lower)) {
    operation = "compare";
    outputForm = "redline_diff";
    reportType = "risk_audit";
    confOp = 0.75;
  }
  if (/\b(brief(?:\s+(?:overview|summary))?|concise|short summary|quick overview|simple language|plain(?:\s|-)?english|plain language|pass\/fail|short answer)\b/i.test(instruction)) {
    outputForm = "brief_summary";
    depth = "narrow";
  } else if (/\b(rigorous|thorough|comprehensive|verify|all mandatory|present and adequate|suggest improvements)\b/i.test(instruction)) {
    depth = "deep";
  }

  void INTENT_CONFIDENCE_THRESHOLD;
  return {
    scope: "whole_document",
    operation,
    standard: "none",
    outputForm,
    reportType,
    depth,
    compound: false,
    subIntents: [],
    confidence: {
      scope: 0.8,
      operation: confOp,
      standard: 0.9,
      outputForm: 0.75,
    },
  };
}
