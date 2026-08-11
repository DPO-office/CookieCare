import type { AnalysisWorkUnit } from "../models/analysis-plan.js";
import type { IntentClassification } from "../models/intent.js";
import type { AnalysisSkillConfig } from "./types.js";
import {
  mergeRegimeRules,
  mergeSkillClauseTypes,
} from "./registry.js";
import { orderByDependency } from "../utils/topo-batches.js";

export interface BuildActGraphInput {
  docId: string;
  instruction: string;
  skills: AnalysisSkillConfig[];
  intent: IntentClassification;
}

function rendererForSkill(skill: AnalysisSkillConfig, intent: IntentClassification): string {
  if (intent.outputForm === "memo") return "memo";
  if (intent.outputForm === "table") return "table";
  if (skill.defaultOperation === "compliance_check") return "checklist";
  return "checklist";
}

/**
 * Build skill-scoped ACT work-unit graph (Phase 1: single primary skill).
 */
export function buildActGraph(input: BuildActGraphInput): AnalysisWorkUnit[] {
  const { docId, instruction, skills, intent } = input;
  const primary = skills[0];
  const skillIds = skills.map((s) => s.skillId);
  const mergedClauseTypes = mergeSkillClauseTypes(skills);
  const regimeRules = mergeRegimeRules(skills);
  const schemaId = rendererForSkill(primary, intent);

  const units: AnalysisWorkUnit[] = [
    {
      workUnitId: "wu-classify",
      tool: "classify_document",
      input: { docId },
      dependsOn: [],
      outputSchema: "string",
      status: "pending",
    },
    {
      workUnitId: "wu-extract",
      tool: "extract_clauses",
      input: {
        docId,
        clauseTypes: mergedClauseTypes,
        skillIds,
        instruction,
      },
      dependsOn: ["wu-classify"],
      outputSchema: "ClauseObject[]",
      status: "pending",
    },
    {
      workUnitId: "wu-check-expected",
      tool: "check_expected_clauses",
      input: { docId, skillIds, instruction },
      dependsOn: ["wu-extract"],
      outputSchema: "Finding[]",
      status: "pending",
    },
    {
      workUnitId: "wu-flag-risk",
      tool: "flag_risk",
      input: { docId, skillIds, instruction },
      dependsOn: ["wu-check-expected"],
      outputSchema: "Finding[]",
      status: "pending",
    },
  ];

  let lastDep = "wu-flag-risk";

  for (const rule of regimeRules) {
    const wuId = `wu-rule-${rule.ruleId.replace(/\./g, "-")}`;
    units.push({
      workUnitId: wuId,
      tool: "check_against_rule",
      input: { docId, ruleId: rule.ruleId, skillIds, instruction },
      dependsOn: [lastDep],
      outputSchema: "Finding[]",
      status: "pending",
    });
    lastDep = wuId;
  }

  units.push({
    workUnitId: "wu-render",
    tool: "render_output",
    input: { schemaId, skillIds, instruction },
    dependsOn: [lastDep],
    outputSchema: "string",
    status: "pending",
  });

  return orderByDependency(units);
}
