import type {
  AnalysisPlan,
  AnalysisWorkUnit,
  InstructionFocus,
} from "../models/analysis-plan.js";
import type { IntentClassification, IntentSubIntent } from "../models/intent.js";
import type {
  AnalysisSkillConfig,
  RelatedCheckRule,
  RightsMatrixRow,
  SkillRegimeRule,
} from "./types.js";
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
  relatedChecks?: RelatedCheckRule[];
  unresolvedStandard?: string;
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

function effectiveSubIntents(intent: IntentClassification): IntentSubIntent[] {
  if (intent.compound && intent.subIntents.length > 0) return intent.subIntents;
  return [
    {
      operation: intent.operation,
      standard: intent.standard,
      outputForm: intent.outputForm,
    },
  ];
}

/**
 * One shared classify+extract, then one subgraph per subIntent, relatedChecks,
 * optional Tier C web unit, and a single render.
 */
export function buildActGraph(input: BuildActGraphInput): AnalysisWorkUnit[] {
  return buildActGraphDetailed(input).workUnits;
}

export function buildActGraphDetailed(input: BuildActGraphInput): BuildActGraphResult {
  const {
    docId,
    instruction,
    skills,
    intent,
    focus,
    relatedChecks = [],
    unresolvedStandard,
  } = input;
  // Prefer specialized skill for renderer schema; _global is always present but not primary.
  const primary =
    skills.find((s) => s.axis === "regime") ??
    skills.find((s) => s.axis === "doc-type") ??
    skills[0];
  const skillIds = skills.map((s) => s.skillId);
  const relatedRiskIds = relatedChecks.flatMap((r) => r.related);
  const relatedClauseTypes = relatedChecks.flatMap((r) =>
    r.related.filter((id) => skills.some((s) => s.clauseTypes.includes(id)))
  );
  const mergedClauseTypes = [
    ...new Set([...mergeSkillClauseTypes(skills), ...relatedClauseTypes]),
  ];
  const allRules = mergeRegimeRules(skills);
  const schemaId = rendererForSkill(primary, intent, focus);
  const subIntents = effectiveSubIntents(intent);

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

  const subgraphLeaves: string[] = [];

  subIntents.forEach((si, index) => {
    const prefix = subIntents.length > 1 ? `si${index}-` : "";
    const leaves = appendSubIntentUnits(units, {
      prefix,
      si,
      docId,
      instruction,
      skillIds,
      focus,
      allRules,
      skills,
      extractDep: "wu-extract",
    });
    subgraphLeaves.push(...leaves);
  });

  if (relatedChecks.length > 0 && relatedRiskIds.length > 0) {
    const note = relatedChecks.map((r) => r.note).filter(Boolean).join(" ");
    units.push({
      workUnitId: "wu-related-flag-risk",
      tool: "flag_risk",
      input: {
        docId,
        skillIds,
        instruction,
        riskCategoryIds: relatedRiskIds,
        relatedNotRequested: true,
        relatedNote: note || "Adjacent checks a reviewer would typically also run.",
      },
      dependsOn: ["wu-extract"],
      outputSchema: "Finding[]",
      status: "pending",
    });
    subgraphLeaves.push("wu-related-flag-risk");
  }

  if (unresolvedStandard) {
    units.push({
      workUnitId: "wu-web-ref",
      tool: "web_assisted_reference",
      input: {
        query: unresolvedStandard,
        instruction,
        docId,
      },
      dependsOn: ["wu-extract"],
      outputSchema: "Finding[]",
      status: "pending",
    });
    subgraphLeaves.push("wu-web-ref");
  }

  const renderDeps = subgraphLeaves.length > 0 ? subgraphLeaves : ["wu-extract"];
  units.push({
    workUnitId: "wu-render",
    tool: "render_output",
    input: {
      schemaId,
      skillIds,
      instruction,
      relatedNotes: relatedChecks.map((r) => r.note).filter(Boolean),
    },
    dependsOn: renderDeps,
    outputSchema: "string",
    status: "pending",
  });

  return {
    workUnits: orderByDependency(units),
    schemaId,
    rendererSchemaId: schemaId,
  };
}

function appendSubIntentUnits(
  units: AnalysisWorkUnit[],
  args: {
    prefix: string;
    si: IntentSubIntent;
    docId: string;
    instruction: string;
    skillIds: string[];
    focus?: InstructionFocus;
    allRules: SkillRegimeRule[];
    skills: AnalysisSkillConfig[];
    extractDep: string;
  }
): string[] {
  const { prefix, si, docId, instruction, skillIds, focus, allRules, skills, extractDep } = args;
  const runRisk = si.operation === "risk_flag" || si.operation === "extract";
  const runCompliance =
    si.operation === "compliance_check" ||
    Boolean(focus && prefix === "") ||
    (si.operation !== "risk_flag" && si.operation !== "extract" && allRules.length > 0);

  let lastDep = extractDep;
  const leaves: string[] = [];

  if (runCompliance && !focus) {
    const id = `wu-${prefix}check-expected`;
    units.push({
      workUnitId: id,
      tool: "check_expected_clauses",
      input: { docId, skillIds, instruction, subIntent: si.description ?? si.operation },
      dependsOn: [extractDep],
      outputSchema: "Finding[]",
      status: "pending",
    });
    lastDep = id;
  }

  if (runRisk) {
    const id = `wu-${prefix}flag-risk`;
    units.push({
      workUnitId: id,
      tool: "flag_risk",
      input: {
        docId,
        skillIds,
        instruction,
        riskCategoryIds: prefix === "" ? (focus?.riskCategoryIds ?? []) : [],
        subIntent: si.description ?? si.operation,
      },
      dependsOn: [lastDep],
      outputSchema: "Finding[]",
      status: "pending",
    });
    lastDep = id;
    leaves.push(id);
  }

  if (runCompliance) {
    const regimeRules = focus?.ruleIds.length && prefix === ""
      ? allRules.filter((r) => focus.ruleIds.includes(r.ruleId))
      : allRules;
    const matrixRows: RightsMatrixRow[] =
      focus?.matrixRowIds.length && prefix === ""
        ? skills.flatMap((s) => s.rightsMatrixRows ?? []).filter((r) =>
            focus.matrixRowIds.includes(r.rowId)
          )
        : [];

    for (const rule of regimeRules) {
      const wuId = `wu-${prefix}rule-${rule.ruleId.replace(/\./g, "-")}`;
      units.push(ruleUnit(wuId, docId, rule, skillIds, instruction, lastDep));
      lastDep = wuId;
      leaves.push(wuId);
    }

    for (const row of matrixRows) {
      const wuId = `wu-${prefix}matrix-${row.rowId.replace(/\./g, "-")}`;
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
      leaves.push(wuId);
    }

    if (!runRisk && lastDep !== extractDep) leaves.push(lastDep);
  }

  if (leaves.length === 0 && lastDep !== extractDep) leaves.push(lastDep);
  return [...new Set(leaves)];
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

/**
 * Match instruction / focus primaries against skill.relatedChecks.
 */
export function resolveRelatedChecks(
  skills: AnalysisSkillConfig[],
  instruction: string,
  focus?: InstructionFocus
): RelatedCheckRule[] {
  const hay = instruction.toLowerCase();
  const matched: RelatedCheckRule[] = [];
  const seen = new Set<string>();

  for (const skill of skills) {
    for (const rule of skill.relatedChecks ?? []) {
      const primaryWords = rule.primary.replace(/_/g, " ");
      const primaryToken = rule.primary.split("_")[0];
      const primaryHit =
        hay.includes(primaryWords) ||
        hay.includes(rule.primary) ||
        (primaryToken.length > 4 && hay.includes(primaryToken)) ||
        focus?.riskCategoryIds.includes(rule.primary) ||
        (focus?.ruleIds.some((id) => id.includes(rule.primary)) ?? false);

      const focusDsrHit =
        Boolean(focus?.matrixRowIds.length) &&
        (rule.primary.includes("data_subject") ||
          rule.primary.includes("dsr") ||
          skill.clauseTypes.includes(rule.primary));

      if (!primaryHit && !focusDsrHit) continue;
      const key = `${rule.primary}:${rule.related.join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matched.push(rule);
    }
  }

  return matched;
}
