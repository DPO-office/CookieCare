import type {
  IntentClassification,
  OperationAxis,
  OutputFormAxis,
  ScopeAxis,
} from "../../models/intent.js";
import { INTENT_CONFIDENCE_THRESHOLD } from "../../models/intent.js";

export const LEGAL_ADVICE_RE =
  /\b(should i sign|shall i sign|will i win|can i win|advise me to|is it safe to sign|predict.*(outcome|dispute|litigation)|legal advice)\b/i;

/** Deterministic fallback when LLM unavailable — prefers risk_flag for risk-ish language. */
export function heuristicClassify(instruction: string): {
  scope: ScopeAxis;
  operation: OperationAxis;
  standard: string;
  outputForm: OutputFormAxis;
  compound: boolean;
  confidence: IntentClassification["confidence"];
} {
  const lower = instruction.toLowerCase();
  let operation: OperationAxis = "explain_qa";
  let outputForm: OutputFormAxis = "memo";
  let confOp = 0.55;

  if (/\b(risk|flag|liability|indemnit|uncapped)\b/.test(lower)) {
    operation = "risk_flag";
    outputForm = "checklist";
    confOp = 0.85;
  } else if (/\b(complian|gdpr|hipaa|cpra|check against)\b/.test(lower)) {
    operation = "compliance_check";
    outputForm = "checklist";
    confOp = 0.8;
  } else if (/\b(summar|overview|tl;dr)\b/.test(lower)) {
    operation = "summarize";
    outputForm = "memo";
    confOp = 0.8;
  } else if (/\b(extract|find clauses?|list)\b/.test(lower)) {
    operation = "extract";
    outputForm = "table";
    confOp = 0.8;
  } else if (/\b(compar|diff|redline)\b/.test(lower)) {
    operation = "compare";
    outputForm = "redline_diff";
    confOp = 0.75;
  }

  void INTENT_CONFIDENCE_THRESHOLD;
  return {
    scope: "whole_document",
    operation,
    standard: "none",
    outputForm,
    compound: false,
    confidence: {
      scope: 0.8,
      operation: confOp,
      standard: 0.9,
      outputForm: 0.75,
    },
  };
}
