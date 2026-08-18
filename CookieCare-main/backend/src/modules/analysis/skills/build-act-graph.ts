import type {
  AnalysisPlan,
  AnalysisWorkUnit,
  InstructionFocus,
} from "../models/analysis-plan.js";
import type { IntentClassification, IntentSubIntent } from "../models/intent.js";
import type {
  AnalysisSkillConfig,
  ComparativeCheckConfig,
  RelatedCheckRule,
  RightsMatrixRow,
  SkillRegimeRule,
} from "./types.js";
import type { ReportDepth, ReportSpec } from "../models/intent.js";
import {
  mergeRegimeRules,
  mergeSkillClauseTypes,
} from "./registry.js";
import { resolvePackages, type ResolvedPackage } from "./resolve-packages.js";
import { orderByDependency } from "../utils/topo-batches.js";
import type { RuleSource } from "../models/rule-source.js";

/** Max playbook position check slots scheduled at PLAN time (fixed graph). */
export const MAX_PLAYBOOK_CHECK_SLOTS = 24;

export interface BuildActGraphInput {
  docId: string;
  instruction: string;
  skills: AnalysisSkillConfig[];
  intent: IntentClassification;
  reportSpec?: ReportSpec;
  focus?: InstructionFocus;
  relatedChecks?: RelatedCheckRule[];
  unresolvedStandard?: string;
  /** Playbook / reference document for Tier P comparison. */
  referenceDocId?: string;
  /** Clause types known from a prior extract (rare); usually empty at PLAN. */
  playbookClauseTypes?: string[];
}

export interface BuildActGraphResult {
  workUnits: AnalysisWorkUnit[];
  schemaId: AnalysisPlan["rendererSchemaId"];
  rendererSchemaId: AnalysisPlan["rendererSchemaId"];
}

function rendererForSkill(
  skill: AnalysisSkillConfig,
  intent: IntentClassification,
  focus?: InstructionFocus,
  referenceDocId?: string
): BuildActGraphResult["rendererSchemaId"] {
  if (referenceDocId) return "playbook_comparison_memo";
  if (intent.outputForm === "brief_summary") return "brief_summary";
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
 * One shared classify+extract, optional playbook extract + Tier P checks,
 * then one subgraph per subIntent, relatedChecks, comparativeChecks,
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
    referenceDocId,
    playbookClauseTypes = [],
  } = input;
  const primary =
    skills.find((s) => s.axis === "regime") ??
    skills.find((s) => s.axis === "doc-type") ??
    skills[0];
  const skillIds = skills.map((s) => s.skillId);
  const focusedRiskIds = new Set(focus?.riskCategoryIds ?? []);
  const relatedRiskIds = [
    ...new Set(
      relatedChecks
        .flatMap((rule) => rule.related)
        .filter((category) => !focusedRiskIds.has(category))
    ),
  ];
  const relatedClauseTypes = relatedChecks.flatMap((r) =>
    r.related.filter((id) => skills.some((s) => s.clauseTypes.includes(id)))
  );
  const mergedClauseTypes = [
    ...new Set([
      ...mergeSkillClauseTypes(skills),
      ...relatedClauseTypes,
      ...playbookClauseTypes,
    ]),
  ];
  const allRules = mergeRegimeRules(skills);
  const schemaId = rendererForSkill(primary, intent, focus, referenceDocId);
  const subIntents = effectiveSubIntents(intent);

  const packageResolution = resolvePackages(skills, focus);
  const usePackages = packageResolution.packages.length > 0;
  const packageClauseTypes = [
    ...new Set(packageResolution.packages.flatMap(({ pkg }) => pkg.clauseTypes)),
  ];
  const expectedClauseTypes = skills.flatMap((s) =>
    s.expectedClauses.map((e) => e.clauseType)
  );
  const extractClauseTypes = usePackages
    ? [...new Set([...packageClauseTypes, ...expectedClauseTypes])]
    : mergedClauseTypes;

  const units: AnalysisWorkUnit[] = [
    {
      workUnitId: "wu-classify",
      tool: "classify_document",
      input: { docId },
      dependsOn: [],
      outputSchema: "string",
      status: "pending",
    },
  ];

  if (referenceDocId) {
    units.push({
      workUnitId: "wu-playbook-extract",
      tool: "extract_playbook_positions",
      input: { docId: referenceDocId, playbookDocId: referenceDocId, instruction },
      dependsOn: [],
      outputSchema: "Finding[]",
      status: "pending",
    });
  }

  const extractDeps = referenceDocId
    ? ["wu-classify", "wu-playbook-extract"]
    : ["wu-classify"];

  units.push({
    workUnitId: "wu-extract",
    tool: "extract_clauses",
    input: {
      docId,
      clauseTypes: extractClauseTypes.length > 0 ? extractClauseTypes : mergedClauseTypes,
      skillIds,
      instruction,
      /** Runtime union with playbook position clauseTypes when reference present. */
      unionPlaybookClauseTypes: Boolean(referenceDocId),
      referenceDocId,
    },
    dependsOn: extractDeps,
    outputSchema: "ClauseObject[]",
    status: "pending",
  });

  const subgraphLeaves: string[] = [];

  if (referenceDocId) {
    for (let i = 0; i < MAX_PLAYBOOK_CHECK_SLOTS; i++) {
      const wuId = `wu-playbook-pos-${i}`;
      units.push({
        workUnitId: wuId,
        tool: "check_against_rule",
        input: {
          docId,
          referenceDocId,
          playbookPositionIndex: i,
          skillIds,
          instruction,
        },
        dependsOn: ["wu-extract", "wu-playbook-extract"],
        outputSchema: "Finding[]",
        status: "pending",
      });
      subgraphLeaves.push(wuId);
    }
  }

  const scheduled: ScheduledGraphIds = {
    ruleIds: new Set<string>(),
    matrixRowIds: new Set<string>(),
    expectedClauseUnits: new Set<string>(),
    riskUnitSignatures: new Set<string>(),
  };

  // Package-centric ACT (doc §18): when the active skills author evidence
  // packages relevant to the focus, evaluate related requirements together in
  // one grouped call per package instead of one LLM call per rule. Skills
  // without authored packages fall back to the per-rule subgraph so no regime
  // regresses during migration.
  const packageEvalLeaves: string[] = [];
  const depth: ReportDepth = input.reportSpec?.depth ?? intent.depth ?? "standard";

  if (usePackages) {
    packageEvalLeaves.push(
      ...appendPackageUnits(units, {
        packages: packageResolution.packages,
        docId,
        instruction,
        skillIds,
        depth,
        extractDep: "wu-extract",
      })
    );
  } else {
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
        scheduled,
      });
      subgraphLeaves.push(...leaves);
    });
  }

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

  const comparative = collectComparativeChecks(skills);
  for (const check of comparative) {
    const wuId = `wu-comparative-${check.checkId.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    units.push({
      workUnitId: wuId,
      tool: "flag_risk",
      input: {
        docId,
        skillIds,
        instruction,
        comparativeCheckId: check.checkId,
        comparativeGuidance: check.guidance,
        clauseTypesFocus: check.clauseTypesToCompare,
        riskCategoryIds: [],
      },
      dependsOn: ["wu-extract"],
      outputSchema: "Finding[]",
      status: "pending",
    });
    subgraphLeaves.push(wuId);
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

  // Package path: derive risk deterministically from the authored compliance
  // findings, then aggregate every finding into RequirementAssessments before
  // the single render. Non-package leaves (playbook / related / comparative /
  // web) still gate aggregation so it sees the complete finding set.
  let renderDeps: string[];
  if (usePackages) {
    units.push({
      workUnitId: "wu-derive-risk",
      tool: "derive_risk",
      input: { docId, skillIds, instruction },
      dependsOn: packageEvalLeaves,
      outputSchema: "Finding[]",
      status: "pending",
    });
    units.push({
      workUnitId: "wu-aggregate",
      tool: "aggregate_requirements",
      input: { skillIds, instruction },
      dependsOn: ["wu-derive-risk", ...subgraphLeaves],
      outputSchema: "string",
      status: "pending",
    });
    renderDeps = ["wu-aggregate"];
  } else {
    renderDeps = subgraphLeaves.length > 0 ? subgraphLeaves : ["wu-extract"];
  }

  units.push({
    workUnitId: "wu-render",
    tool: "render_output",
    input: {
      schemaId,
      skillIds,
      instruction,
      relatedNotes: relatedChecks.map((r) => r.note).filter(Boolean),
      referenceDocId,
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

function collectComparativeChecks(skills: AnalysisSkillConfig[]): ComparativeCheckConfig[] {
  const out: ComparativeCheckConfig[] = [];
  const seen = new Set<string>();
  for (const skill of skills) {
    if (skill.axis !== "jurisdiction") continue;
    for (const c of skill.comparativeChecks ?? []) {
      if (seen.has(c.checkId)) continue;
      seen.add(c.checkId);
      out.push(c);
    }
  }
  return out;
}

interface ScheduledGraphIds {
  ruleIds: Set<string>;
  matrixRowIds: Set<string>;
  expectedClauseUnits: Set<string>;
  riskUnitSignatures: Set<string>;
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
    scheduled: ScheduledGraphIds;
  }
): string[] {
  const { prefix, si, docId, instruction, skillIds, focus, allRules, skills, extractDep, scheduled } =
    args;
  const runRisk =
    si.operation === "risk_flag" ||
    si.operation === "extract";
  const runCompliance =
    si.operation === "compliance_check" ||
    Boolean(focus) ||
    (si.operation !== "risk_flag" && si.operation !== "extract" && allRules.length > 0);

  let lastDep = extractDep;
  const leaves: string[] = [];

  const expectedSignature = si.description ?? si.operation;
  if (runCompliance && !focus && !scheduled.expectedClauseUnits.has(expectedSignature)) {
    scheduled.expectedClauseUnits.add(expectedSignature);
    const id = `wu-${prefix}check-expected`;
    units.push({
      workUnitId: id,
      tool: "check_expected_clauses",
      input: { docId, skillIds, instruction, subIntent: expectedSignature },
      dependsOn: [extractDep],
      outputSchema: "Finding[]",
      status: "pending",
    });
    lastDep = id;
  }

  const riskCategoryIds = focus?.riskCategoryIds ?? [];
  const riskSignature = focus
    ? `focus:${[...riskCategoryIds].sort().join(",")}`
    : `si:${si.description ?? si.operation}`;
  if (runRisk && !scheduled.riskUnitSignatures.has(riskSignature)) {
    scheduled.riskUnitSignatures.add(riskSignature);
    const id = `wu-${prefix}flag-risk`;
    units.push({
      workUnitId: id,
      tool: "flag_risk",
      input: {
        docId,
        skillIds,
        instruction,
        riskCategoryIds,
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
    const ruleDep = lastDep;
    const regimeRules = focus
      ? allRules.filter((r) => focus.ruleIds.includes(r.ruleId))
      : allRules;
    const matrixRows: RightsMatrixRow[] = focus?.matrixRowIds.length
      ? skills
          .flatMap((s) => s.rightsMatrixRows ?? [])
          .filter((r) => focus.matrixRowIds.includes(r.rowId))
      : [];

    for (const rule of regimeRules) {
      if (scheduled.ruleIds.has(rule.ruleId)) continue;
      scheduled.ruleIds.add(rule.ruleId);
      const wuId = `wu-${prefix}rule-${rule.ruleId.replace(/\./g, "-")}`;
      // Rules are mutually independent; they only need extracted clauses.
      // Chaining them to each other forced a fully serial ACT phase.
      units.push(ruleUnit(wuId, docId, rule, skillIds, instruction, ruleDep));
      leaves.push(wuId);
    }

    for (const row of matrixRows) {
      if (scheduled.matrixRowIds.has(row.rowId)) continue;
      scheduled.matrixRowIds.add(row.rowId);
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
        dependsOn: [ruleDep],
        outputSchema: "Finding[]",
        status: "pending",
      });
      leaves.push(wuId);
    }

    if (!runRisk && lastDep !== extractDep) leaves.push(lastDep);
  }

  if (leaves.length === 0 && lastDep !== extractDep) leaves.push(lastDep);
  return [...new Set(leaves)];
}

/**
 * Emit, per resolved evidence package, a shared-evidence extraction unit and a
 * grouped evaluation unit. Returns the evaluation-unit ids (leaves).
 */
function appendPackageUnits(
  units: AnalysisWorkUnit[],
  args: {
    packages: ResolvedPackage[];
    docId: string;
    instruction: string;
    skillIds: string[];
    depth: ReportDepth;
    extractDep: string;
  }
): string[] {
  const { packages, docId, instruction, skillIds, depth, extractDep } = args;
  const evalLeaves: string[] = [];

  for (const { pkg, requirementIds } of packages) {
    const safeId = pkg.id.replace(/[^a-zA-Z0-9._-]/g, "-");
    const evidenceId = `wu-pkg-ev-${safeId}`;
    const evalId = `wu-pkg-eval-${safeId}`;

    units.push({
      workUnitId: evidenceId,
      tool: "extract_shared_evidence",
      input: {
        docId,
        packageId: pkg.id,
        clauseTypes: pkg.clauseTypes,
        extractionTargets: pkg.extractionTargets,
        skillIds,
        instruction,
      },
      dependsOn: [extractDep],
      outputSchema: "ClauseObject[]",
      status: "pending",
    });

    units.push({
      workUnitId: evalId,
      tool: "evaluate_package",
      input: {
        docId,
        packageId: pkg.id,
        capabilityIds: pkg.capabilityIds,
        requirementIds,
        sourceMode: pkg.sourceMode,
        skillIds,
        instruction,
        depth,
      },
      dependsOn: [evidenceId],
      outputSchema: "Finding[]",
      status: "pending",
    });
    evalLeaves.push(evalId);
  }

  return evalLeaves;
}

function ruleUnit(
  wuId: string,
  docId: string,
  rule: SkillRegimeRule,
  skillIds: string[],
  instruction: string,
  dependsOn: string
): AnalysisWorkUnit {
  const ruleSource: RuleSource = {
    kind: "authored",
    ruleId: rule.ruleId,
    skillId: skillIds[0] ?? "",
    ruleVersion: "",
    findingCategory: rule.findingCategory,
  };
  return {
    workUnitId: wuId,
    tool: "check_against_rule",
    input: {
      docId,
      ruleId: rule.ruleId,
      ruleSource,
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
