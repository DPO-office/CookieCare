import {

  executeJsonCompletion,

  LLMProvider,

  LLMTask,

} from "../../../../../llm/index.js";

import type { AnalysisState } from "../../../models/analysis-state.js";

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

  type ReportDepth,

  type ReportType,

  type ScopeAxis,

} from "../../../models/intent.js";

import {

  LEGAL_ADVICE_RE,

  heuristicClassify,

  refineScope,

} from "./intent-heuristics.js";

import {

  parseRequirementsFromRaw,
  expandArticleRangeRequirements,

  parseUnresolvedNeedsFromRaw,

  warnRequirementCoverageGuard,

} from "./intent-requirement-normalize.js";

import { emitAnalysisToken } from "../../../utils/stream-tokens.js";
import { SEMANTIC_INTENT_SYSTEM_PROMPT } from "../../../prompts/classify-intent.js";

import { pacLog } from "../../../utils/pac-log.js";
import { profileThinkingLevel } from "../../../utils/profile-thinking.js";
import { logIntentInspect } from "./plan-inspect-log.js";

import { classifyDocumentFromText } from "../act/classify-document.js";

import {
  normalizeStandard,
  resolveStandardConceptToRegistry,
} from "./resolve-standard.js";
import { conversationContextForIntent } from "../../../memory/conversation-window.js";
import {
  applyExplicitPresentation,
  followUpKindForState,
  inheritFollowUpIntent,
} from "./follow-up-intent.js";



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



const OUTPUT_FORM_ENUM = [

  "table",

  "checklist",

  "redline_diff",

  "memo",

  "qa_thread",

  "brief_summary",

] as const;

const REPORT_TYPE_ENUM = [

  "regime_compliance_memo",

  "risk_audit",

  "rights_matrix",

  "qa_answer",

  "extraction_table",

] as const;

const REPORT_DEPTH_ENUM = ["narrow", "standard", "deep"] as const;

const REQUIREMENT_TYPE_ENUM = [

  "verification",

  "adequacy",

  "extraction",

  "comparison",

  "coverage",

  "recommendation",

  "other",

] as const;

const REQUIREMENT_PRIORITY_ENUM = ["required", "supporting"] as const;

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

    standardConcept: { type: "string" },

    outputForm: {

      type: "string",

      enum: [...OUTPUT_FORM_ENUM],

    },

    reportType: {

      type: "string",

      enum: [...REPORT_TYPE_ENUM],

    },

    depth: {

      type: "string",

      enum: [...REPORT_DEPTH_ENUM],

    },

    compound: { type: "boolean" },

    requirements: {

      type: "array",

      items: {

        type: "object",

        properties: {

          id: { type: "string" },

          description: { type: "string" },

          type: { type: "string", enum: [...REQUIREMENT_TYPE_ENUM] },

          priority: { type: "string", enum: [...REQUIREMENT_PRIORITY_ENUM] },

        },

        required: ["id", "description", "type", "priority"],

      },

    },

    unresolvedNeeds: {

      type: "array",

      items: {

        type: "object",

        properties: {

          description: { type: "string" },

          reason: { type: "string" },

        },

        required: ["description", "reason"],

      },

    },

    subIntents: {

      type: "array",

      items: {

        type: "object",

        properties: {

          operation: { type: "string", enum: [...OPERATION_ENUM] },

          standard: { type: "string" },

          outputForm: { type: "string", enum: [...OUTPUT_FORM_ENUM] },

          reportType: { type: "string", enum: [...REPORT_TYPE_ENUM] },

          depth: { type: "string", enum: [...REPORT_DEPTH_ENUM] },

          description: { type: "string" },

          requirements: {

            type: "array",

            items: {

              type: "object",

              properties: {

                id: { type: "string" },

                description: { type: "string" },

                type: { type: "string", enum: [...REQUIREMENT_TYPE_ENUM] },

                priority: { type: "string", enum: [...REQUIREMENT_PRIORITY_ENUM] },

              },

              required: ["id", "description", "type", "priority"],

            },

          },

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

  required: [

    "scope",

    "operation",

    "standard",

    "outputForm",

    "compound",

    "confidence",

    "requirements",

    "unresolvedNeeds",

  ],

};



interface RawIntentClassification {

  scope: ScopeAxis;

  operation: OperationAxis;

  standard: string;

  standardConcept?: string;

  outputForm: OutputFormAxis;

  reportType?: ReportType;

  depth?: ReportDepth;

  compound: boolean;

  requirements?: unknown;

  unresolvedNeeds?: unknown;

  subIntents?: Array<{

    operation: OperationAxis;

    standard: string;

    outputForm: OutputFormAxis;

    reportType?: ReportType;

    depth?: ReportDepth;

    description?: string;

    requirements?: unknown;

  }>;

  confidence: IntentClassification["confidence"];

  outOfScopeReason?: string;

}



/**

 * Semantic intent resolver: preserves concrete user requirements, then classifies routing axes.

 * Legal-advice → out_of_scope (decline-and-redirect). Heuristic pre-gate on clear advisory asks.

 */

export async function classifyIntent(state: AnalysisState): Promise<AnalysisState> {

  const instruction = state.request.instruction.trim();
  const followUpKind = followUpKindForState(state);



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

      requirements: state.intent.requirements.length,

    });

    return { ...state, clarificationRequest: undefined };

  }



  if (LEGAL_ADVICE_RE.test(instruction)) {

    const intent: IntentClassification = {

      scope: "whole_document",

      operation: "out_of_scope",

      standard: "none",

      outputForm: "memo",

      reportType: "qa_answer",

      depth: "standard",

      compound: false,

      subIntents: [],

      requirements: [],

      unresolvedNeeds: [],

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

  if (followUpKind === "presentation_change" && state.priorAnalysis?.intent) {
    const intent = applyExplicitPresentation(
      inheritFollowUpIntent(
        applyExplicitPresentation(state.priorAnalysis.intent, instruction, state.request),
        state.priorAnalysis.intent,
        followUpKind
      ),
      instruction,
      state.request
    );
    pacLog("PLAN classify-intent follow-up presentation change", {
      outputForm: intent.outputForm,
      presentation: intent.documentPresentation,
    });
    logClassifiedIntent(intent, instruction);
    return { ...state, intent, declineMessage: undefined, clarificationRequest: undefined };
  }



  const { state: withDoc, docTypeHint, excerpt } = resolveDocTypeHint(state);

  state = withDoc;



  pacLog("PLAN classify-intent ▶ LLM", { docTypeHint, excerptChars: excerpt.length });

  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;

  let raw: RawIntentClassification;



  try {

    raw = (await executeJsonCompletion(

      buildIntentUserPrompt(
        instruction,
        docTypeHint,
        excerpt,
        state.request.documentIds,
        conversationContextForIntent({
          conversation: state.conversation,
          priorInstruction: state.priorAnalysis?.instruction,
          priorReport: state.priorAnalysis?.renderedOutput,
        })
      ),

      SEMANTIC_INTENT_SYSTEM_PROMPT,

      INTENT_SCHEMA,

      LLMTask.STRUCTURAL_JSON_LITE,

      LLMProvider.GEMINI,

      { tracker, thinkingLevel: profileThinkingLevel(state, LLMTask.STRUCTURAL_JSON_LITE) }

    )) as RawIntentClassification;

  } catch (err) {

    console.warn("[classifyIntent] LLM failed; heuristic fallback:", err);

    raw = {

      ...heuristicClassify(instruction),

      requirements: [],

      unresolvedNeeds: [],

    };

  }



  if (state.agent && tracker) {

    state.agent.tokensUsed = tracker.tokensUsed;

  }



  const requirements = expandArticleRangeRequirements(
    instruction,
    parseRequirementsFromRaw(raw.requirements)
  );

  const unresolvedNeeds = parseUnresolvedNeedsFromRaw(raw.unresolvedNeeds);

  warnRequirementCoverageGuard(instruction, raw.operation, requirements);



  const standardConcept = resolveStandardConcept(raw);

  const standardResult = resolveStandardFields(

    raw.standard,

    standardConcept,

    state.request.documentIds

  );

  const subIntents = normalizeSubIntents(raw.compound, raw.subIntents, state.request.documentIds);



  let intent: IntentClassification = {

    scope: refineScope(raw.scope, instruction),

    operation: raw.operation,

    standard: standardResult.standard,

    standardConcept: standardResult.standardConcept,

    outputForm: raw.outputForm,

    reportType: raw.reportType,

    depth: raw.depth,

    compound: Boolean(raw.compound) && subIntents.length > 1,

    subIntents: Boolean(raw.compound) ? subIntents : [],

    requirements,

    unresolvedNeeds,

    confidence: raw.confidence,

    outOfScopeReason:

      raw.operation === "out_of_scope"

        ? raw.outOfScopeReason || LEGAL_ADVICE_DECLINE_MESSAGE

        : undefined,

    suggestedReframes:

      raw.operation === "out_of_scope" ? LEGAL_ADVICE_REFRAMES : undefined,

    unresolvedStandard: standardResult.unresolvedStandard,

    docTypeHint,

  };

  intent = applyExplicitPresentation(intent, instruction, state.request);
  const resolvedFollowUpKind = followUpKindForState({ ...state, intent });
  intent = inheritFollowUpIntent(
    intent,
    state.priorAnalysis?.intent ?? undefined,
    resolvedFollowUpKind
  );



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



  const clarificationRequest =
    resolvedFollowUpKind === "conversational_qa" ||
    resolvedFollowUpKind === "presentation_change"
      ? undefined
      : buildClarificationQuestion(intent, docTypeHint);

  if (clarificationRequest) {

    pacLog("PLAN classify-intent ▶ low confidence, requesting clarification", {

      axes: clarificationRequest.axes.join(","),

      docTypeHint,

    });

    return { ...state, intent, declineMessage: undefined, clarificationRequest };

  }



  logClassifiedIntent(intent, instruction);

  return { ...state, intent, declineMessage: undefined, clarificationRequest: undefined };

}



export { normalizeStandard } from "./resolve-standard.js";

export {

  normalizeRequirements,

  normalizeUnresolvedNeeds,

  warnRequirementCoverageGuard,

} from "./intent-requirement-normalize.js";



function buildIntentUserPrompt(

  instruction: string,

  docTypeHint: string,

  excerpt: string,

  documentIds: string[],

  conversationContext = ""

): string {

  return [

    "Resolve the user's document-analysis intent.",

    "",

    `Detected document type (hint, not a hard constraint): ${docTypeHint}`,

    excerpt

      ? [

          "Document excerpt (context for disambiguating the user's request — do not infer new requirements merely because the excerpt contains related clauses):",

          excerpt,

        ].join("\n")

      : "No document excerpt available.",

    "",

    conversationContext || "No prior conversation.",

    "",

    "If the user asks for legal advice (sign/win/outcome prediction), set operation=out_of_scope.",

    "",

    "reportType describes deliverable shape: regime_compliance_memo for structured compliance review; risk_audit for risk/exposure identification; rights_matrix for rights/obligations mapping; qa_answer for focused Q&A; extraction_table for pure extraction.",

    "",

    "Use outputForm=brief_summary when the user asks for a brief/concise overview. Keep outputForm for backward compatibility; reportType+depth are the semantic source of truth.",

    "Use outputForm=table for tabular requests and outputForm=memo for narrative/prose requests.",

    "",

    `Current user message: ${instruction}`,

    `Documents available: ${documentIds.join(", ") || "none"}`,

  ].join("\n\n");

}



function resolveStandardConcept(raw: RawIntentClassification): string | undefined {

  const concept =

    typeof raw.standardConcept === "string" ? raw.standardConcept.trim() : "";

  if (concept) return concept;



  const standard = typeof raw.standard === "string" ? raw.standard.trim() : "";

  if (!standard || standard === "none") return undefined;



  const colon = standard.indexOf(":");

  if (colon < 0) return standard;

  return undefined;

}



function resolveStandardFields(

  rawStandard: string,

  standardConcept: string | undefined,

  documentIds: string[]

): {

  standard: IntentClassification["standard"];

  standardConcept?: string;

  unresolvedStandard?: string;

} {

  const trimmed = typeof rawStandard === "string" ? rawStandard.trim() : "";

  const normalized = normalizeStandard(trimmed, documentIds);



  if (normalized.standard !== "none") {

    return {

      standard: normalized.standard,

      standardConcept,

      unresolvedStandard: normalized.unresolved,

    };

  }

  // The LLM understands the standard semantically (standardConcept) but may
  // leave the registry identifier as "none" rather than fabricate one. Bridge
  // that gap deterministically: map the concept onto an existing registry
  // regime pack. Never invents an ID — only returns validated packs.

  const fromConcept = resolveStandardConceptToRegistry(standardConcept);

  if (fromConcept.standard !== "none") {

    return {

      standard: fromConcept.standard,

      standardConcept,

      unresolvedStandard: normalized.unresolved,

    };

  }



  if (normalized.unresolved) {

    return {

      standard: "none",

      standardConcept: standardConcept ?? normalized.unresolved,

      unresolvedStandard: normalized.unresolved,

    };

  }



  return {

    standard: "none",

    standardConcept,

  };

}



function logClassifiedIntent(intent: IntentClassification, instruction: string): void {
  logIntentInspect(intent, instruction);
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

      options: ["none", "privacy", "commercial", "general-review"],

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



function normalizeSubIntents(

  compound: boolean,

  raw: Array<{

    operation: OperationAxis;

    standard: string;

    outputForm: OutputFormAxis;

    reportType?: ReportType;

    depth?: ReportDepth;

    description?: string;

    requirements?: unknown;

  }> = [],

  documentIds: string[]

): IntentSubIntent[] {

  if (!compound || !raw.length) return [];

  return raw.map((si) => {

    const std = normalizeStandard(si.standard, documentIds);

    const subRequirements = parseRequirementsFromRaw(si.requirements);

    return {

      operation: si.operation,

      standard: std.standard,

      outputForm: si.outputForm,

      reportType: si.reportType,

      depth: si.depth,

      description: si.description,

      requirements: subRequirements.length > 0 ? subRequirements : undefined,

    };

  });

}


