import type {
  AnalysisPlan,
  AnalysisWorkUnit,
  InstructionFocus,
} from "../models/analysis-plan.js";
import type { IntentClassification } from "../models/intent.js";
import type { AnalysisSkillConfig, RightsMatrixRow, SkillRegimeRule } from "./types.js";
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
  focus?: InstructionFocus;
}

export interface BuildActGraphResult {
  workUnits: AnalysisWorkUnit[];
  schemaId: AnalysisPlan["rendererSchemaId"];
  rendererSchemaId: AnalysisPlan["rendererSchemaId"];
}

function rendererForSkill(
  skill: AnalysisSkillConfig,
  intent: IntentClassification,
  focus?: InstructionFocus
): BuildActGraphResult["rendererSchemaId"] {
  if (focus?.matrixRowIds.length) return "rights_matrix_memo";
  if (intent.outputForm === "memo") return "memo";
  if (intent.outputForm === "table") return "table";
  if (skill.defaultOperation === "compliance_check") return "checklist";
  return "checklist";
}

/**
 * Build skill-scoped ACT work-unit graph (Phase 1: single primary skill).
 * When `focus` is set, prune regime rules / matrix rows / flag_risk categories.
 */
export function buildActGraph(input: BuildActGraphInput): AnalysisWorkUnit[] {
  return buildActGraphDetailed(input).workUnits;
}

export function buildActGraphDetailed(input: BuildActGraphInput): BuildActGraphResult {
  const { docId, instruction, skills, intent, focus } = input;
  const primary = skills[0];
  const skillIds = skills.map((s) => s.skillId);
  const mergedClauseTypes = mergeSkillClauseTypes(skills);
  const allRules = mergeRegimeRules(skills);
  const regimeRules = focus?.ruleIds.length
    ? allRules.filter((r) => focus.ruleIds.includes(r.ruleId))
    : allRules;
  const matrixRows: RightsMatrixRow[] = focus?.matrixRowIds.length
    ? skills.flatMap((s) => s.rightsMatrixRows ?? []).filter((r) => focus.matrixRowIds.includes(r.rowId))
    : [];
  const schemaId = rendererForSkill(primary, intent, focus);

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
  ];

  if (!focus) {
    units.push({
      workUnitId: "wu-check-expected",
      tool: "check_expected_clauses",
      input: { docId, skillIds, instruction },
      dependsOn: ["wu-extract"],
      outputSchema: "Finding[]",
      status: "pending",
    });
  }

  const flagDep = focus ? "wu-extract" : "wu-check-expected";
  units.push({
    workUnitId: "wu-flag-risk",
    tool: "flag_risk",
    input: {
      docId,
      skillIds,
      instruction,
      riskCategoryIds: focus?.riskCategoryIds ?? [],
    },
    dependsOn: [flagDep],
    outputSchema: "Finding[]",
    status: "pending",
  });

  let lastDep = "wu-flag-risk";

  for (const rule of regimeRules) {
    const wuId = `wu-rule-${rule.ruleId.replace(/\./g, "-")}`;
    units.push(ruleUnit(wuId, docId, rule, skillIds, instruction, lastDep));
    lastDep = wuId;
  }

  for (const row of matrixRows) {
    const wuId = `wu-matrix-${row.rowId.replace(/\./g, "-")}`;
    units.push({
      workUnitId: wuId,
      tool: "evaluate_matrix_row",
      input: {
        docId,
        rowId: row.rowId,
        article: row.article,
        label: row.label,
        instruction,
        skillIds,
      },
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

  return {
    workUnits: orderByDependency(units),
    schemaId,
    rendererSchemaId: schemaId,
  };
}

function ruleUnit(
  wuId: string,
  docId: string,
  rule: SkillRegimeRule,
  skillIds: string[],
  instruction: string,
  dependsOn: string
): AnalysisWorkUnit {
  return {
    workUnitId: wuId,
    tool: "check_against_rule",
    input: {
      docId,
      ruleId: rule.ruleId,
      skillIds,
      instruction,
      checkType: rule.checkType,
    },
    dependsOn: [dependsOn],
    outputSchema: "Finding[]",
    status: "pending",
  };
}
