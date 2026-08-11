import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import type { EvidenceSpan } from "../../models/locator.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { getSkillById } from "../../skills/registry.js";
import { insufficient } from "./act-utils.js";

function resolveRule(skillIds: string[], ruleId: string) {
  for (const id of skillIds) {
    const skill = getSkillById(id);
    const rule = skill?.regimeRules.find((r) => r.ruleId === ruleId);
    if (rule) return { rule, skillId: skill!.skillId, skillVersion: skill!.version };
  }
  return null;
}

async function checkAgainstRule(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): Promise<{ state: AnalysisState; findings: Finding[] }> {
  const docId = String(unit.input.docId ?? "");
  const ruleId = String(unit.input.ruleId ?? "");
  const skillIds = (unit.input.skillIds as string[]) ?? state.activeSkillIds ?? [];

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
          category: "other_known_risk",
          status: "insufficient_evidence",
          claim: `No clause available to evaluate rule ${ruleId}.`,
          evidence: [],
          ruleId,
          ruleVersion: skillVersion,
          severity: "medium",
          taxonomyVersion: RISK_TAXONOMY_VERSION,
          workUnitId: unit.workUnitId,
          skillId,
        },
      ],
    };
  }

  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  const schema = {
    type: "object",
    properties: {
      status: { type: "string", enum: ["present", "absent_expected", "insufficient_evidence"] },
      claim: { type: "string" },
      clauseId: { type: "string" },
      quotedText: { type: "string" },
      severity: { type: "string", enum: ["low", "medium", "high"] },
    },
    required: ["status", "claim", "severity"],
  };

  let result: {
    status: Finding["status"];
    claim: string;
    clauseId?: string;
    quotedText?: string;
    severity: "low" | "medium" | "high";
  };

  try {
    result = await executeJsonCompletion(
      [
        "Evaluate whether the extracted clause satisfies the FIXED rule below.",
        "You must NOT reinterpret the rule — only assess compliance against the given rule text.",
        `Rule (${ruleId}): ${rule.ruleText}`,
        `Clauses:\n${JSON.stringify(
          applicable.map((c) => ({
            clauseId: c.clauseId,
            clauseType: c.clauseType,
            text: c.text.slice(0, 3000),
          }))
        )}`,
      ].join("\n\n"),
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

  const finding: Finding = {
    findingId: `f_compliance_${ruleId}_${unit.workUnitId}`,
    kind: "compliance",
    category: "other_known_risk",
    status: result.status,
    claim: result.claim,
    evidence,
    ruleId,
    ruleVersion: skillVersion,
    severity: result.severity,
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: unit.workUnitId,
    skillId,
  };

  return { state, findings: [...findings, finding] };
}

export { checkAgainstRule, resolveRule };
