import type {
  AnalysisBranchPlan,
  AnalysisBranchTimeBudget,
  AnalysisWorkUnit,
  InstructionFocus,
  RequirementBinding,
  RequirementExecutionPath,
} from "../../models/analysis-plan.js";
import type { EvidencePackage } from "../../models/evidence-package.js";
import {
  deriveSections,
  type IntentClassification,
  type IntentSubIntent,
  type ReportSpec,
} from "../../models/intent.js";
import type { AnalysisSkillConfig, RelatedCheckRule } from "../../skills/runtime/catalog/types.js";
import { buildActGraphDetailed } from "../../skills/runtime/graph/build-act-graph.js";
import { replicateGraphForTargets } from "../../skills/runtime/graph/replicate-graph-for-targets.js";
import { orderByDependency } from "../../utils/topo-batches.js";
export { adaptiveVerificationTimeoutMs } from "../../utils/adaptive-time-budget.js";
import { capabilityContractFor } from "../contracts/analysis-capability-contract.js";
import { fallbackReportType } from "./intent-sensible-defaults.js";
import {
  buildFinalReportSpec,
  resolveReportSpecFromPackages,
} from "./resolve-report-spec.js";

export type BranchOrchestrationMode = "off" | "shadow" | "compound";

export function branchOrchestrationMode(
  raw = process.env.ANALYSIS_BRANCH_ORCHESTRATION
): BranchOrchestrationMode {
  return raw === "shadow" || raw === "compound" ? raw : "off";
}

export interface BuildCompoundBranchGraphInput {
  parentIntent: IntentClassification;
  instruction: string;
  skills: AnalysisSkillConfig[];
  targetDocIds: string[];
  referenceDocId?: string;
  focus?: InstructionFocus;
  relatedChecks?: RelatedCheckRule[];
  extraPackages?: EvidencePackage[];
  thinkingMode?: "lite" | "deep";
}

export interface CompoundBranchGraphResult {
  branches: AnalysisBranchPlan[];
  workUnits: AnalysisWorkUnit[];
  requirementBindings: RequirementBinding[];
  requirementExecutionPaths: RequirementExecutionPath[];
}

/**
 * Classifiers may correctly identify every requirement but still place a
 * reference-document comparison inside a compliance sub-intent. Normalize
 * that mixed shape before open-package generation so target law and reference
 * positions can never share a package or verdict channel.
 */
export function decomposeCompoundSubIntents(
  intent: IntentClassification
): IntentClassification {
  if (!intent.compound || intent.subIntents.length < 1) return intent;
  const expanded: IntentSubIntent[] = [];
  for (const subIntent of intent.subIntents) {
    const requirements = subIntent.requirements ?? [];
    const comparisonRequirements = requirements.filter(
      (requirement) =>
        requirement.type === "comparison" ||
        describesReferenceDocumentCheck(requirement.description)
    );
    const investigativeRequirements = requirements.filter(
      (requirement) => !comparisonRequirements.includes(requirement)
    );
    // A requirement may use the semantic type "comparison" even when its
    // operation is risk_flag (for example, ranking several risk dimensions).
    // Only split a sub-intent when it genuinely mixes comparison work with
    // another requirement class. Pure operation sub-intents retain the
    // classifier's operation and perspective.
    if (
      comparisonRequirements.length === 0 ||
      investigativeRequirements.length === 0
    ) {
      expanded.push(normalizeInheritedStandard(intent, subIntent));
      continue;
    }
    expanded.push(
      normalizeInheritedStandard(intent, {
        ...subIntent,
        description: investigativeRequirements
          .map((requirement) => requirement.description)
          .join("; "),
        requirements: investigativeRequirements,
      })
    );
    expanded.push({
      ...subIntent,
      operation: "compare",
      standard: subIntent.standard.startsWith("reference_document:")
        ? subIntent.standard
        : "reference_document:uploaded_reference",
      reportType: "risk_audit",
      outputForm: "redline_diff",
      description: comparisonRequirements
        .map((requirement) => requirement.description)
        .join("; "),
      requirements: comparisonRequirements,
    });
  }
  return { ...intent, compound: expanded.length > 1, subIntents: expanded };
}

function describesReferenceDocumentCheck(description: string): boolean {
  const normalized = description.toLowerCase();
  return (
    /\b(playbook|reference document|benchmark|contracting baseline|policy baseline)\b/.test(
      normalized
    ) ||
    /\bagainst\s+(?:the\s+)?(?:uploaded|provided|selected)\b/.test(normalized)
  );
}

/**
 * Builds independent operation graphs, then shares only preparation whose
 * semantic cache key is safe (same document and preparation kind). No legal
 * rule, clause id, risk category or eval wording is encoded here.
 */
export function buildCompoundBranchGraph(
  input: BuildCompoundBranchGraphInput
): CompoundBranchGraphResult {
  const facets = dedupeSubIntents(input.parentIntent.subIntents);
  const pending: Array<{
    facetId: string;
    order: number;
    label: string;
    instruction: string;
    intent: IntentClassification;
    focus?: InstructionFocus;
    referenceDocId?: string;
    graph: ReturnType<typeof replicateGraphForTargets>;
    reportSpec: ReportSpec;
  }> = [];

  for (const [order, facet] of facets.entries()) {
    const facetId = `facet_${facet.originalIndexes[0]! + 1}`;
    const facetIntent = intentForFacet(input.parentIntent, facet.subIntent);
    const facetInstruction = instructionForFacet(input.instruction, facet.subIntent);
    const facetFocus = focusForFacet(input.focus, facetIntent);
    const sourceFacetIds = new Set(
      facet.originalIndexes.map((index) => `facet_${index + 1}`)
    );
    const facetPackages = (input.extraPackages ?? [])
      .filter((pkg) => pkg.facetId && sourceFacetIds.has(pkg.facetId))
      .map((pkg) => ({ ...pkg, facetId }));
    const usesReference =
      facetIntent.operation === "compare" ||
      facetIntent.standard.startsWith("reference_document:");
    // Runtime S3/open packages already contain paired reference propositions.
    // Do not also schedule the legacy playbook checker for the same branch.
    const facetReferenceDocId =
      usesReference && facetPackages.length === 0 ? input.referenceDocId : undefined;
    const seedType = facetIntent.reportType ?? fallbackReportType(facetIntent.operation);
    const seedDepth = facetIntent.depth ?? "standard";
    const seedReportSpec: ReportSpec = {
      reportType: seedType,
      depth: seedDepth,
      sections: deriveSections(seedType, seedDepth, facetIntent.operation),
    };
    const targetGraphs = input.targetDocIds.map((docId) =>
      buildActGraphDetailed({
        docId,
        instruction: facetInstruction,
        skills: input.skills,
        intent: facetIntent,
        focus: facetFocus,
        relatedChecks: input.relatedChecks,
        unresolvedStandard: facetIntent.unresolvedStandard,
        referenceDocId: facetReferenceDocId,
        reportSpec: seedReportSpec,
        extraPackages: facetPackages,
      })
    );
    const graph = replicateGraphForTargets(targetGraphs);
    const reportPackages =
      graph.packageResolution.reportPackages ??
      graph.packageResolution.packages.map((item) => item.pkg);
    const merged = resolveReportSpecFromPackages({
      intent: facetIntent,
      instruction: facetInstruction,
      packages: reportPackages,
      fallbackReportType: seedType,
      sectionOperation: facetIntent.operation,
    });
    const reportSpec = buildFinalReportSpec({
      intent: facetIntent,
      reportType: merged.reportType,
      depth: seedDepth,
      sections: merged.sections,
      outlineExtras: merged.outlineExtras,
      instruction: facetInstruction,
    });
    pending.push({
      facetId,
      order,
      label: facet.subIntent.description?.trim() || humanizeOperation(facetIntent.operation),
      instruction: facetInstruction,
      intent: facetIntent,
      focus: facetFocus,
      referenceDocId: facetReferenceDocId,
      graph,
      reportSpec,
    });
  }

  const combined = combineBranchUnits(pending);
  const mode = input.thinkingMode === "deep" ? "deep" : "lite";
  const branches: AnalysisBranchPlan[] = pending.map((item) => {
    const ownedWorkUnitIds = combined.workUnits
      .filter((unit) => unit.facetId === item.facetId)
      .map((unit) => unit.workUnitId);
    const workUnitIds = dependencyClosure(combined.workUnits, ownedWorkUnitIds);
    const requirementBindings = item.graph.packageResolution.requirementBindings.map(
      (binding) => ({ ...binding, facetId: item.facetId })
    );
    const requirementExecutionPaths = item.graph.packageResolution.requirementPaths.map(
      (path) => ({ ...path, facetId: item.facetId })
    );
    return {
      facetId: item.facetId,
      order: item.order,
      label: item.label,
      instruction: item.instruction,
      intent: item.intent,
      targetDocIds: input.targetDocIds,
      referenceDocId: item.referenceDocId,
      partyPerspective: item.intent.partyPerspective,
      capabilityContract: capabilityContractFor(item.intent.operation),
      reportSpec: item.reportSpec,
      rendererSchemaId: item.graph.rendererSchemaId,
      activeSkillIds: input.skills.map((skill) => skill.skillId),
      focus: item.focus,
      requirementExecutionPaths,
      requirementBindings,
      workUnitIds,
      timeBudget: branchTimeBudget(mode, combined.workUnits.filter((u) => u.facetId === item.facetId)),
    };
  });

  return {
    branches,
    workUnits: combined.workUnits,
    requirementBindings: branches.flatMap((branch) => branch.requirementBindings),
    requirementExecutionPaths: branches.flatMap(
      (branch) => branch.requirementExecutionPaths
    ),
  };
}

function branchTimeBudget(
  thinkingMode: "lite" | "deep",
  units: AnalysisWorkUnit[]
): AnalysisBranchTimeBudget {
  const baseVerificationMs = thinkingMode === "deep" ? 90_000 : 45_000;
  const maxVerificationMs = thinkingMode === "deep" ? 150_000 : 75_000;
  const hardCeilingMs = thinkingMode === "deep" ? 360_000 : 180_000;
  return {
    thinkingMode,
    baseVerificationMs,
    maxVerificationMs,
    hardCeilingMs,
    retryFailedRequirements: thinkingMode === "deep" ? 1 : 0,
    estimatedCriticalPathMs: Math.min(
      hardCeilingMs,
      estimateCriticalPathMs(units, maxVerificationMs)
    ),
  };
}

function estimateCriticalPathMs(units: AnalysisWorkUnit[], verifyMs: number): number {
  const costs = new Map<string, number>();
  for (const unit of orderByDependency(units)) {
    const own =
      unit.tool === "evaluate_package"
        ? verifyMs
        : unit.tool === "render_output"
          ? 30_000
          : unit.tool === "extract_clauses" || unit.tool === "inventory_provisions"
            ? 20_000
            : 5_000;
    const dependencyCost = Math.max(0, ...unit.dependsOn.map((id) => costs.get(id) ?? 0));
    costs.set(unit.workUnitId, dependencyCost + own);
  }
  return Math.max(0, ...costs.values());
}

function dedupeSubIntents(subIntents: IntentSubIntent[]): Array<{
  originalIndexes: number[];
  subIntent: IntentSubIntent;
}> {
  const seen = new Set<string>();
  const out: Array<{ originalIndexes: number[]; subIntent: IntentSubIntent }> = [];
  subIntents.forEach((subIntent, originalIndex) => {
    // Drafting/negotiation advice is a projection of verified findings. Fold
    // it into the nearest investigative branch so ACT does not repeat the
    // evidence search merely to phrase recommendations.
    if (subIntent.operation === "draft_suggestion" && out.length > 0) {
      const target = [...out].reverse().find((item) =>
        subIntent.standard === "none" ||
        item.subIntent.standard === subIntent.standard
      );
      if (target) {
        target.originalIndexes.push(originalIndex);
        target.subIntent = mergeSubIntents(target.subIntent, subIntent);
        return;
      }
    }
    const key = JSON.stringify([
      subIntent.operation,
      subIntent.standard,
      subIntent.outputForm,
      subIntent.reportType,
      subIntent.depth,
    ]);
    const existing = out.find((item) =>
      JSON.stringify([
        item.subIntent.operation,
        item.subIntent.standard,
        item.subIntent.outputForm,
        item.subIntent.reportType,
        item.subIntent.depth,
      ]) === key
    );
    if (existing) {
      existing.originalIndexes.push(originalIndex);
      existing.subIntent = mergeSubIntents(existing.subIntent, subIntent);
      return;
    }
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ originalIndexes: [originalIndex], subIntent });
  });
  return out;
}

function mergeSubIntents(
  first: IntentSubIntent,
  second: IntentSubIntent
): IntentSubIntent {
  const requirements = [...(first.requirements ?? []), ...(second.requirements ?? [])];
  const byId = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  const descriptions = [first.description, second.description]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return {
    ...first,
    description: [...new Set(descriptions)].join("; ") || first.description,
    requirements: [...byId.values()],
  };
}

function intentForFacet(
  parent: IntentClassification,
  subIntent: IntentSubIntent
): IntentClassification {
  return {
    ...parent,
    operation: subIntent.operation,
    standard: subIntent.standard,
    standardConcept:
      subIntent.standard === parent.standard ? parent.standardConcept : undefined,
    outputForm: subIntent.outputForm,
    reportType: subIntent.reportType ?? fallbackReportType(subIntent.operation),
    depth: subIntent.depth ?? parent.depth,
    compound: false,
    subIntents: [],
    requirements: subIntent.requirements ?? [],
  };
}

function normalizeInheritedStandard(
  parent: IntentClassification,
  subIntent: IntentSubIntent
): IntentSubIntent {
  if (
    subIntent.operation === "compliance_check" &&
    subIntent.standard === "none" &&
    parent.standard.startsWith("regime_pack:")
  ) {
    return { ...subIntent, standard: parent.standard };
  }
  return subIntent;
}

function instructionForFacet(parentInstruction: string, subIntent: IntentSubIntent): string {
  const requirements = (subIntent.requirements ?? [])
    .map((requirement) => requirement.description.trim())
    .filter(Boolean);
  return [subIntent.description?.trim(), ...requirements].filter(Boolean).join("; ") || parentInstruction;
}

function focusForFacet(
  focus: InstructionFocus | undefined,
  intent: IntentClassification
): InstructionFocus | undefined {
  if (!focus) return undefined;
  const requestIds = new Set(intent.requirements.map((requirement) => requirement.id));
  const mappings = (focus.requirementMappings ?? []).filter((mapping) =>
    requestIds.has(mapping.requirementId)
  );
  const capabilityIds = new Set(mappings.flatMap((mapping) => mapping.capabilityIds));
  const isRegimeCompliance =
    intent.operation === "compliance_check" && intent.standard.startsWith("regime_pack:");
  if (!isRegimeCompliance && capabilityIds.size === 0) return undefined;
  const retain = (id: string) => capabilityIds.size === 0 || capabilityIds.has(id);
  return {
    ...focus,
    instructionText: instructionForFacet(focus.instructionText, {
      operation: intent.operation,
      standard: intent.standard,
      outputForm: intent.outputForm,
      requirements: intent.requirements,
    }),
    requirements: (focus.requirements ?? []).filter((requirement) =>
      requestIds.has(requirement.id)
    ),
    requirementMappings: mappings,
    ruleIds: focus.ruleIds.filter(retain),
    matrixRowIds: focus.matrixRowIds.filter(retain),
    riskCategoryIds: focus.riskCategoryIds.filter(retain),
    requiredCapabilities: [...capabilityIds],
    supportingCapabilities: [],
    selectedPackageIds: undefined,
  };
}

function combineBranchUnits(
  branches: Array<{
    facetId: string;
    order: number;
    label: string;
    graph: ReturnType<typeof replicateGraphForTargets>;
  }>
): { workUnits: AnalysisWorkUnit[] } {
  const idMap = new Map<string, string>();
  const sharedByKey = new Map<string, AnalysisWorkUnit>();
  const branchUnits: AnalysisWorkUnit[] = [];

  for (const branch of branches) {
    for (const unit of branch.graph.workUnits) {
      const localKey = `${branch.facetId}|${unit.workUnitId}`;
      const sharedKey = preparationKey(unit);
      const id = sharedKey
        ? `shared-${slug(sharedKey)}`
        : `${branch.facetId}-${unit.workUnitId}`;
      idMap.set(localKey, id);
      if (sharedKey) {
        const existing = sharedByKey.get(sharedKey);
        if (!existing) {
          sharedByKey.set(sharedKey, { ...unit, workUnitId: id, facetId: undefined });
        } else if (unit.tool === "extract_clauses") {
          sharedByKey.set(sharedKey, mergeExtractUnits(existing, unit));
        }
      }
    }
  }

  const sharedUnits = [...sharedByKey.entries()].map(([key, unit]) => ({
    ...unit,
    dependsOn: dedupe(
      branches.flatMap((branch) => {
        const matching = branch.graph.workUnits.find(
          (candidate) => preparationKey(candidate) === key
        );
        return matching
          ? matching.dependsOn.map(
              (dep) => idMap.get(`${branch.facetId}|${dep}`) ?? `${branch.facetId}-${dep}`
            )
          : [];
      })
    ).filter((dep) => dep !== unit.workUnitId),
  }));

  for (const branch of branches) {
    for (const unit of branch.graph.workUnits) {
      if (preparationKey(unit)) continue;
      branchUnits.push({
        ...unit,
        workUnitId: idMap.get(`${branch.facetId}|${unit.workUnitId}`)!,
        facetId: branch.facetId,
        input: {
          ...unit.input,
          facetId: branch.facetId,
          branchOrder: branch.order,
          branchLabel: branch.label,
        },
        dependsOn: unit.dependsOn.map(
          (dep) => idMap.get(`${branch.facetId}|${dep}`) ?? `${branch.facetId}-${dep}`
        ),
      });
    }
  }

  const renderIds = branchUnits
    .filter((unit) => unit.tool === "render_output")
    .sort((a, b) => Number(a.input.branchOrder ?? 0) - Number(b.input.branchOrder ?? 0))
    .map((unit) => unit.workUnitId);
  const mergeUnit: AnalysisWorkUnit = {
    workUnitId: "wu-merge-branch-outputs",
    tool: "merge_branch_outputs",
    input: { branchOrder: branches.map((branch) => branch.facetId) },
    dependsOn: renderIds,
    outputSchema: "string",
    status: "pending",
  };
  return { workUnits: orderByDependency([...sharedUnits, ...branchUnits, mergeUnit]) };
}

function preparationKey(unit: AnalysisWorkUnit): string | undefined {
  const docId = String(unit.input.docId ?? unit.input.playbookDocId ?? "");
  if (unit.tool === "classify_document") return `classify:${docId}`;
  if (unit.tool === "extract_clauses") return `clauses:${docId}`;
  if (unit.tool === "extract_playbook_positions") return `playbook:${docId}`;
  if (unit.tool === "inventory_provisions") return `inventory:${stableInput(unit.input)}`;
  if (unit.tool === "extract_shared_evidence") return `evidence:${stableInput(unit.input)}`;
  return undefined;
}

function mergeExtractUnits(existing: AnalysisWorkUnit, incoming: AnalysisWorkUnit): AnalysisWorkUnit {
  return {
    ...existing,
    input: {
      ...existing.input,
      instruction: String(existing.input.instruction ?? incoming.input.instruction ?? ""),
      clauseTypes: dedupe([
        ...stringArray(existing.input.clauseTypes),
        ...stringArray(incoming.input.clauseTypes),
      ]),
      skillIds: dedupe([
        ...stringArray(existing.input.skillIds),
        ...stringArray(incoming.input.skillIds),
      ]),
      unionPlaybookClauseTypes:
        existing.input.unionPlaybookClauseTypes === true ||
        incoming.input.unionPlaybookClauseTypes === true,
      referenceDocId: existing.input.referenceDocId ?? incoming.input.referenceDocId,
    },
  };
}

function stableInput(input: Record<string, unknown>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(input)
        .filter(([key]) => key !== "instruction" && key !== "facetId")
        .sort(([a], [b]) => a.localeCompare(b))
    )
  );
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function dedupe<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
}

function humanizeOperation(operation: string): string {
  return operation
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dependencyClosure(
  units: AnalysisWorkUnit[],
  seedIds: string[]
): string[] {
  const byId = new Map(units.map((unit) => [unit.workUnitId, unit]));
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency);
  };
  seedIds.forEach(visit);
  return [...seen];
}
