import type {
  AnswerStyle,
  IntentClassification,
  OutputFormAxis,
  ReportType,
} from "../../models/intent.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import {
  classifyFollowUpKind,
  isNarrativeInstruction,
  isTabularInstruction,
  type FollowUpKind,
} from "./intent-heuristics.js";

export function followUpKindForState(state: AnalysisState): FollowUpKind {
  const kind = classifyFollowUpKind({
    instruction: state.request.instruction,
    hasPriorConversation: Boolean(state.conversation?.turns.length),
    hasPriorFindings: Boolean(
      (state.priorAnalysis?.findings.length ?? 0) > 0 ||
        (state.priorAnalysis?.requirementAssessments?.length ?? 0) > 0
    ),
  });

  const prior = state.priorAnalysis?.intent;
  const current = state.intent;
  if (
    prior &&
    current &&
    (kind === "conversational_qa" || kind === "presentation_change") &&
    isMaterialTopicShift(prior, current)
  ) {
    return "new_analysis";
  }

  return kind;
}

/** True when the follow-up asks for a substantively different review than the prior run. */
export function isMaterialTopicShift(
  prior: IntentClassification,
  current: IntentClassification
): boolean {
  if (
    prior.standard !== current.standard &&
    current.standard !== "none" &&
    prior.standard !== "none"
  ) {
    return true;
  }

  const priorConcept = normalizeConcept(prior.standardConcept);
  const currentConcept = normalizeConcept(current.standardConcept);
  if (
    priorConcept &&
    currentConcept &&
    priorConcept !== currentConcept &&
    !priorConcept.includes(currentConcept) &&
    !currentConcept.includes(priorConcept)
  ) {
    return true;
  }

  const priorReqIds = new Set((prior.requirements ?? []).map((req) => req.id));
  const currentReqIds = (current.requirements ?? []).map((req) => req.id);
  if (currentReqIds.length === 0) {
    return false;
  }

  const overlap = currentReqIds.filter((id) => priorReqIds.has(id)).length;
  if (overlap === 0) {
    if (
      current.operation === "explain_qa" &&
      (current.standard === "none" ||
        prior.standard === "none" ||
        current.standard === prior.standard)
    ) {
      return false;
    }
    return true;
  }

  if (
    current.operation !== "explain_qa" &&
    current.operation !== prior.operation &&
    ["compliance_check", "risk_flag", "extract", "compare", "summarize"].includes(
      current.operation
    )
  ) {
    return overlap < currentReqIds.length;
  }

  return false;
}

function normalizeConcept(value?: string): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * UI selection and explicit wording beat the classifier. Current-turn text
 * beats the Analyze-options toggle.
 */
export function applyExplicitPresentation(
  intent: IntentClassification,
  instruction: string,
  request: {
    answerStyle?: AnswerStyle;
  }
): IntentClassification {
  let outputForm = intent.outputForm;
  let reportType = intent.reportType;
  let confidence = { ...intent.confidence };

  if (request.answerStyle === "tabular" && !isNarrativeInstruction(instruction)) {
    outputForm = "table";
    confidence = { ...confidence, outputForm: 1 };
    reportType = reportTypeForTable(intent, reportType);
  } else if (request.answerStyle === "narrative" && !isTabularInstruction(instruction)) {
    if (outputForm === "table" || outputForm === "checklist") {
      outputForm = "memo";
    }
    confidence = { ...confidence, outputForm: Math.max(confidence.outputForm, 0.9) };
  }

  if (isTabularInstruction(instruction)) {
    outputForm = "table";
    confidence = { ...confidence, outputForm: 1 };
    reportType = reportTypeForTable(intent, reportType);
  } else if (isNarrativeInstruction(instruction)) {
    outputForm = outputForm === "brief_summary" ? "brief_summary" : "memo";
    confidence = { ...confidence, outputForm: 1 };
    if (reportType === "extraction_table") {
      reportType = fallbackMemoReportType(intent);
    }
  }

  return { ...intent, outputForm, reportType, confidence };
}

export function inheritFollowUpIntent(
  current: IntentClassification,
  prior: IntentClassification | undefined,
  kind: FollowUpKind
): IntentClassification {
  if (!prior || kind === "none") return current;

  if (kind === "presentation_change") {
    return {
      ...prior,
      outputForm: current.outputForm,
      reportType: reportTypeForOutputForm(current.outputForm, current.reportType ?? prior.reportType, prior),
      confidence: {
        ...prior.confidence,
        outputForm: 1,
      },
    };
  }

  const next: IntentClassification = { ...current };

  if (
    (current.standard === "none" || !current.standard) &&
    prior.standard &&
    prior.standard !== "none"
  ) {
    next.standard = prior.standard;
    next.standardConcept = current.standardConcept || prior.standardConcept;
    next.unresolvedStandard = current.unresolvedStandard ?? prior.unresolvedStandard;
    next.confidence = {
      ...next.confidence,
      standard: Math.max(next.confidence.standard, prior.confidence.standard),
    };
  }

  if (kind === "conversational_qa") {
    if (!current.requirements.length && prior.requirements.length) {
      next.requirements = prior.requirements;
    }
    if (current.operation === "explain_qa" || current.confidence.operation < 0.7) {
      next.operation = "explain_qa";
      next.reportType = current.outputForm === "table" ? "extraction_table" : "qa_answer";
      next.confidence = { ...next.confidence, operation: 1 };
    }
  }

  return next;
}

function reportTypeForTable(
  intent: IntentClassification,
  reportType: ReportType | undefined
): ReportType | undefined {
  if (intent.operation === "extract") return "extraction_table";
  return reportType;
}

function fallbackMemoReportType(intent: IntentClassification): ReportType {
  if (intent.operation === "risk_flag") return "risk_audit";
  if (intent.operation === "compliance_check") return "regime_compliance_memo";
  return "qa_answer";
}

function reportTypeForOutputForm(
  outputForm: OutputFormAxis,
  fallback: ReportType | undefined,
  prior: IntentClassification
): ReportType | undefined {
  if (outputForm === "table") {
    return prior.operation === "extract" ? "extraction_table" : fallback;
  }
  if (outputForm === "memo" && fallback === "extraction_table") {
    return fallbackMemoReportType(prior);
  }
  return fallback;
}
