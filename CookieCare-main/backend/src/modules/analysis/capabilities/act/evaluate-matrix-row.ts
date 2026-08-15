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
import { loadSkillMdSection } from "../../skills/load-skill-md.js";
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
  const skillIds = (unit.input.skillIds as string[]) ?? state.activeSkillIds ?? [];
  const skillId =
    skillIds.find((id) => id.includes("gdpr")) ?? skillIds[0] ?? state.activeSkillIds?.[0];

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
      ruleSourceTier: "B",
    };
    return { state, findings: [...findings, finding] };
  }

  const matrixSection =
    (skillId ? await loadSkillMdSection(skillId, `matrix:${rowId}`) : null) ??
    (await loadSkillMdSection("regimes/data-protection/gdpr", `matrix:${rowId}`)) ??
    "";

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
      justification: { type: "string" },
    },
    required: ["addressing", "claim", "severity", "justification"],
  };

  let raw: {
    addressing: MatrixAddressing;
    claim: string;
    gap?: string;
    clauseId?: string;
    quotedText?: string;
    severity: "low" | "medium" | "high";
    remedialInstruction?: string;
    justification?: string;
  };

  try {
    raw = await executeJsonCompletion(
      [
        `Evaluate how this agreement addresses GDPR Article ${article} (${label}).`,
        `User instruction: ${instruction}`,
        matrixSection
          ? `Contrastive examples for this row (authored — use these to choose Named vs Generic vs Absent):\n${matrixSection}`
          : [
              "addressing=named if the right is expressly named or clearly described.",
              "addressing=generic if only a catch-all 'data subject request' / cooperation clause covers it.",
              "addressing=absent if the right is not addressed at all.",
            ].join("\n"),
        "You MUST justify addressing against the Named vs Generic examples above — do not default to Generic without justification.",
        rowId === "gdpr.right.automated_decisions"
          ? "For Article 22, do not assert a confirmed AI or automated-decision gap unless the clauses evidence solely automated decision-making, profiling, algorithmic decisions, or related safeguards. If none appears, state that applicability is unconfirmed and hedge any recommendation conditionally."
          : "",
        "quotedText must be copied VERBATIM from a clause when addressing is named or generic.",
        `Clauses:\n${JSON.stringify(
          clauses.map((c) => ({
            clauseId: c.clauseId,
            clauseType: c.clauseType,
            text: c.text.slice(0, 2500),
          }))
        )}`,
      ].join("\n\n"),
      "You map one GDPR data-subject right to contract text. Do not invent clauses. Force a justified Named/Generic/Absent choice.",
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
      justification: "LLM unavailable",
    };
  }

  if (state.agent && tracker) {
    state.agent.tokensUsed = tracker.tokensUsed;
  }

  const lacksAutomatedDecisionContext =
    rowId === "gdpr.right.automated_decisions" &&
    !hasAutomatedDecisionContext(doc.fullText);
  if (lacksAutomatedDecisionContext) {
    raw = {
      addressing: "absent",
      claim:
        "The agreement contains no language showing that solely automated decision-making with legal or similarly significant effects is involved. If such processing is in scope, Article 22 exceptions and safeguards should be addressed.",
      gap:
        "Insufficient evidence to confirm that Article 22 applies; add safeguards only if qualifying automated decision-making is involved.",
      severity: "medium",
      justification:
        "No automated-decision, profiling, algorithmic-decision, human-review, or Article 22 language was found in the source document.",
    };
  }

  const clause =
    (raw.clauseId && clauses.find((c) => c.clauseId === raw.clauseId)) ||
    clauses[0];
  const quote = raw.quotedText?.trim();
  const claimWithJustification = raw.justification
    ? `${raw.claim} (Justification: ${raw.justification})`
    : raw.claim;

  const finding: Finding = {
    findingId: `f_matrix_${rowId}_${unit.workUnitId}`,
    kind: "compliance",
    category: categoryForRow(rowId),
    status:
      lacksAutomatedDecisionContext
        ? "insufficient_evidence"
        : raw.addressing === "absent"
        ? "absent_expected"
        : raw.addressing === "generic"
          ? "present"
          : "present",
    claim: claimWithJustification,
    evidence:
      quote && clause
        ? [{ locator: clause.locator, quotedText: quote, sourceRole: "target" }]
        : quote
          ? [
              {
                locator: {
                  docId,
                  structuralPath: "data-subject-rights",
                  charRange: [0, Math.min(quote.length, doc.fullText.length)] as [number, number],
                },
                quotedText: quote,
                sourceRole: "target" as const,
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
    ruleSourceTier: "B",
  };

  let nextState = state;
  if (
    !lacksAutomatedDecisionContext &&
    raw.remedialInstruction?.trim() &&
    finding.evidence[0]?.locator
  ) {
    const task: DraftTask = {
      sourceFindingId: finding.findingId,
      clauseLocator: finding.evidence[0].locator,
      evidence: finding.evidence,
      reason: `Matrix gap for ${label}`,
      instruction: raw.remedialInstruction.trim(),
    };
    nextState = {
      ...state,
      draftTasks: [...(state.draftTasks ?? []), task],
    };
  }

  return { state: nextState, findings: [...findings, finding] };
}

export function hasAutomatedDecisionContext(text: string): boolean {
  return /\b(automated decision|solely automated|profil(?:e|ing)|algorithmic decision|human review|article 22)\b/i.test(
    text
  );
}

function selectRelevantClauses(clauses: ClauseObject[]): ClauseObject[] {
  const preferred = clauses.filter((c) => PREFERRED_CLAUSE_TYPES.includes(c.clauseType));
  return preferred.length > 0 ? preferred : clauses.slice(0, 12);
}

function categoryForRow(rowId: string): string {
  if (rowId.includes("access")) return "dsr_generic_no_named_rights";
  if (rowId.includes("erasure")) return "erasure_termination_only_gap";
  if (rowId.includes("portability")) return "portability_format_unaddressed";
  if (rowId.includes("automated")) return "automated_decision_gap";
  return "dsr_assistance_not_operational";
}
