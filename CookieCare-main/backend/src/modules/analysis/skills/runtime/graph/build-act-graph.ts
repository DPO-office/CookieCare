import type {
  AnalysisPlan,
  AnalysisWorkUnit,
  InstructionFocus,
} from "../../../models/analysis-plan.js";
import type { IntentClassification, IntentSubIntent } from "../../../models/intent.js";
import type {
  AnalysisSkillConfig,
  ComparativeCheckConfig,
  RelatedCheckRule,
  RightsMatrixRow,
  SkillRegimeRule,
} from "../catalog/types.js";
import type { ReportDepth, ReportSpec } from "../../../models/intent.js";
import {
  mergeRegimeRules,
  mergeSkillClauseTypes,
} from "../catalog/registry.js";
import {
  analysisPackageKind,
  type EvidencePackage,
} from "../../../models/evidence-package.js";
import {
  hasUnsupportedExtraction,
  resolvePackages,
  validatePlannedWork,
  type PackageResolution,
  type ResolvedPackage,
} from "./resolve-packages.js";
import { orderByDependency } from "../../../utils/topo-batches.js";
import { MATRIX_SHARED_EVIDENCE_PACKAGE_ID } from "../../../capabilities/act/extract-shared-evidence.js";
import type { RuleSource } from "../../../models/rule-source.js";

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
  /** Runtime packages (e.g. open-analysis propositions) merged into resolution. */
  extraPackages?: EvidencePackage[];
}

export interface BuildActGraphResult {
  workUnits: AnalysisWorkUnit[];
  schemaId: AnalysisPlan["rendererSchemaId"];
  rendererSchemaId: AnalysisPlan["rendererSchemaId"];
  packageResolution: PackageResolution;
}

export interface SelectRendererInput {
  docType?: string;
  reportSpec?: ReportSpec;
  hasReference: boolean;
  hasMatrixFocus: boolean;
  requirementCount?: number;
  outputForm?: IntentClassification["outputForm"];
}

/**
 * Package extract types: authored clauseTypes plus types the package's
 * capabilities already declare. Prevents ACT from dropping confidentiality /
 * deletion because the package list lagged the rules.
 */
export function clauseTypesForPackageEvidence(
  pkg: EvidencePackage,
  capabilityIds: string[],
  skills: AnalysisSkillConfig[]
): string[] {
  const wanted = new Set(capabilityIds);
  const fromRules = skills.flatMap((skill) =>
    (skill.regimeRules ?? [])
      .filter((rule) => wanted.has(rule.ruleId))
      .flatMap((rule) => rule.appliesToClauseTypes ?? [])
  );
  const fromMatrix = skills.flatMap((skill) =>
    (skill.rightsMatrixRows ?? [])
      .filter((row) => wanted.has(row.rowId))
      .flatMap((row) => row.preferredClauseTypes ?? [])
  );
  return [...new Set([...pkg.clauseTypes, ...fromRules, ...fromMatrix])];
}

export function selectRenderer(
  input: SelectRendererInput
): BuildActGraphResult["rendererSchemaId"] {
  if (input.hasReference) return "playbook_comparison_memo";
  if (input.outputForm === "brief_summary") return "brief_summary";
  if (input.hasMatrixFocus) return "memo";
  const reportType = input.reportSpec?.reportType ?? "regime_compliance_memo";
  if (reportType === "qa_answer") return "qa_thread";
  if (reportType === "extraction_table") return "table";
  if (
    reportType === "regime_compliance_memo" &&
    (input.requirementCount ?? 0) <= 1 &&
    input.reportSpec?.depth === "narrow"
  ) {
    return "brief_summary";
  }
  return "memo";
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

/**
 * Reverse index: capabilityId → requirementIds it was mapped to.
 * Built once per graph so rule/matrix/risk/expected-clause emitters can stamp
 * findings without any post-hoc guessing in aggregation.
 */
function buildCapabilityToRequirementIds(
  focus?: InstructionFocus
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const mapping of focus?.requirementMappings ?? []) {
    for (const capId of mapping.capabilityIds) {
      const list = out.get(capId) ?? [];
      if (!list.includes(mapping.requirementId)) list.push(mapping.requirementId);
      out.set(capId, list);
    }
  }
  return out;
}

/**
 * Compact `[{capabilityId, requirementId}]` pairs for handlers that emit
 * multiple findings per unit (flag_risk, check_expected_clauses). The handler
 * looks up per finding by `category` / `clauseType`, so we serialize both
 * directions here.
 */
function compactMappingsFor(
  capabilityToRequirementIds: Map<string, string[]>
): Array<{ capabilityId: string; requirementId: string }> {
  const out: Array<{ capabilityId: string; requirementId: string }> = [];
  for (const [capabilityId, reqIds] of capabilityToRequirementIds) {
    for (const requirementId of reqIds) {
      out.push({ capabilityId, requirementId });
    }
  }
  return out;
}

export function buildActGraphDetailed(input: BuildActGraphInput): BuildActGraphResult {
  const {
    docId,
    instruction,
    skills,
    intent,
    reportSpec,
    focus,
    relatedChecks = [],
    unresolvedStandard,
    referenceDocId,
    playbookClauseTypes = [],
  } = input;
  const capabilityToRequirementIds = buildCapabilityToRequirementIds(focus);
  const requirementMappingsPayload = compactMappingsFor(capabilityToRequirementIds);
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
  const docType =
    primary?.axis === "doc-type"
      ? primary.skillId.replace(/^doc-types\//, "")
      : intent.docTypeHint;
  const schemaId = selectRenderer({
    docType,
    reportSpec,
    hasReference: Boolean(referenceDocId),
    hasMatrixFocus: Boolean(focus?.matrixRowIds.length),
    requirementCount: intent.requirements?.length,
    outputForm: intent.outputForm,
  });
  const subIntents = effectiveSubIntents(intent);

  const packageResolution = resolvePackages(skills, focus, intent.requirements, input.extraPackages);
  validatePlannedWork(packageResolution);
  const usePackages = packageResolution.packages.length > 0;
  const docTypeStructuralFallback = skills.some(
    (skill) => skill.axis === "doc-type" && skill.expectedClauses.length > 0
  );
  // Skip legacy fan-out when extraction requirements are unsupported inside a
  // package run, OR when no doc-type structural fallback exists. Doc-type
  // skills (e.g. DPA) have no packages but still need expected-clause checks
  // for broad "analyze this DPA" instructions.
  const skipLegacySubgraph =
    hasUnsupportedExtraction(packageResolution) &&
    (usePackages || !docTypeStructuralFallback);
  const packageClauseTypes = [
    ...new Set(packageResolution.packages.flatMap(({ pkg }) => pkg.clauseTypes)),
  ];
  const expectedClauseTypes = skills.flatMap((s) =>
    s.expectedClauses.map((e) => e.clauseType)
  );
  const extractClauseTypes = usePackages
    ? [
        ...new Set([
          ...packageClauseTypes,
          ...expectedClauseTypes,
          ...(packageResolution.leftoverRuleIds.length > 0 ? mergedClauseTypes : []),
        ]),
      ]
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

  // Package-centric ACT: run authored packages for covered requirements.
  // Leftover named-rule verifications may still use check_against_rule.
  // Extraction/coverage without a package never falls through to per-rule fan-out.
  const packageEvalLeaves: string[] = [];
  const depth: ReportDepth = input.reportSpec?.depth ?? intent.depth ?? "standard";

  if (usePackages) {
    packageEvalLeaves.push(
      ...appendPackageUnits(units, {
        packages: packageResolution.packages,
        docId,
        instruction,
        skillIds,
        skills,
        depth,
        extractDep: "wu-extract",
      })
    );
  }

  const subgraphContext: SubgraphContext = {
    capabilityToRequirementIds,
    requirementMappingsPayload,
  };

  if (
    packageResolution.leftoverRuleIds.length > 0 ||
    packageResolution.leftoverMatrixRowIds.length > 0 ||
    (!usePackages && packageResolution.leftoverRiskCategoryIds.length > 0)
  ) {
    const leftoverFocus: InstructionFocus = {
      ruleIds: packageResolution.leftoverRuleIds,
      matrixRowIds: packageResolution.leftoverMatrixRowIds,
      // Package compliance path: never schedule leftover flag_risk. Risk is
      // derived after aggregation from compliance gaps.
      riskCategoryIds: usePackages
        ? []
        : packageResolution.leftoverRiskCategoryIds,
      instructionText: instruction,
    };
    const leftoverLeaves = appendSubIntentUnits(units, {
      prefix: usePackages ? "left-" : "",
      si: subIntents[0] ?? {
        operation: intent.operation,
        standard: intent.standard,
        outputForm: intent.outputForm,
      },
      docId,
      instruction,
      skillIds,
      focus: leftoverFocus,
      allRules,
      skills,
      extractDep: "wu-extract",
      scheduled,
      context: subgraphContext,
    });
    subgraphLeaves.push(...leftoverLeaves);
  } else if (!usePackages && !skipLegacySubgraph) {
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
        context: subgraphContext,
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

  // Package path (or unsupported-extraction with no packages): aggregate into
  // RequirementAssessments before the single render. Non-package leaves still
  // gate aggregation so it sees the complete finding set.
  // Authority: package eval → aggregate (compliance) → derive_risk (annotation).
  let renderDeps: string[];
  const needsAggregate =
    usePackages ||
    skipLegacySubgraph ||
    packageResolution.requirementPaths.some((p) => p.status === "not_supported") ||
    packageResolution.leftoverMatrixRowIds.length > 0;
  if (needsAggregate) {
    const aggregateDeps =
      packageEvalLeaves.length > 0
        ? [...packageEvalLeaves, ...subgraphLeaves]
        : subgraphLeaves.length > 0
          ? subgraphLeaves
          : ["wu-extract"];
    units.push({
      workUnitId: "wu-aggregate",
      tool: "aggregate_requirements",
      input: {
        skillIds,
        instruction,
        unsupportedRequirements: packageResolution.requirementPaths.filter(
          (path) => path.status === "not_supported" && !path.requirementId.startsWith("_dep:")
        ),
      },
      dependsOn: [...new Set(aggregateDeps)],
      outputSchema: "string",
      status: "pending",
    });
    units.push({
      workUnitId: "wu-derive-risk",
      tool: "derive_risk",
      input: { docId, skillIds, instruction },
      dependsOn: ["wu-aggregate"],
      outputSchema: "Finding[]",
      status: "pending",
    });
    renderDeps = ["wu-derive-risk"];
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
    packageResolution,
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

interface SubgraphContext {
  capabilityToRequirementIds: Map<string, string[]>;
  requirementMappingsPayload: Array<{ capabilityId: string; requirementId: string }>;
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
    context: SubgraphContext;
  }
): string[] {
  const {
    prefix,
    si,
    docId,
    instruction,
    skillIds,
    focus,
    allRules,
    skills,
    extractDep,
    scheduled,
    context,
  } = args;
  const focusHasCapabilities =
    (focus?.ruleIds?.length ?? 0) > 0 ||
    (focus?.requiredCapabilities?.length ?? 0) > 0 ||
    (focus?.requiredIds?.length ?? 0) > 0 ||
    (focus?.matrixRowIds?.length ?? 0) > 0 ||
    (focus?.riskCategoryIds?.length ?? 0) > 0;
  const hasDocTypeStructure = skills.some(
    (skill) => skill.axis === "doc-type" && skill.expectedClauses.length > 0
  );
  const skipLeftoverRisk =
    args.prefix === "left-" && (focus?.riskCategoryIds?.length ?? 0) === 0;
  const runRisk =
    !skipLeftoverRisk &&
    (si.operation === "risk_flag" ||
      si.operation === "extract" ||
      (focus != null && (focus.riskCategoryIds?.length ?? 0) > 0) ||
      (!focusHasCapabilities && hasDocTypeStructure));
  const runCompliance =
    si.operation === "compliance_check" ||
    Boolean(focus) ||
    (si.operation !== "risk_flag" && si.operation !== "extract" && allRules.length > 0) ||
    hasDocTypeStructure;

  let lastDep = extractDep;
  const leaves: string[] = [];

  const expectedSignature = si.description ?? si.operation;
  if (
    runCompliance &&
    (!focus || !focusHasCapabilities) &&
    !scheduled.expectedClauseUnits.has(expectedSignature)
  ) {
    scheduled.expectedClauseUnits.add(expectedSignature);
    const id = `wu-${prefix}check-expected`;
    units.push({
      workUnitId: id,
      tool: "check_expected_clauses",
      input: {
        docId,
        skillIds,
        instruction,
        subIntent: expectedSignature,
        requirementMappings: context.requirementMappingsPayload,
      },
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
    const riskRequirementIds = uniqueRequirementIdsForCapabilities(
      riskCategoryIds,
      context.capabilityToRequirementIds
    );
    units.push({
      workUnitId: id,
      tool: "flag_risk",
      input: {
        docId,
        skillIds,
        instruction,
        riskCategoryIds,
        subIntent: si.description ?? si.operation,
        requirementMappings: context.requirementMappingsPayload,
      },
      dependsOn: [lastDep],
      outputSchema: "Finding[]",
      status: "pending",
      requirementIds: riskRequirementIds.length ? riskRequirementIds : undefined,
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
      const ownerRequirementIds =
        context.capabilityToRequirementIds.get(rule.ruleId) ?? [];
      units.push(
        ruleUnit(wuId, docId, rule, skillIds, instruction, ruleDep, ownerRequirementIds)
      );
      leaves.push(wuId);
    }

    const pendingRows = matrixRows.filter((row) => !scheduled.matrixRowIds.has(row.rowId));
    let matrixDep = ruleDep;
    if (pendingRows.length > 0) {
      const evidenceId = `wu-${prefix}matrix-shared-ev`;
      const clauseTypes = [
        ...new Set(pendingRows.flatMap((row) => row.preferredClauseTypes ?? [])),
      ];
      units.push({
        workUnitId: evidenceId,
        tool: "extract_shared_evidence",
        input: {
          docId,
          packageId: MATRIX_SHARED_EVIDENCE_PACKAGE_ID,
          clauseTypes,
          skillIds,
          instruction,
        },
        dependsOn: [ruleDep],
        outputSchema: "ClauseObject[]",
        status: "pending",
      });
      matrixDep = evidenceId;
    }
    for (const row of pendingRows) {
      scheduled.matrixRowIds.add(row.rowId);
      const wuId = `wu-${prefix}matrix-${row.rowId.replace(/\./g, "-")}`;
      const ownerRequirementIds =
        context.capabilityToRequirementIds.get(row.rowId) ?? [];
      units.push({
        workUnitId: wuId,
        tool: "evaluate_matrix_row",
        input: {
          docId,
          rowId: row.rowId,
          article: row.article,
          label: row.label,
          findingCategory: row.findingCategory,
          preferredClauseTypes: row.preferredClauseTypes,
          applicabilityGate: row.applicabilityGate,
          regimeLabel: row.regimeLabel,
          matrixSkillId: row.skillId,
          instruction,
          skillIds,
          sharedEvidencePackageId: MATRIX_SHARED_EVIDENCE_PACKAGE_ID,
        },
        dependsOn: [matrixDep],
        outputSchema: "Finding[]",
        status: "pending",
        requirementIds: ownerRequirementIds.length ? ownerRequirementIds : undefined,
      });
      leaves.push(wuId);
    }

    if (!runRisk && lastDep !== extractDep) leaves.push(lastDep);
  }

  if (leaves.length === 0 && lastDep !== extractDep) leaves.push(lastDep);
  return [...new Set(leaves)];
}

/**
 * Emit work units per resolved analysis package, branching on `kind`.
 * Dependency packages (requiresPackages) run first; evaluation may consume
 * their artifacts. Returns leaf unit ids.
 */
function appendPackageUnits(
  units: AnalysisWorkUnit[],
  args: {
    packages: ResolvedPackage[];
    docId: string;
    instruction: string;
    skillIds: string[];
    skills: AnalysisSkillConfig[];
    depth: ReportDepth;
    extractDep: string;
  }
): string[] {
  const { packages, docId, instruction, skillIds, skills, depth, extractDep } = args;
  const leafByPackage = new Map<string, string>();
  const evalLeaves: string[] = [];

  for (const { pkg, requirementIds, capabilityIds, contextCapabilityIds } of packages) {
    const safeId = pkg.id.replace(/[^a-zA-Z0-9._-]/g, "-");
    const kind = analysisPackageKind(pkg);
    const depLeaves = (pkg.requiresPackages ?? [])
      .map((id) => leafByPackage.get(id))
      .filter((id): id is string => Boolean(id));
    const dependsOn = depLeaves.length > 0 ? [extractDep, ...depLeaves] : [extractDep];

    const evidenceClauseTypes = clauseTypesForPackageEvidence(
      pkg,
      pkg.capabilityIds,
      skills
    );

    if (kind === "inventory") {
      const invId = `wu-pkg-inv-${safeId}`;
      units.push({
        workUnitId: invId,
        tool: "inventory_provisions",
        input: {
          docId,
          packageId: pkg.id,
          clauseTypes: evidenceClauseTypes,
          extractionTargets: pkg.extractionTargets,
          outputArtifactType: pkg.outputArtifactType ?? "inventory",
          requirementIds,
          skillIds,
          instruction,
          config: pkg.config ?? {},
          packageVersion: pkg.packageVersion,
        },
        dependsOn,
        outputSchema: "Finding[]",
        status: "pending",
        requirementIds: requirementIds.length ? requirementIds : undefined,
      });
      leafByPackage.set(pkg.id, invId);
      evalLeaves.push(invId);
      continue;
    }

    if (kind === "evidence_extraction") {
      const evidenceId = `wu-pkg-ev-${safeId}`;
      units.push({
        workUnitId: evidenceId,
        tool: "extract_shared_evidence",
        input: {
          docId,
          packageId: pkg.id,
          clauseTypes: evidenceClauseTypes,
          extractionTargets: pkg.extractionTargets,
          skillIds,
          instruction,
        },
        dependsOn,
        outputSchema: "ClauseObject[]",
        status: "pending",
      });
      leafByPackage.set(pkg.id, evidenceId);
      evalLeaves.push(evidenceId);
      continue;
    }

    // evaluation / matrix / comparison (comparison still uses grouped eval until
    // a dedicated handler lands): shared evidence then grouped evaluation.
    const evidenceId = `wu-pkg-ev-${safeId}`;
    const evalId = `wu-pkg-eval-${safeId}`;
    units.push({
      workUnitId: evidenceId,
      tool: "extract_shared_evidence",
      input: {
        docId,
        packageId: pkg.id,
        clauseTypes: evidenceClauseTypes,
        extractionTargets: pkg.extractionTargets,
        skillIds,
        instruction,
      },
      dependsOn,
      outputSchema: "ClauseObject[]",
      status: "pending",
    });

    units.push({
      workUnitId: evalId,
      tool: "evaluate_package",
      input: {
        docId,
        packageId: pkg.id,
        capabilityIds,
        contextCapabilityIds,
        requirementIds,
        sourceMode: pkg.sourceMode,
        skillIds,
        instruction,
        depth,
        extractionTargets: pkg.extractionTargets,
        requirementEvidence: pkg.requirementEvidence ?? {},
        requirementBindings: pkg.requirementBindings ?? {},
        inputArtifactIds: pkg.requiresPackages ?? [],
      },
      dependsOn: [evidenceId, ...depLeaves],
      outputSchema: "Finding[]",
      status: "pending",
      requirementIds: requirementIds.length ? requirementIds : undefined,
    });
    leafByPackage.set(pkg.id, evalId);
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
  dependsOn: string,
  requirementIds: string[]
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
    requirementIds: requirementIds.length ? requirementIds : undefined,
  };
}

function uniqueRequirementIdsForCapabilities(
  capabilityIds: string[],
  capabilityToRequirementIds: Map<string, string[]>
): string[] {
  const out: string[] = [];
  for (const capId of capabilityIds) {
    for (const reqId of capabilityToRequirementIds.get(capId) ?? []) {
      if (!out.includes(reqId)) out.push(reqId);
    }
  }
  return out;
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

      const focusMatrixHit =
        Boolean(focus?.matrixRowIds.length) &&
        (rule.matrixLinkageIds?.some((id) => focus!.matrixRowIds.includes(id)) ??
          false);

      if (!primaryHit && !focusMatrixHit) continue;
      const key = `${rule.primary}:${rule.related.join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matched.push(rule);
    }
  }

  return matched;
}
