import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import {
  LEGAL_ADVICE_DECLINE_MESSAGE,
  LEGAL_ADVICE_REFRAMES,
  type IntentClassification,
  type OperationAxis,
  type OutputFormAxis,
  type ScopeAxis,
  type StandardAxis,
} from "../../models/intent.js";
import { LEGAL_ADVICE_RE, heuristicClassify } from "./intent-heuristics.js";
import { emitAnalysisToken } from "../../utils/stream-tokens.js";

export { heuristicClassify, LEGAL_ADVICE_RE } from "./intent-heuristics.js";

const INTENT_SCHEMA = {
  type: "object",
  properties: {
    scope: {
      type: "string",
      enum: ["whole_document", "named_section", "cross_cutting_theme", "cross_document"],
    },
    operation: {
      type: "string",
      enum: [
        "extract",
        "risk_flag",
        "compliance_check",
        "compare",
        "summarize",
        "explain_qa",
        "draft_suggestion",
        "out_of_scope",
      ],
    },
    standard: { type: "string" },
    outputForm: {
      type: "string",
      enum: ["table", "checklist", "redline_diff", "memo", "qa_thread"],
    },
    compound: { type: "boolean" },
    confidence: {
      type: "object",
      properties: {
        scope: { type: "number" },
        operation: { type: "number" },
        standard: { type: "number" },
        outputForm: { type: "number" },
      },
      required: ["scope", "operation", "standard", "outputForm"],
    },
    outOfScopeReason: { type: "string" },
  },
  required: ["scope", "operation", "standard", "outputForm", "compound", "confidence"],
};

/**
 * Closed-taxonomy intent classification. Legal-advice → out_of_scope (decline-and-redirect).
 * Heuristic pre-gate avoids LLM guesswork on clear advisory asks.
 */
export async function classifyIntent(state: AnalysisState): Promise<AnalysisState> {
  const instruction = state.request.instruction.trim();

  if (LEGAL_ADVICE_RE.test(instruction)) {
    const intent: IntentClassification = {
      scope: "whole_document",
      operation: "out_of_scope",
      standard: "none",
      outputForm: "memo",
      compound: false,
      subIntents: [],
      confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
      outOfScopeReason: LEGAL_ADVICE_DECLINE_MESSAGE,
      suggestedReframes: LEGAL_ADVICE_REFRAMES,
    };
    const declineMessage = formatDecline(intent);
    emitAnalysisToken(state, declineMessage);
    return {
      ...state,
      intent,
      declineMessage,
    };
  }

  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  let raw: {
    scope: ScopeAxis;
    operation: OperationAxis;
    standard: string;
    outputForm: OutputFormAxis;
    compound: boolean;
    confidence: IntentClassification["confidence"];
    outOfScopeReason?: string;
  };

  try {
    raw = await executeJsonCompletion(
      [
        "Classify this document-analysis instruction into the closed taxonomy.",
        "If the user asks for legal advice (sign/win/outcome prediction), set operation=out_of_scope.",
        "standard must be 'none' or 'regime_pack:<id>' / 'playbook_rule:<id>' / 'reference_document:<id>'.",
        `Instruction: ${instruction}`,
        `Documents available: ${state.request.documentIds.join(", ") || "none"}`,
      ].join("\n\n"),
      "You are a strict intent classifier for a compliance analysis product. Never invent taxonomy values.",
      INTENT_SCHEMA,
      LLMTask.STRUCTURAL_JSON_LITE,
      LLMProvider.GEMINI,
      tracker
    );
  } catch (err) {
    console.warn("[classifyIntent] LLM failed; heuristic fallback:", err);
    raw = heuristicClassify(instruction);
  }

  if (state.agent && tracker) {
    state.agent.tokensUsed = tracker.tokensUsed;
  }

  const standard = normalizeStandard(raw.standard);
  const intent: IntentClassification = {
    scope: raw.scope,
    operation: raw.operation,
    standard,
    outputForm: raw.outputForm,
    compound: Boolean(raw.compound),
    subIntents: [],
    confidence: raw.confidence,
    outOfScopeReason:
      raw.operation === "out_of_scope"
        ? raw.outOfScopeReason || LEGAL_ADVICE_DECLINE_MESSAGE
        : undefined,
    suggestedReframes:
      raw.operation === "out_of_scope" ? LEGAL_ADVICE_REFRAMES : undefined,
  };

  if (intent.operation === "out_of_scope") {
    const declineMessage = formatDecline(intent);
    emitAnalysisToken(state, declineMessage);
    return {
      ...state,
      intent,
      declineMessage,
    };
  }

  return { ...state, intent, declineMessage: undefined };
}

function formatDecline(intent: IntentClassification): string {
  const reframes = (intent.suggestedReframes ?? LEGAL_ADVICE_REFRAMES)
    .map((r) => `- ${r}`)
    .join("\n");
  return `${intent.outOfScopeReason ?? LEGAL_ADVICE_DECLINE_MESSAGE}\n\nSuggested reframes:\n${reframes}`;
}

function normalizeStandard(s: string): StandardAxis {
  if (!s || s === "none") return "none";
  if (
    s.startsWith("regime_pack:") ||
    s.startsWith("playbook_rule:") ||
    s.startsWith("reference_document:")
  ) {
    return s as StandardAxis;
  }
  return "none";
}
