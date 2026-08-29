import type { IntentNormalization } from "../../../models/analysis-plan.js";
import {
  INTENT_CONFIDENCE_THRESHOLD,
  type IntentClassification,
  type ReportDepth,
  type ReportType,
} from "../../../models/intent.js";
import { EXPLICIT_DEEP_DEPTH_RE } from "./intent-heuristics.js";

const SHALLOW_OUTPUT_SIGNAL = /\b(brief|concise|short answer|pass\/fail|just give me)\b/i;

function fallbackReportType(operation: IntentClassification["operation"]): ReportType {
  switch (operation) {
    case "extract":
      return "extraction_table";
    case "risk_flag":
    case "compare":
      return "risk_audit";
    case "compliance_check":
      return "regime_compliance_memo";
    case "summarize":
    case "explain_qa":
    case "out_of_scope":
    case "draft_suggestion":
    default:
      return "qa_answer";
  }
}

function fallbackDepth(instruction: string): ReportDepth {
  if (EXPLICIT_DEEP_DEPTH_RE.test(instruction)) return "deep";
  if (SHALLOW_OUTPUT_SIGNAL.test(instruction)) return "narrow";
  return "standard";
}

function outputFormFromReportSpec(
  reportType: ReportType,
  depth: ReportDepth,
  operation: IntentClassification["operation"]
): IntentClassification["outputForm"] {
  switch (reportType) {
    case "extraction_table":
      return "table";
    case "qa_answer":
      return depth === "narrow" ? "brief_summary" : "memo";
    case "risk_audit":
      return operation === "compare" ? "redline_diff" : "checklist";
    case "rights_matrix":
    case "regime_compliance_memo":
    default:
      return "memo";
  }
}

export function applySensibleDefaults(
  intent: IntentClassification,
  instruction: string
): { intent: IntentClassification; normalizations: IntentNormalization[] } {
  const normalizations: IntentNormalization[] = [];
  const confidence = { ...intent.confidence };
  let scope = intent.scope;

  let reportType = intent.reportType;
  if (reportType === undefined) {
    reportType = fallbackReportType(intent.operation);
    normalizations.push({
      field: "reportType",
      from: undefined,
      to: reportType,
      reason: "missing_field",
    });
  }

  let depth = intent.depth;
  if (depth === undefined) {
    depth = fallbackDepth(instruction);
    normalizations.push({
      field: "depth",
      from: undefined,
      to: depth,
      reason: "missing_field",
    });
  }

  let outputForm = intent.outputForm;

  if (confidence.scope < INTENT_CONFIDENCE_THRESHOLD) {
    const from = scope;
    scope = "whole_document";
    confidence.scope = INTENT_CONFIDENCE_THRESHOLD;
    normalizations.push({
      field: "scope",
      from,
      to: scope,
      reason: "low_confidence",
    });
  }

  if (confidence.outputForm < INTENT_CONFIDENCE_THRESHOLD) {
    const from = outputForm;
    outputForm = outputFormFromReportSpec(reportType, depth, intent.operation);
    confidence.outputForm = INTENT_CONFIDENCE_THRESHOLD;
    normalizations.push({
      field: "outputForm",
      from,
      to: outputForm,
      reason: "low_confidence",
    });
  }

  let documentPresentation = intent.documentPresentation;
  if (documentPresentation === undefined) {
    documentPresentation = "unified";
    normalizations.push({
      field: "documentPresentation",
      from: undefined,
      to: documentPresentation,
      reason: "missing_field",
    });
  }

  return {
    intent: {
      ...intent,
      scope,
      outputForm,
      documentPresentation,
      reportType,
      depth,
      confidence,
    },
    normalizations,
  };
}

export { fallbackDepth, fallbackReportType, outputFormFromReportSpec };
