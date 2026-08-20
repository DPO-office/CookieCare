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
import type {
  MatrixApplicabilityGate,
  RightsMatrixRow,
} from "../../skills/types.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { getSkillById } from "../../skills/registry.js";
import { loadSkillMdSection } from "../../skills/load-skill-md.js";
import {
  compileAuthoredRegex,
  insufficient,
  stampRequirementIdsOnNewFindings,
} from "./act-utils.js";

type MatrixJudgment = {
  addressing: MatrixAddressing;
  claim: string;
  gap?: string;
  clauseId?: string;
  quotedText?: string;
  severity: "low" | "medium" | "high";
  remedialInstruction?: string;
  justification?: string;
};

/**
 * Evaluate one rights-matrix row against extracted clauses.
 */
export async function evaluateMatrixRow(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): Promise<{ state: AnalysisState; findings: Finding[] }> {
  const result = await _evaluateMatrixRowImpl(state, unit, findings);
  return {
    state: result.state,
    findings: stampRequirementIdsOnNewFindings(unit, findings, result.findings),
  };
}

async function _evaluateMatrixRowImpl(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): Promise<{ state: AnalysisState; findings: Finding[] }> {
  const docId = String(unit.input.docId ?? "");
  const instruction = String(unit.input.instruction ?? state.request.instruction ?? "");
  const skillIds = (unit.input.skillIds as string[]) ?? state.activeSkillIds ?? [];
  const row = resolveMatrixRow(unit, skillIds);
  const rowId = row.rowId;
  const article = row.article;
  const label = row.label;
  const skillId = row.skillId ?? skillIds[0] ?? state.activeSkillIds?.[0];
  const subject = matrixRowSubject(row);

  const doc = state.workspace.documents.find((d) => d.docId === docId);
  if (!doc) {
    return {
      state,
      findings: [...findings, insufficient(unit, `Document ${docId} missing for matrix row ${rowId}`)],
    };
  }

  const clauses = selectRelevantClauses(doc.clauses ?? [], row.preferredClauseTypes);
  if (clauses.length === 0) {
    const finding: Finding = {
      findingId: `f_matrix_${rowId}_${unit.workUnitId}`,
      kind: "compliance",
      category: row.findingCategory,
      status: "insufficient_evidence",
      claim: `No relevant clauses were available to evaluate ${subject}.`,
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

  const matrixSection = skillId
    ? (await loadSkillMdSection(skillId, `matrix:${rowId}`)) ?? ""
    : "";

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

  let raw: MatrixJudgment;

  try {
    raw = await executeJsonCompletion(
      buildMatrixEvaluationPrompt({
        row,
        instruction,
        previousAttemptFeedback: unit.input.previousAttemptFeedback
          ? String(unit.input.previousAttemptFeedback)
          : "",
        matrixSection,
        clauses,
      }),
      "You map one rights-matrix row to contract text. Do not invent clauses. Force a justified Named/Generic/Absent choice.",
      schema,
      LLMTask.STRUCTURAL_JSON,
      LLMProvider.GEMINI,
      tracker
    );
  } catch (err) {
    console.warn("[evaluateMatrixRow] LLM failed:", err);
    raw = {
      addressing: "absent",
      claim: `Could not determine whether ${subject} is addressed (LLM unavailable).`,
      gap: "Insufficient evidence to classify this right.",
      severity: "medium",
      justification: "LLM unavailable",
    };
  }

  if (state.agent && tracker) {
    state.agent.tokensUsed = tracker.tokensUsed;
  }

  const gateHit = applyApplicabilityGate(row.applicabilityGate, doc.fullText);
  if (gateHit) {
    raw = {
      addressing: "absent",
      claim: gateHit.claim,
      gap: gateHit.gap,
      severity: gateHit.severity,
      justification: gateHit.justification,
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
    category: row.findingCategory,
    status: gateHit
      ? "insufficient_evidence"
      : raw.addressing === "absent"
        ? "absent_expected"
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
                  structuralPath: "matrix-row",
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
  if (!gateHit && raw.remedialInstruction?.trim() && finding.evidence[0]?.locator) {
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

export function resolveMatrixRow(
  unit: AnalysisWorkUnit,
  skillIds: string[]
): RightsMatrixRow {
  const rowId = String(unit.input.rowId ?? "");
  let fromSkill: RightsMatrixRow | undefined;
  for (const id of skillIds) {
    const skill = getSkillById(id);
    const found = skill?.rightsMatrixRows?.find((r) => r.rowId === rowId);
    if (found) {
      fromSkill = found;
      break;
    }
  }

  const gate = (unit.input.applicabilityGate as MatrixApplicabilityGate | undefined)
    ?? fromSkill?.applicabilityGate;
  const preferred =
    (unit.input.preferredClauseTypes as string[] | undefined)
    ?? fromSkill?.preferredClauseTypes;

  return {
    rowId,
    article: String(unit.input.article ?? fromSkill?.article ?? ""),
    label: String(unit.input.label ?? fromSkill?.label ?? rowId),
    findingCategory: String(
      unit.input.findingCategory ?? fromSkill?.findingCategory ?? "other_known_risk"
    ),
    preferredClauseTypes: preferred,
    applicabilityGate: gate,
    regimeLabel:
      (unit.input.regimeLabel as string | undefined) ?? fromSkill?.regimeLabel,
    skillId:
      (unit.input.matrixSkillId as string | undefined) ?? fromSkill?.skillId,
    family: fromSkill?.family,
    regimeId: fromSkill?.regimeId,
  };
}

export function matrixRowSubject(row: Pick<RightsMatrixRow, "regimeLabel" | "article" | "label">): string {
  const articlePart = row.article ? `Article ${row.article}` : "";
  return [row.regimeLabel, articlePart, row.label ? `(${row.label})` : ""]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildMatrixEvaluationPrompt(args: {
  row: RightsMatrixRow;
  instruction: string;
  previousAttemptFeedback: string;
  matrixSection: string;
  clauses: ClauseObject[];
}): string {
  const subject = matrixRowSubject(args.row);
  return [
    `Evaluate how this agreement addresses ${subject}.`,
    `User instruction: ${args.instruction}`,
    args.previousAttemptFeedback,
    args.matrixSection
      ? `Contrastive examples for this row (authored — use these to choose Named vs Generic vs Absent):\n${args.matrixSection}`
      : [
          "addressing=named if the right is expressly named or clearly described.",
          "addressing=generic if only a catch-all cooperation clause covers it.",
          "addressing=absent if the right is not addressed at all.",
        ].join("\n"),
    "You MUST justify addressing against the Named vs Generic examples above — do not default to Generic without justification.",
    args.row.applicabilityGate?.llmGuidance ?? "",
    "quotedText must be copied VERBATIM from a clause when addressing is named or generic.",
    `Clauses:\n${JSON.stringify(
      args.clauses.map((c) => ({
        clauseId: c.clauseId,
        clauseType: c.clauseType,
        text: c.text.slice(0, 2500),
      }))
    )}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function applyApplicabilityGate(
  gate: MatrixApplicabilityGate | undefined,
  fullText: string
): { claim: string; gap: string; severity: "low" | "medium" | "high"; justification: string } | null {
  if (!gate) return null;
  const re = compileAuthoredRegex(gate.contextRegex);
  if (re && re.test(fullText)) return null;
  return {
    claim: gate.absentClaim,
    gap: gate.absentGap,
    severity: gate.absentSeverity ?? "medium",
    justification: "Authored applicability gate did not match the source document.",
  };
}

export function selectRelevantClauses(
  clauses: ClauseObject[],
  preferredClauseTypes?: string[]
): ClauseObject[] {
  if (!preferredClauseTypes?.length) return clauses;
  const preferred = clauses.filter((c) => preferredClauseTypes.includes(c.clauseType));
  return preferred.length > 0 ? preferred : clauses.slice(0, 12);
}
