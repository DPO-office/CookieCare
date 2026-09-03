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
} from "../../skills/runtime/catalog/types.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { getSkillById } from "../../skills/runtime/catalog/registry.js";
import { loadSkillMdSection } from "../../skills/runtime/catalog/load-skill-md.js";
import {
  compileAuthoredRegex,
  insufficient,
  stampRequirementIdsOnNewFindings,
} from "./act-utils.js";
import { MATRIX_SHARED_EVIDENCE_PACKAGE_ID } from "./extract-shared-evidence.js";

type MatrixJudgment = {
  addressing: MatrixAddressing;
  claim: string;
  gap?: string;
  implementationGap?: string;
  implementationSeverity?: "low" | "medium" | "high";
  clauseId?: string;
  quotedText?: string;
  evidence?: Array<{ clauseId: string; quotedText: string }>;
  severity: "low" | "medium" | "high";
  remedialInstruction?: string;
  justification?: string;
};

/**
 * Evaluate one rights-matrix row against extracted clauses.
 */
export const MATRIX_ROW_MAX_OUTPUT_TOKENS = 1200;
export const MATRIX_ROW_WALL_CLOCK_MS = 20_000;
export const MATRIX_ROW_CLAUSE_CHAR_CAP = 800;
export const MATRIX_ROW_MAX_CLAUSES = 12;

export const MATRIX_ROW_SYSTEM_INSTRUCTION =
  "Map one rights-matrix row to contract text. Return a short claim, gap, and justification only — no essay and no clause paste beyond quotedText. Do not invent clauses. Force a justified Named/Generic/Absent choice.";
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

  const clauses = resolveMatrixRowClauses(state, doc, unit, row);
  if (clauses.length === 0) {
    const finding: Finding = {
      findingId: `f_matrix_${rowId}_${unit.workUnitId}`,
      kind: "compliance",
      category: row.findingCategory,
      status: "insufficient_evidence",
      claim: `No related clauses were found for ${subject}.`,
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
      claim: { type: "string", description: "At most two sentences." },
      gap: { type: "string", description: "At most two sentences." },
      implementationGap: { type: "string", description: "At most two sentences." },
      implementationSeverity: { type: "string", enum: ["low", "medium", "high"] },
      clauseId: { type: "string" },
      quotedText: { type: "string", description: "Verbatim clause excerpt, at most 400 characters." },
      evidence: {
        type: "array",
        maxItems: 3,
        description:
          "Source support. Each item must pair one supplied clauseId with a verbatim substring from that same clause. Use multiple items when the judgment relies on multiple clauses; use [] when addressing is absent.",
        items: {
          type: "object",
          properties: {
            clauseId: { type: "string" },
            quotedText: {
              type: "string",
              description: "Verbatim excerpt from the identified clause, at most 400 characters.",
            },
          },
          required: ["clauseId", "quotedText"],
        },
      },
      severity: { type: "string", enum: ["low", "medium", "high"] },
      remedialInstruction: { type: "string", description: "At most two sentences." },
      justification: { type: "string", description: "At most two sentences." },
    },
    required: ["addressing", "claim", "severity", "justification", "evidence"],
  };

  let raw: MatrixJudgment;

  try {
    raw = await withMatrixRowTimeout(
      executeJsonCompletion(
        buildMatrixEvaluationPrompt({
          row,
          instruction,
          previousAttemptFeedback: unit.input.previousAttemptFeedback
            ? String(unit.input.previousAttemptFeedback)
            : "",
          matrixSection,
          clauses,
        }),
        MATRIX_ROW_SYSTEM_INSTRUCTION,
        schema,
        LLMTask.STRUCTURAL_JSON,
        LLMProvider.GEMINI,
        { tracker, maxOutputTokens: MATRIX_ROW_MAX_OUTPUT_TOKENS }
      )
    );
  } catch (err) {
    const timedOut = isMatrixRowTimeout(err);
    console.warn("[evaluateMatrixRow] LLM failed:", err);
    if (timedOut) {
      const finding: Finding = {
        findingId: `f_matrix_${rowId}_${unit.workUnitId}`,
        kind: "compliance",
        category: row.findingCategory,
        status: "insufficient_evidence",
        claim: `Timed out while evaluating ${subject}.`,
        evidence: [],
        severity: "medium",
        taxonomyVersion: RISK_TAXONOMY_VERSION,
        workUnitId: unit.workUnitId,
        skillId,
        visibility: "user_facing",
        matrixRowId: rowId,
        matrixAddressing: "absent",
        ruleSourceTier: "B",
        terminalStatus: "retries_exhausted",
      };
      return { state, findings: [...findings, finding] };
    }
    raw = {
      addressing: "absent",
      claim: `The check for ${subject} could not be completed because analysis was temporarily unavailable.`,
      severity: "medium",
      justification: "Temporary analysis failure.",
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

  // Positive matrix findings must keep a deterministic provenance chain back
  // to the candidate clauses. Never silently attach an LLM quote to the first
  // clause: missing/invented ids and non-source text fail closed. Multiple
  // evidence items let a judgment rely on (for example) a named right in one
  // clause and an operational assistance duty in another without joining the
  // two passages into a fabricated quote.
  const evidence = resolveGroundedMatrixEvidence(clauses, raw);
  const claimWithJustification = raw.justification
    ? `${raw.claim} (Justification: ${raw.justification})`
    : raw.claim;
  const implementationGap = raw.implementationGap?.trim();
  const resolvedGap =
    implementationGap ||
    raw.gap?.trim() ||
    (raw.addressing === "absent" ? raw.gap : undefined);
  const resolvedSeverity =
    implementationGap && raw.implementationSeverity
      ? raw.implementationSeverity
      : raw.severity;

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
    evidence,
    severity: resolvedSeverity,
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: unit.workUnitId,
    skillId,
    visibility: "user_facing",
    matrixRowId: rowId,
    matrixAddressing: raw.addressing,
    gap: resolvedGap,
    ruleSourceTier: "B",
  };

  let nextState = state;
  if (
    !gateHit &&
    finding.evidence[0]?.locator &&
    (raw.remedialInstruction?.trim() || implementationGap)
  ) {
    const task: DraftTask = {
      sourceFindingId: finding.findingId,
      clauseLocator: finding.evidence[0].locator,
      evidence: finding.evidence,
      reason: `Matrix gap for ${label}`,
      instruction:
        raw.remedialInstruction?.trim() ||
        `Revise the agreement to address ${implementationGap}`,
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
    `Evaluate how this agreement addresses ${subject}. Keep claim, gap, implementationGap, and justification to at most two sentences each.`,
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
    "Even when addressing=named, set implementationGap to any operational shortfall the contract still has for this right. Leave implementationGap empty only when the contract both names the right AND operationalises it.",
    "When implementationGap is set, also set implementationSeverity (medium or high for material legal exposure).",
    "When addressing is named or generic, evidence must contain every clause needed for the judgment. Each evidence item must use exactly one supplied clauseId and quotedText copied VERBATIM from that same clause. Never join text from different clauses into one quote; use separate evidence items. When addressing is absent, return evidence=[].",
    `Clauses:\n${JSON.stringify(
      args.clauses.map((c) => ({
        clauseId: c.clauseId,
        clauseType: c.clauseType,
        text: c.text.slice(0, MATRIX_ROW_CLAUSE_CHAR_CAP),
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
  const pool = !preferredClauseTypes?.length
    ? clauses
    : (() => {
        const preferred = clauses.filter((c) => preferredClauseTypes.includes(c.clauseType));
        return preferred.length > 0 ? preferred : clauses;
      })();
  return pool.slice(0, MATRIX_ROW_MAX_CLAUSES);
}

type NormalizedSource = {
  text: string;
  starts: number[];
  ends: number[];
};

function normalizeSourceWithOffsets(source: string): NormalizedSource {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (/\s/.test(char)) {
      if (text.length === 0) continue;
      if (text[text.length - 1] === " ") {
        ends[ends.length - 1] = index + 1;
      } else {
        text += " ";
        starts.push(index);
        ends.push(index + 1);
      }
      continue;
    }

    const lowered = char.toLowerCase();
    for (const loweredChar of lowered) {
      text += loweredChar;
      starts.push(index);
      ends.push(index + 1);
    }
  }

  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    starts.pop();
    ends.pop();
  }
  return { text, starts, ends };
}

function exactSourceSlice(
  source: string,
  normalized: NormalizedSource,
  normalizedStart: number,
  normalizedLength: number
): string | undefined {
  if (normalizedStart < 0 || normalizedLength <= 0) return undefined;
  const start = normalized.starts[normalizedStart];
  const end = normalized.ends[normalizedStart + normalizedLength - 1];
  if (start === undefined || end === undefined) return undefined;
  return source.slice(start, end).trim();
}

/**
 * Resolve model-supplied matrix evidence to an exact source substring.
 *
 * Exact quotes are mapped back to their original spacing/casing. If the model
 * improperly joined source fragments with an ellipsis, the ordered anchors are
 * located in the source and replaced with one contiguous source excerpt. A
 * quote that cannot be resolved is rejected instead of being approximately or
 * synthetically grounded.
 */
export function resolveGroundedMatrixQuote(
  source: string,
  rawQuote?: string,
  maxChars = 400
): string | undefined {
  const candidate = rawQuote?.trim();
  if (!candidate || !source.trim()) return undefined;

  const normalizedSource = normalizeSourceWithOffsets(source);
  const normalizedQuote = candidate.replace(/\s+/g, " ").trim().toLowerCase();
  const exactIndex = normalizedSource.text.indexOf(normalizedQuote);
  if (exactIndex >= 0) {
    return exactSourceSlice(
      source,
      normalizedSource,
      exactIndex,
      normalizedQuote.length
    );
  }

  const anchors = candidate
    .split(/(?:\.\.\.|…)/)
    .map((part) => part.replace(/\s+/g, " ").trim().toLowerCase())
    .filter((part) => part.length >= 8);
  if (anchors.length < 2) return undefined;

  const matches: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const anchor of anchors) {
    const start = normalizedSource.text.indexOf(anchor, cursor);
    if (start < 0) return undefined;
    matches.push({ start, end: start + anchor.length });
    cursor = start + anchor.length;
  }

  const spanStart = matches[0].start;
  const spanEnd = matches[matches.length - 1].end;
  const full = exactSourceSlice(
    source,
    normalizedSource,
    spanStart,
    spanEnd - spanStart
  );
  if (full && full.length <= maxChars) return full;

  // When distant fragments exceed the evidence cap, keep an exact window
  // around the final anchor. The trailing fragment normally contains the
  // discriminating right/obligation after a generic lead-in.
  const focus = matches[matches.length - 1];
  const focusStart = normalizedSource.starts[focus.start];
  const focusEnd = normalizedSource.ends[focus.end - 1];
  if (focusStart === undefined || focusEnd === undefined) return undefined;
  const padding = Math.max(0, maxChars - (focusEnd - focusStart));
  const start = Math.max(0, focusStart - Math.floor(padding / 2));
  const end = Math.min(source.length, start + maxChars);
  return source.slice(start, end).trim();
}

/** Resolve structured (or legacy single-item) matrix evidence without guessing. */
export function resolveGroundedMatrixEvidence(
  clauses: ClauseObject[],
  judgment: Pick<MatrixJudgment, "evidence" | "clauseId" | "quotedText">
): Finding["evidence"] {
  const refs = judgment.evidence?.length
    ? judgment.evidence
    : judgment.clauseId && judgment.quotedText
      ? [{ clauseId: judgment.clauseId, quotedText: judgment.quotedText }]
      : [];

  const resolved: Finding["evidence"] = [];
  for (const ref of refs) {
    const clause = clauses.find((candidate) => candidate.clauseId === ref.clauseId);
    if (!clause) continue;
    const quotedText = resolveGroundedMatrixQuote(clause.text, ref.quotedText);
    if (!quotedText) continue;
    resolved.push({
      locator: clause.locator,
      quotedText,
      sourceRole: "target",
    });
  }
  return resolved;
}

export function clausesFromSharedEvidence(
  state: AnalysisState,
  docId: string,
  packageId?: string
): ClauseObject[] {
  const wanted = packageId ?? MATRIX_SHARED_EVIDENCE_PACKAGE_ID;
  const bundle =
    state.sharedEvidence?.[wanted] ??
    Object.values(state.sharedEvidence ?? {}).find((item) => item.docId === docId);
  if (!bundle) return [];
  return bundle.items.map((item, index) => ({
    clauseId: item.ref || `shared-${index + 1}`,
    clauseType: item.clauseType,
    text: item.quotedText,
    locator: {
      docId: bundle.docId,
      structuralPath: item.structuralPath,
      charRange: item.charRange,
    },
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    evidenceStatus: item.evidenceStatus,
    matchReason: item.matchReason,
    referencedDocuments: item.referencedDocuments,
    truncated: item.truncated,
    logicalEndOffset: item.logicalEndOffset,
  }));
}

function resolveMatrixRowClauses(
  state: AnalysisState,
  doc: { clauses?: ClauseObject[]; docId?: string },
  unit: AnalysisWorkUnit,
  row: RightsMatrixRow
): ClauseObject[] {
  const packageId = String(
    unit.input.sharedEvidencePackageId ?? MATRIX_SHARED_EVIDENCE_PACKAGE_ID
  );
  const fromShared = clausesFromSharedEvidence(state, String(unit.input.docId ?? ""), packageId);
  const source = fromShared.length > 0 ? fromShared : (doc.clauses ?? []);
  return selectRelevantClauses(source, row.preferredClauseTypes);
}

export class MatrixRowTimeoutError extends Error {
  constructor() {
    super("matrix_row_timeout");
    this.name = "MatrixRowTimeoutError";
  }
}

export function isMatrixRowTimeout(err: unknown): boolean {
  return (
    err instanceof MatrixRowTimeoutError ||
    (err instanceof Error && err.message === "matrix_row_timeout")
  );
}

export async function withMatrixRowTimeout<T>(
  promise: Promise<T>,
  ms = MATRIX_ROW_WALL_CLOCK_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new MatrixRowTimeoutError()), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
