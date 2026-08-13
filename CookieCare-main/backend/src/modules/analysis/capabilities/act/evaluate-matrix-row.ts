import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding, MatrixAddressing } from "../../models/finding.js";
import type { DraftTask } from "../../models/draft-task.js";
import type { ClauseObject } from "../../models/clause-object.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { insufficient } from "./act-utils.js";

const PREFERRED_CLAUSE_TYPES = [
  "data_subject_request_handling",
  "processor_assistance_obligation",
  "data_protection",
];

/**
 * Evaluate one rights-matrix row against extracted clauses.
 */
export async function evaluateMatrixRow(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): Promise<{ state: AnalysisState; findings: Finding[] }> {
  const docId = String(unit.input.docId ?? "");
  const rowId = String(unit.input.rowId ?? "");
  const article = String(unit.input.article ?? "");
  const label = String(unit.input.label ?? rowId);
  const instruction = String(unit.input.instruction ?? state.request.instruction ?? "");
  const skillId = state.activeSkillIds?.[0];

  const doc = state.workspace.documents.find((d) => d.docId === docId);
  if (!doc) {
    return {
      state,
      findings: [...findings, insufficient(unit, `Document ${docId} missing for matrix row ${rowId}`)],
    };
  }

  const clauses = selectRelevantClauses(doc.clauses ?? []);
  if (clauses.length === 0) {
    const finding: Finding = {
      findingId: `f_matrix_${rowId}_${unit.workUnitId}`,
      kind: "compliance",
      category: categoryForRow(rowId),
      status: "insufficient_evidence",
      claim: `No DSR/assistance clauses available to evaluate Article ${article} (${label}).`,
      evidence: [],
      severity: "medium",
      taxonomyVersion: RISK_TAXONOMY_VERSION,
      workUnitId: unit.workUnitId,
      skillId,
      visibility: "user_facing",
      matrixRowId: rowId,
      matrixAddressing: "absent",
      gap: "Insufficient extract to classify this right.",
    };
    return { state, findings: [...findings, finding] };
  }

  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  const schema = {
    type: "object",
    properties: {
      addressing: { type: "string", enum: ["named", "generic", "absent"] },
      claim: { type: "string" },
      gap: { type: "string" },
      clauseId: { type: "string" },
      quotedText: { type: "string" },
      severity: { type: "string", enum: ["low", "medium", "high"] },
      remedialInstruction: { type: "string" },
    },
    required: ["addressing", "claim", "severity"],
  };

  let raw: {
    addressing: MatrixAddressing;
    claim: string;
    gap?: string;
    clauseId?: string;
    quotedText?: string;
    severity: "low" | "medium" | "high";
    remedialInstruction?: string;
  };

  try {
    raw = await executeJsonCompletion(
      [
        `Evaluate how this agreement addresses GDPR Article ${article} (${label}).`,
        `User instruction: ${instruction}`,
        "addressing=named if the right is expressly named or clearly described.",
        "addressing=generic if only a catch-all 'data subject request' / cooperation clause covers it.",
        "addressing=absent if the right is not addressed at all.",
        "quotedText must be copied VERBATIM from a clause when addressing is named or generic.",
        `Clauses:\n${JSON.stringify(
          clauses.map((c) => ({
            clauseId: c.clauseId,
            clauseType: c.clauseType,
            text: c.text.slice(0, 2500),
          }))
        )}`,
      ].join("\n\n"),
      "You map one GDPR data-subject right to contract text. Do not invent clauses.",
      schema,
      LLMTask.STRUCTURAL_JSON,
      LLMProvider.GEMINI,
      tracker
    );
  } catch (err) {
    console.warn("[evaluateMatrixRow] LLM failed:", err);
    raw = {
      addressing: "absent",
      claim: `Could not determine whether Article ${article} (${label}) is addressed (LLM unavailable).`,
      gap: "Insufficient evidence to classify this right.",
      severity: "medium",
    };
  }

  if (state.agent && tracker) {
    state.agent.tokensUsed = tracker.tokensUsed;
  }

  const clause = clauses.find((c) => c.clauseId === raw.clauseId);
  const quote =
    raw.quotedText && clause?.text.includes(raw.quotedText)
      ? raw.quotedText
      : raw.quotedText && doc.fullText.includes(raw.quotedText)
        ? raw.quotedText
        : clause?.text.slice(0, 400);

  const status =
    raw.addressing === "absent"
      ? ("absent_expected" as const)
      : quote
        ? ("present" as const)
        : ("insufficient_evidence" as const);

  const finding: Finding = {
    findingId: `f_matrix_${rowId}_${unit.workUnitId}`,
    kind: "compliance",
    category: categoryForRow(rowId),
    status,
    claim: raw.claim,
    evidence:
      quote && clause
        ? [{ locator: clause.locator, quotedText: quote }]
        : quote
          ? [
              {
                locator: {
                  docId,
                  structuralPath: "data-subject-rights",
                  charRange: [0, Math.min(quote.length, doc.fullText.length)] as [number, number],
                },
                quotedText: quote,
              },
            ]
          : [],
    severity: raw.severity,
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: unit.workUnitId,
    skillId,
    visibility: "user_facing",
    matrixRowId: rowId,
    matrixAddressing: raw.addressing,
    gap: raw.gap,
  };

  let nextState = state;
  if (raw.addressing !== "named") {
    const locator =
      clause?.locator ??
      clauses[0]?.locator ??
      ({
        docId,
        structuralPath: "data-subject-rights",
        charRange: [0, Math.min(80, doc.fullText.length)] as [number, number],
      });
    const task: DraftTask = {
      sourceFindingId: finding.findingId,
      clauseLocator: locator,
      evidence: finding.evidence,
      reason: raw.gap || `Article ${article} (${label}) is not expressly addressed.`,
      instruction:
        raw.remedialInstruction ??
        `Add controller-side language that expressly addresses GDPR Article ${article} (${label}), including any processor assistance, timeframe, and format obligations that apply.`,
    };
    nextState = { ...state, draftTasks: [...(state.draftTasks ?? []), task] };
  }

  return { state: nextState, findings: [...findings, finding] };
}

function selectRelevantClauses(clauses: ClauseObject[]): ClauseObject[] {
  const preferred = clauses.filter((c) => PREFERRED_CLAUSE_TYPES.includes(c.clauseType));
  return preferred.length > 0 ? preferred : clauses.slice(0, 12);
}

function categoryForRow(rowId: string): string {
  if (rowId.includes("erasure")) return "erasure_termination_only_gap";
  if (rowId.includes("portability")) return "portability_format_unaddressed";
  if (rowId.includes("automated")) return "automated_decision_gap";
  if (rowId.includes("notification")) return "recipient_notification_gap";
  return "dsr_generic_no_named_rights";
}
