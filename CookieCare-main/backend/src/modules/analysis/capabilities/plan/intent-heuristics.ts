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

/** User explicitly asked for a deep/thorough report — not a normal compliance review. */
export const EXPLICIT_DEEP_DEPTH_RE =
  /\b(rigorous|thorough|comprehensive|in[- ]depth|deep dive|exhaustive|detailed analysis)\b/i;

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

export function isTabularInstruction(instruction: string): boolean {
  return /\b(tabular(?:\s+mode)?|as(?:\s+a)?\s+table|in\s+a\s+table|markdown\s+table|spreadsheet|column(?:s|ar)?\s+format|present(?:\s+\w+){0,4}\s+as\s+a\s+table)\b/i.test(
    instruction
  );
}

export function isNarrativeInstruction(instruction: string): boolean {
  return /\b(narrative(?:\s+mode)?|as(?:\s+a)?\s+memo|in\s+prose|prose\s+form|paragraph(?:s)?(?:\s+form)?|not\s+(?:a\s+)?table|instead\s+of\s+a\s+table)\b/i.test(
    instruction
  );
}

export type FollowUpKind =
  | "none"
  | "presentation_change"
  | "conversational_qa"
  | "new_analysis";

const PRESENTATION_ONLY_RE =
  /^\s*(please\s+|can you\s+|could you\s+)?(now\s+|instead\s+)?(show|present|format|rewrite|reformat|render|give|make)\b.{0,80}\b(table|tabular|narrative|memo|prose)\b/i;

const NEW_ANALYSIS_FOLLOWUP_RE =
  /\b(?:(?:can|could)\s+you\s+(?:also\s+)?(?:check|review|analyze|analyse|assess|run|perform|look at|evaluate|audit|scan|inspect)|(?:also|additionally|now|next)\s+(?:check|review|analyze|analyse|assess|run|perform|look at|evaluate)|(?:please\s+)?(?:check|review|analyze|analyse|assess)\s+(?:this|the|my)\s+(?:dpa|document|agreement|contract|msa|nda)\s+(?:for|against))\b/i;

const CONVERSATIONAL_QA_RE =
  /\b(you (?:said|mentioned|found|flagged|wrote)|the (?:previous|prior|last) (?:report|analysis|answer)|as (?:above|before)|that (?:finding|risk|clause|gap)|what about|can you (?:explain|clarify|expand)|why (?:is|did|was)|how (?:does|did|is))\b/i;

export function isNewAnalysisFollowUpInstruction(instruction: string): boolean {
  return NEW_ANALYSIS_FOLLOWUP_RE.test(instruction.trim());
}

export function classifyFollowUpKind(args: {
  instruction: string;
  hasPriorConversation: boolean;
  hasPriorFindings: boolean;
}): FollowUpKind {
  if (!args.hasPriorConversation) return "none";
  const text = args.instruction.trim();

  if (isNewAnalysisFollowUpInstruction(text)) {
    return "new_analysis";
  }

  const presentationAsked =
    isTabularInstruction(text) ||
    isNarrativeInstruction(text) ||
    PRESENTATION_ONLY_RE.test(text);

  if (presentationAsked && args.hasPriorFindings && isMostlyPresentationAsk(text)) {
    return "presentation_change";
  }
  if (args.hasPriorFindings && (CONVERSATIONAL_QA_RE.test(text) || isShortFollowUpQuestion(text))) {
    return "conversational_qa";
  }
  return "new_analysis";
}

function isMostlyPresentationAsk(instruction: string): boolean {
  const stripped = instruction
    .replace(/\b(present findings as a table)\.?/gi, " ")
    .replace(PRESENTATION_ONLY_RE, " ")
    .replace(
      /\b(tabular(?:\s+mode)?|narrative(?:\s+mode)?|as(?:\s+a)?\s+table|in\s+a\s+table|in\s+prose)\b/gi,
      " "
    )
    .replace(/\b(please|now|instead|show|present|format|rewrite|reformat|render|give|make|the|a|an|in|as|to|me)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length < 40;
}

function isShortFollowUpQuestion(instruction: string): boolean {
  const text = instruction.trim();
  if (text.length > 220) return false;
  if (isNewAnalysisFollowUpInstruction(text)) return false;
  return /^(what|why|how|which|where|who|can|could|would|please|explain|clarify|expand|and)\b/i.test(
    text
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
  if (isTabularInstruction(instruction)) {
    outputForm = "table";
    reportType = operation === "extract" ? "extraction_table" : reportType;
  } else if (isNarrativeInstruction(instruction)) {
    outputForm = "memo";
  } else if (/\b(brief(?:\s+(?:overview|summary))?|concise|short summary|quick overview|simple language|plain(?:\s|-)?english|plain language|pass\/fail|short answer)\b/i.test(instruction)) {
    outputForm = "brief_summary";
    depth = "narrow";
  } else if (EXPLICIT_DEEP_DEPTH_RE.test(instruction)) {
    depth = "deep";
  }

  const explicitForm = isTabularInstruction(instruction) || isNarrativeInstruction(instruction);

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
      outputForm: explicitForm ? 1 : 0.75,
    },
  };
}

