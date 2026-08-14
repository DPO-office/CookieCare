import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import {
  INTENT_CONFIDENCE_THRESHOLD,
  LEGAL_ADVICE_DECLINE_MESSAGE,
  LEGAL_ADVICE_REFRAMES,
  type ClarificationAxis,
  type ClarificationRequest,
  type IntentClassification,
  type IntentSubIntent,
  type OperationAxis,
  type OutputFormAxis,
  type ScopeAxis,
  type StandardAxis,
} from "../../models/intent.js";
import { LEGAL_ADVICE_RE, heuristicClassify } from "./intent-heuristics.js";
import { emitAnalysisToken } from "../../utils/stream-tokens.js";
import { pacLog } from "../../utils/pac-log.js";
import { classifyDocumentFromText } from "../act/classify-document.js";
import { hasPlaybookRule, hasRegimeRule } from "../../skills/registry.js";

export { heuristicClassify, LEGAL_ADVICE_RE } from "./intent-heuristics.js";

const OPERATION_ENUM = [
  "extract",
  "risk_flag",
  "compliance_check",
  "compare",
  "summarize",
  "explain_qa",
  "draft_suggestion",
  "out_of_scope",
] as const;

const OUTPUT_FORM_ENUM = ["table", "checklist", "redline_diff", "memo", "qa_thread"] as const;
const DOC_EXCERPT_CHARS = 4000;

const INTENT_SCHEMA = {
  type: "object",
  properties: {
    scope: {
      type: "string",
      enum: ["whole_document", "named_section", "cross_cutting_theme", "cross_document"],
    },
    operation: {
      type: "string",
      enum: [...OPERATION_ENUM],
    },
    standard: { type: "string" },
    outputForm: {
      type: "string",
      enum: [...OUTPUT_FORM_ENUM],
    },
    compound: { type: "boolean" },
    subIntents: {
      type: "array",
      items: {
        type: "object",
        properties: {
          operation: { type: "string", enum: [...OPERATION_ENUM] },
          standard: { type: "string" },
          outputForm: { type: "string", enum: [...OUTPUT_FORM_ENUM] },
          description: { type: "string" },
        },
        required: ["operation", "standard", "outputForm"],
      },
    },
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

  if (
    state.entryMode === "RESUME" &&
    state.intent &&
    state.intent.operation !== "out_of_scope" &&
    state.intent.confidence.operation >= INTENT_CONFIDENCE_THRESHOLD &&
    (state.intent.confidence.standard >= INTENT_CONFIDENCE_THRESHOLD ||
      Boolean(state.intent.unresolvedStandard))
  ) {
    pacLog("PLAN classify-intent skip (resume with resolved intent)", {
      op: state.intent.operation,
      standard: state.intent.standard,
    });
    return { ...state, clarificationRequest: undefined };
  }

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
      clarificationRequest: undefined,
    };
  }

  const { state: withDoc, docTypeHint, excerpt } = resolveDocTypeHint(state);
  state = withDoc;

  pacLog("PLAN classify-intent ▶ LLM", { docTypeHint, excerptChars: excerpt.length });
  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  let raw: {
    scope: ScopeAxis;
    operation: OperationAxis;
    standard: string;
    outputForm: OutputFormAxis;
    compound: boolean;
    subIntents?: Array<{
      operation: OperationAxis;
      standard: string;
      outputForm: OutputFormAxis;
      description?: string;
    }>;
    confidence: IntentClassification["confidence"];
    outOfScopeReason?: string;
  };

  try {
    raw = await executeJsonCompletion(
      [
        "Classify this document-analysis instruction into the closed taxonomy.",
        `Detected document type (hint, not a hard constraint): ${docTypeHint}`,
        excerpt
          ? `Document excerpt (use to disambiguate the instruction; do not invent clauses):\n${excerpt}`
          : "No document excerpt available.",
        "If the user asks for legal advice (sign/win/outcome prediction), set operation=out_of_scope.",
        "standard must be 'none' or 'regime_pack:<id>' / 'playbook_rule:<id>' / 'reference_document:<id>'.",
        "Use known ids when possible (e.g. regime_pack:privacy-gdpr-dpa, regime_pack:gdpr.art28.3.e).",
        "If compound=true, populate subIntents with one entry per distinct request",
        "(e.g. 'check GDPR compliance AND flag general risks' → two subIntents).",
        "If compound=false, subIntents must be empty or omitted.",
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

  const standardResult = normalizeStandard(raw.standard, state.request.documentIds);
  const subIntents = normalizeSubIntents(raw.compound, raw.subIntents, state.request.documentIds);

  const intent: IntentClassification = {
    scope: raw.scope,
    operation: raw.operation,
    standard: standardResult.standard,
    outputForm: raw.outputForm,
    compound: Boolean(raw.compound) && subIntents.length > 1,
    subIntents: Boolean(raw.compound) ? subIntents : [],
    confidence: raw.confidence,
    outOfScopeReason:
      raw.operation === "out_of_scope"
        ? raw.outOfScopeReason || LEGAL_ADVICE_DECLINE_MESSAGE
        : undefined,
    suggestedReframes:
      raw.operation === "out_of_scope" ? LEGAL_ADVICE_REFRAMES : undefined,
    unresolvedStandard: standardResult.unresolved,
    docTypeHint,
  };

  if (intent.operation === "out_of_scope") {
    const declineMessage = formatDecline(intent);
    emitAnalysisToken(state, declineMessage);
    pacLog("PLAN classify-intent out_of_scope");
    return {
      ...state,
      intent,
      declineMessage,
      clarificationRequest: undefined,
    };
  }

  const clarificationRequest = buildClarificationQuestion(intent, docTypeHint);
  if (clarificationRequest) {
    pacLog("PLAN classify-intent ▶ low confidence, requesting clarification", {
      axes: clarificationRequest.axes.join(","),
      docTypeHint,
    });
    return { ...state, intent, declineMessage: undefined, clarificationRequest };
  }

  pacLog("PLAN classify-intent ✓", {
    op: intent.operation,
    form: intent.outputForm,
    scope: intent.scope,
    compound: intent.compound ? "yes" : "no",
    subIntents: intent.subIntents.length,
    standard: intent.standard,
    unresolved: intent.unresolvedStandard ?? "-",
  });
  return { ...state, intent, declineMessage: undefined, clarificationRequest: undefined };
}

export function buildClarificationQuestion(
  intent: IntentClassification,
  docTypeHint?: string
): ClarificationRequest | undefined {
  const axes = (["operation", "standard"] as const).filter(
    (axis) => intent.confidence[axis] < INTENT_CONFIDENCE_THRESHOLD
  );
  if (axes.length === 0) return undefined;

  const questions: ClarificationRequest["questions"] = [];
  if (axes.includes("operation")) {
    questions.push({
      field: "operation",
      question: docTypeHint && docTypeHint !== "unknown"
        ? `This looks like a ${docTypeHint}. What should we do: flag risks, check compliance, extract clauses, summarize, or compare?`
        : "What should we do: flag risks, check compliance, extract clauses, summarize, or compare?",
      options: ["risk_flag", "compliance_check", "extract", "summarize", "compare"],
    });
  }
  if (axes.includes("standard")) {
    questions.push({
      field: "standard",
      question: "Which standard should we use (none / a known skill pack)?",
      options: ["none", "privacy-gdpr-dpa", "commercial", "general-review"],
    });
  }
  return { axes: axes as ClarificationAxis[], questions, docTypeHint };
}

/**
 * Prefer session-cached docType; otherwise run cheap deterministic classify once.
 * Also returns a short excerpt so the classifier can see the document, not only a type label.
 */
export function resolveDocTypeHint(state: AnalysisState): {
  state: AnalysisState;
  docTypeHint: string;
  excerpt: string;
} {
  const docId = state.request.documentIds[0];
  if (!docId) return { state, docTypeHint: "unknown", excerpt: "" };

  const existing = state.workspace.documents.find((d) => d.docId === docId);
  const text = state.request.documentTexts[docId] ?? existing?.fullText ?? "";
  const excerpt = text.slice(0, DOC_EXCERPT_CHARS);

  if (existing?.docType && existing.docType !== "unknown") {
    return { state, docTypeHint: existing.docType, excerpt };
  }

  if (!text) return { state, docTypeHint: existing?.docType ?? "unknown", excerpt: "" };

  const docType = classifyDocumentFromText(text);
  const documents = state.workspace.documents.some((d) => d.docId === docId)
    ? state.workspace.documents.map((d) =>
        d.docId === docId
          ? { ...d, docType, role: "primary" as const, fullText: d.fullText || text }
          : d
      )
    : [
        ...state.workspace.documents,
        {
          docId,
          fullText: text,
          segments: [],
          clauses: [],
          docType,
          role: "primary" as const,
          title: state.request.documentTitles?.[docId],
        },
      ];

  return {
    state: { ...state, workspace: { ...state.workspace, documents } },
    docTypeHint: docType,
    excerpt,
  };
}

function formatDecline(intent: IntentClassification): string {
  const reframes = (intent.suggestedReframes ?? LEGAL_ADVICE_REFRAMES)
    .map((r) => `- ${r}`)
    .join("\n");
  return `${intent.outOfScopeReason ?? LEGAL_ADVICE_DECLINE_MESSAGE}\n\nSuggested reframes:\n${reframes}`;
}

export function normalizeStandard(
  s: string,
  documentIds: string[] = []
): { standard: StandardAxis; unresolved?: string } {
  if (!s || s === "none") return { standard: "none" };

  const colon = s.indexOf(":");
  if (colon < 0) return { standard: "none", unresolved: s };

  const kind = s.slice(0, colon);
  const id = s.slice(colon + 1).trim();
  if (!id) return { standard: "none", unresolved: s };

  if (kind === "regime_pack") {
    if (hasRegimeRule(id)) return { standard: `regime_pack:${id}` };
    return { standard: "none", unresolved: s };
  }
  if (kind === "playbook_rule") {
    if (hasPlaybookRule(id)) return { standard: `playbook_rule:${id}` };
    return { standard: "none", unresolved: s };
  }
  if (kind === "reference_document") {
    if (documentIds.includes(id)) return { standard: `reference_document:${id}` };
    return { standard: "none", unresolved: s };
  }

  return { standard: "none", unresolved: s };
}

function normalizeSubIntents(
  compound: boolean,
  raw: Array<{
    operation: OperationAxis;
    standard: string;
    outputForm: OutputFormAxis;
    description?: string;
  }> = [],
  documentIds: string[]
): IntentSubIntent[] {
  if (!compound || !raw.length) return [];
  return raw.map((si) => {
    const std = normalizeStandard(si.standard, documentIds);
    return {
      operation: si.operation,
      standard: std.standard,
      outputForm: si.outputForm,
      description: si.description,
    };
  });
}
