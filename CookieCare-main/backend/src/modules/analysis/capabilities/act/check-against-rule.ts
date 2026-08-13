import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import type { EvidenceSpan } from "../../models/locator.js";
import type { ClauseObject } from "../../models/clause-object.js";
import type { SkillRegimeRule } from "../../skills/types.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { getSkillById } from "../../skills/registry.js";
import { insufficient } from "./act-utils.js";

const TIMEFRAME_NUMERIC =
  /\b(\d+)\s*(hour|hours|day|days|week|weeks|month|months|business days?)\b/i;
const TIMEFRAME_VAGUE = /\b(promptly|reasonably|as soon as (reasonably )?practicable|without (undue )?delay|timely)\b/i;

function resolveRule(skillIds: string[], ruleId: string) {
  for (const id of skillIds) {
    const skill = getSkillById(id);
    const rule = skill?.regimeRules.find((r) => r.ruleId === ruleId);
    if (rule) return { rule, skillId: skill!.skillId, skillVersion: skill!.version };
  }
  return null;
}

function categoryForRule(ruleId: string): string {
  if (ruleId === "gdpr.art12.3") return "dsr_no_response_timeframe";
  if (ruleId === "gdpr.art28.3.e") return "dsr_generic_no_named_rights";
  return "other_known_risk";
}

function scanTimeframe(clauses: ClauseObject[]): {
  kind: "numeric" | "vague" | "absent";
  quote?: string;
  clause?: ClauseObject;
} {
  for (const c of clauses) {
    const numeric = c.text.match(TIMEFRAME_NUMERIC);
    if (numeric) {
      return { kind: "numeric", quote: numeric[0], clause: c };
    }
  }
  for (const c of clauses) {
    const vague = c.text.match(TIMEFRAME_VAGUE);
    if (vague) {
      return { kind: "vague", quote: vague[0], clause: c };
    }
  }
  return { kind: "absent" };
}

async function checkAgainstRule(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): Promise<{ state: AnalysisState; findings: Finding[] }> {
  const docId = String(unit.input.docId ?? "");
  const ruleId = String(unit.input.ruleId ?? "");
  const instruction = String(unit.input.instruction ?? state.request.instruction ?? "");
  const skillIds = (unit.input.skillIds as string[]) ?? state.activeSkillIds ?? [];
  const hasFocus = Boolean(state.plan?.focus);

  const resolved = resolveRule(skillIds, ruleId);
  if (!resolved) {
    return {
      state,
      findings: [
        ...findings,
        insufficient(unit, `Rule ${ruleId} not found in active skill configuration`),
      ],
    };
  }

  const { rule, skillId, skillVersion } = resolved;
  const doc = state.workspace.documents.find((d) => d.docId === docId);
  if (!doc) {
    return {
      state,
      findings: [...findings, insufficient(unit, `Document ${docId} missing for rule check`)],
    };
  }

  const applicable = (doc.clauses ?? []).filter(
    (c) =>
      !rule.appliesToClauseTypes?.length ||
      rule.appliesToClauseTypes.includes(c.clauseType)
  );

  if (applicable.length === 0) {
    return {
      state,
      findings: [
        ...findings,
        {
          findingId: `f_rule_noclause_${ruleId}_${unit.workUnitId}`,
          kind: "compliance",
          category: categoryForRule(ruleId),
          status: "insufficient_evidence",
          claim: `No clause available to evaluate rule ${ruleId}.`,
          evidence: [],
          ruleId,
          ruleVersion: skillVersion,
          severity: "medium",
          taxonomyVersion: RISK_TAXONOMY_VERSION,
          workUnitId: unit.workUnitId,
          skillId,
          visibility: "user_facing",
        },
      ],
    };
  }

  if (rule.checkType === "pattern_then_llm_judgment") {
    const patternFinding = timeframePatternFinding(
      unit,
      rule,
      applicable,
      skillId,
      skillVersion
    );
    if (patternFinding) {
      if (patternFinding.status !== "present") {
        return { state, findings: [...findings, patternFinding] };
      }
      const judged = await llmJudge(
        state,
        unit,
        rule,
        applicable,
        instruction,
        skillId,
        skillVersion,
        hasFocus
      );
      return { state, findings: [...findings, judged ?? patternFinding] };
    }
  }

  const judged = await llmJudge(
    state,
    unit,
    rule,
    applicable,
    instruction,
    skillId,
    skillVersion,
    hasFocus
  );
  return { state, findings: [...findings, judged] };
}

function timeframePatternFinding(
  unit: AnalysisWorkUnit,
  rule: SkillRegimeRule,
  clauses: ClauseObject[],
  skillId: string,
  skillVersion: string
): Finding | null {
  if (rule.ruleId !== "gdpr.art12.3") return null;
  const scan = scanTimeframe(clauses);
  const category = categoryForRule(rule.ruleId);

  if (scan.kind === "numeric" && scan.clause && scan.quote) {
    return {
      findingId: `f_compliance_${rule.ruleId}_${unit.workUnitId}`,
      kind: "compliance",
      category,
      status: "present",
      claim: `A numeric response timeframe (${scan.quote}) appears in the DSR/assistance clauses.`,
      evidence: [{ locator: scan.clause.locator, quotedText: scan.quote }],
      ruleId: rule.ruleId,
      ruleVersion: skillVersion,
      severity: "low",
      taxonomyVersion: RISK_TAXONOMY_VERSION,
      workUnitId: unit.workUnitId,
      skillId,
      visibility: "user_facing",
    };
  }

  if (scan.kind === "vague" && scan.clause && scan.quote) {
    return {
      findingId: `f_compliance_${rule.ruleId}_${unit.workUnitId}`,
      kind: "compliance",
      category,
      status: "absent_expected",
      claim: `Art 12(3) requires a one-month (extendable) clock; the agreement only uses vague timing ("${scan.quote}").`,
      evidence: [{ locator: scan.clause.locator, quotedText: scan.quote }],
      ruleId: rule.ruleId,
      ruleVersion: skillVersion,
      severity: "high",
      taxonomyVersion: RISK_TAXONOMY_VERSION,
      workUnitId: unit.workUnitId,
      skillId,
      visibility: "user_facing",
      gap: "No numeric Art 12(3) timeframe; 'promptly' / 'reasonably' alone is insufficient.",
    };
  }

  return {
    findingId: `f_compliance_${rule.ruleId}_${unit.workUnitId}`,
    kind: "compliance",
    category,
    status: "absent_expected",
    claim: "No response timeframe for data-subject requests was found in the extracted DSR/assistance clauses.",
    evidence: [],
    ruleId: rule.ruleId,
    ruleVersion: skillVersion,
    severity: "high",
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: unit.workUnitId,
    skillId,
    visibility: "user_facing",
    gap: "Art 12(3) one-month clock is unaddressed.",
  };
}

async function llmJudge(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  rule: SkillRegimeRule,
  applicable: ClauseObject[],
  instruction: string,
  skillId: string,
  skillVersion: string,
  hasFocus: boolean
): Promise<Finding> {
  const ruleId = rule.ruleId;
  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  const schema = {
    type: "object",
    properties: {
      status: { type: "string", enum: ["present", "absent_expected", "insufficient_evidence"] },
      claim: { type: "string" },
      clauseId: { type: "string" },
      quotedText: { type: "string" },
      severity: { type: "string", enum: ["low", "medium", "high"] },
      gap: { type: "string" },
    },
    required: ["status", "claim", "severity"],
  };

  let result: {
    status: Finding["status"];
    claim: string;
    clauseId?: string;
    quotedText?: string;
    severity: "low" | "medium" | "high";
    gap?: string;
  };

  try {
    result = await executeJsonCompletion(
      [
        "Evaluate whether the extracted clauses satisfy the FIXED rule below.",
        "You must NOT reinterpret the rule — only assess compliance against the given rule text.",
        `User instruction (scope the analysis to this question): ${instruction}`,
        `Rule (${ruleId}${rule.label ? ` — ${rule.label}` : ""}): ${rule.ruleText}`,
        rule.legalHook ? `Authored legal hook (do not invent a different citation): ${rule.legalHook}` : "",
        `Clauses:\n${JSON.stringify(
          applicable.map((c) => ({
            clauseId: c.clauseId,
            clauseType: c.clauseType,
            text: c.text.slice(0, 3000),
          }))
        )}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      "Compliance evaluator. Cite verbatim quotes when status is present.",
      schema,
      LLMTask.STRUCTURAL_JSON,
      LLMProvider.GEMINI,
      tracker
    );
  } catch (err) {
    console.warn("[checkAgainstRule] LLM failed:", err);
    result = {
      status: "insufficient_evidence",
      claim: `Could not evaluate rule ${ruleId} (LLM unavailable).`,
      severity: "medium",
    };
  }

  if (state.agent && tracker) {
    state.agent.tokensUsed = tracker.tokensUsed;
  }

  const evidence: EvidenceSpan[] = [];
  if (result.clauseId && result.quotedText) {
    const clause = applicable.find((c) => c.clauseId === result.clauseId);
    if (clause) {
      evidence.push({
        locator: clause.locator,
        quotedText: result.quotedText,
      });
    }
  }

  const restatementOnly =
    result.status === "present" && !hasFocus && !instruction.trim();
  const visibility: Finding["visibility"] =
    restatementOnly || (result.status === "present" && !hasFocus && isGenericRestatement(result.claim, rule))
      ? "internal"
      : "user_facing";

  return {
    findingId: `f_compliance_${ruleId}_${unit.workUnitId}`,
    kind: "compliance",
    category: categoryForRule(ruleId),
    status: result.status,
    claim: result.claim,
    evidence,
    ruleId,
    ruleVersion: skillVersion,
    severity: result.severity,
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: unit.workUnitId,
    skillId,
    visibility,
    gap: result.gap,
  };
}

function isGenericRestatement(claim: string, rule: SkillRegimeRule): boolean {
  const c = claim.toLowerCase();
  const r = rule.ruleText.toLowerCase().slice(0, 40);
  return c.includes(r) || c.includes("complies with") || c.includes("satisfies the rule");
}

export { checkAgainstRule, resolveRule };
