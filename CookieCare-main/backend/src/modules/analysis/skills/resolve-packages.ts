import type { AnalysisSkillConfig } from "./types.js";
import {
  analysisPackageKind,
  type EvidencePackage,
} from "../models/evidence-package.js";
import type {
  InstructionFocus,
  RequirementExecutionPath,
} from "../models/analysis-plan.js";
import type { IntentRequirement, IntentRequirementType } from "../models/intent.js";
import { mergeEvidencePackages } from "./registry.js";
import { pacLog } from "../utils/pac-log.js";
import {
  capabilityIdMatchesScope,
  ruleIdMatchesScope,
  scopeBoundaryActive,
} from "./extract-explicit-scope.js";

/** Max named rules that may execute as direct check_against_rule for verification. */
export const NAMED_RULE_DIRECT_THRESHOLD = 3;

const REQUIREMENT_ID_ALIASES: Record<string, string> = {
  nature_and_purpose: "nature_purpose",
  nature_purpose: "nature_purpose",
  categories_of_data: "data_categories",
  data_categories: "data_categories",
  categories_of_data_subjects: "data_subject_categories",
  data_subject_categories: "data_subject_categories",
  controller_obligations_and_rights: "controller_obligations_rights",
  controller_obligations_rights: "controller_obligations_rights",
  mandatory_article_28_3_clauses: "mandatory_article28_clauses",
  mandatory_article28_clauses: "mandatory_article28_clauses",
  international_data_transfers: "international_data_transfer",
  international_data_transfer: "international_data_transfer",
  international_transfer: "international_data_transfer",
};

export interface ResolvedPackage {
  pkg: EvidencePackage;
  /**
   * Requirement ids this package should establish for THIS run: the package's
   * authored requirementIds plus any PLAN requirement whose mapped capability
   * falls inside the package. Empty means "use the package's authored set".
   */
  requirementIds: string[];
}

export interface PackageResolution {
  /** Ordered, de-duplicated packages to execute (dependency order). */
  packages: ResolvedPackage[];
  /** requirementId -> packageId (first package that can establish it wins). */
  requirementToPackageId: Record<string, string>;
  requirementPaths: RequirementExecutionPath[];
  leftoverRuleIds: string[];
  leftoverMatrixRowIds: string[];
  leftoverRiskCategoryIds: string[];
  blockedCapabilityIds: string[];
}

export class PlanExecutionContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanExecutionContractError";
  }
}

function scopedRuleIds(ids: string[], focus?: InstructionFocus): string[] {
  const scope = focus?.explicitScope;
  if (!scope || !scopeBoundaryActive(scope)) return ids;
  return ids.filter((id) => ruleIdMatchesScope(id, scope));
}

function scopedCapabilityIds(ids: string[], focus?: InstructionFocus): string[] {
  const scope = focus?.explicitScope;
  if (!scope || !scopeBoundaryActive(scope)) return ids;
  return ids.filter((id) => capabilityIdMatchesScope(id, scope));
}

interface PlanReq {
  id: string;
  type: IntentRequirementType;
  label: string;
}

/**
 * Deterministically map PLAN focus + typed intent requirements to authored
 * AnalysisPackages. Selection is requirement-first, then kind, then capability.
 * Extraction/coverage requirements never fall back to per-rule fan-out.
 */
export function resolvePackages(
  skills: AnalysisSkillConfig[],
  focus?: InstructionFocus,
  intentRequirements?: IntentRequirement[]
): PackageResolution {
  const allPackages = mergeEvidencePackages(skills);
  const empty: PackageResolution = {
    packages: [],
    requirementToPackageId: {},
    requirementPaths: [],
    leftoverRuleIds: [],
    leftoverMatrixRowIds: [],
    leftoverRiskCategoryIds: [],
    blockedCapabilityIds: [],
  };
  if (allPackages.length === 0) {
    const planReqs = collectPlanRequirements(focus, intentRequirements);
    const requirementPaths = planReqs.map((req) => pathForUnpackaged(req, focus));
    const blockedCapabilityIds = new Set<string>();
    for (const req of planReqs) {
      if (req.type !== "extraction" && req.type !== "coverage") continue;
      for (const capId of mappedCapabilitiesFor(req.id, focus)) blockedCapabilityIds.add(capId);
    }
    const extractionOnly =
      planReqs.length > 0 &&
      planReqs.every((req) => req.type === "extraction" || req.type === "coverage");
    return {
      ...empty,
      leftoverRuleIds: extractionOnly
        ? []
        : scopedRuleIds(focus?.ruleIds ?? [], focus).filter(
            (id) => !blockedCapabilityIds.has(id)
          ),
      leftoverMatrixRowIds: extractionOnly
        ? []
        : scopedCapabilityIds(focus?.matrixRowIds ?? [], focus).filter(
            (id) => !blockedCapabilityIds.has(id)
          ),
      leftoverRiskCategoryIds: extractionOnly
        ? []
        : (focus?.riskCategoryIds ?? []).filter((id) => !blockedCapabilityIds.has(id)),
      blockedCapabilityIds: [...blockedCapabilityIds],
      requirementPaths,
    };
  }

  const planReqs = collectPlanRequirements(focus, intentRequirements);
  const requestedCapabilities = collectRequestedCapabilities(focus);
  const packageById = new Map(allPackages.map((pkg) => [pkg.id, pkg]));
  const capabilityToPackage = new Map<string, EvidencePackage>();
  const requirementIdToPackages = new Map<string, EvidencePackage[]>();
  const kindToPackages = new Map<IntentRequirementType, EvidencePackage[]>();

  for (const pkg of allPackages) {
    for (const capId of pkg.capabilityIds) {
      if (!capabilityToPackage.has(capId)) capabilityToPackage.set(capId, pkg);
    }
    for (const reqId of pkg.requirementIds) {
      const key = normalizeRequirementId(reqId);
      const list = requirementIdToPackages.get(key) ?? [];
      list.push(pkg);
      requirementIdToPackages.set(key, list);
    }
    for (const kind of pkg.requirementKinds ?? []) {
      const list = kindToPackages.get(kind) ?? [];
      list.push(pkg);
      kindToPackages.set(kind, list);
    }
  }

  const selected = new Map<string, EvidencePackage>();
  const requirementToPackageId: Record<string, string> = {};
  const packageExtraRequirements = new Map<string, Set<string>>();
  const requirementPaths: RequirementExecutionPath[] = [];
  const blockedCapabilityIds = new Set<string>();
  const directRuleIds = new Set<string>();

  const catalogPackageIds = new Set(
    scopedCapabilityIds(focus?.selectedPackageIds ?? [], focus)
  );
  for (const id of catalogPackageIds) {
    const pkg = packageById.get(id);
    if (pkg) selected.set(pkg.id, pkg);
  }

  if (planReqs.length > 0) {
    for (const req of planReqs) {
      const mappedCaps = mappedCapabilitiesFor(req.id, focus);
      const byReqId = requirementIdToPackages.get(normalizeRequirementId(req.id)) ?? [];
      const byTopic = pickBySemanticTopics(allPackages, req);
      const byKind = kindToPackages.get(req.type) ?? [];
      const byCap = mappedCaps
        .map((capId) =>
          packageById.has(capId) ? packageById.get(capId) : capabilityToPackage.get(capId)
        )
        .filter((pkg): pkg is EvidencePackage => Boolean(pkg));

      const isInventoryReq = req.type === "extraction" || req.type === "coverage";
      const candidate =
        pickKindMatch(byReqId, req.type) ??
        byTopic ??
        (isInventoryReq ? undefined : pickKindMatch(byKind, req.type) ?? byCap[0]);

      if (candidate && defersToMatrixSubgraph(candidate, focus)) {
        const matrixIds = (focus?.matrixRowIds ?? []).filter((id) =>
          candidate.capabilityIds.includes(id)
        );
        requirementPaths.push({
          requirementId: req.id,
          status: "supported",
          ruleIds: matrixIds,
          requirementType: req.type,
          reason: "Focused rights-matrix rows execute as evaluate_matrix_row",
        });
        continue;
      }

      if (candidate) {
        selected.set(candidate.id, candidate);
        requirementToPackageId[req.id] = candidate.id;
        addExtraRequirement(packageExtraRequirements, candidate.id, req.id);
        if (req.type === "extraction" || req.type === "coverage") {
          for (const capId of mappedCaps) blockedCapabilityIds.add(capId);
        }
        requirementPaths.push({
          requirementId: req.id,
          status: "supported",
          packageId: candidate.id,
          requirementType: req.type,
        });
        continue;
      }

      if (req.type === "extraction" || req.type === "coverage") {
        for (const capId of mappedCaps) blockedCapabilityIds.add(capId);
        requirementPaths.push({
          requirementId: req.id,
          status: "not_supported",
          requirementType: req.type,
          reason: `No analysis package for ${req.type} requirement "${req.id}"`,
        });
        continue;
      }

      if (req.type === "verification" || req.type === "adequacy") {
        const ruleIds = mappedCaps.filter((id) => looksLikeRuleId(id, skills));
        const usable =
          ruleIds.length > 0 && ruleIds.length <= NAMED_RULE_DIRECT_THRESHOLD
            ? ruleIds
            : [];
        if (usable.length > 0) {
          for (const id of usable) directRuleIds.add(id);
          requirementPaths.push({
            requirementId: req.id,
            status: "direct_rule",
            ruleIds: usable,
            requirementType: req.type,
          });
          continue;
        }
      }

      requirementPaths.push({
        requirementId: req.id,
        status: "not_supported",
        requirementType: req.type,
        reason: `No analysis package or named-rule mapping for "${req.id}"`,
      });
    }
  } else if (requestedCapabilities.size === 0 && catalogPackageIds.size === 0) {
    for (const pkg of allPackages) selected.set(pkg.id, pkg);
  } else {
    for (const pkg of allPackages) {
      if (defersToMatrixSubgraph(pkg, focus)) continue;
      if (pkg.capabilityIds.some((capId) => requestedCapabilities.has(capId))) {
        selected.set(pkg.id, pkg);
      }
    }
  }

  // Pull declarative dependencies (inventory before evaluation).
  const pending = [...selected.values()];
  while (pending.length > 0) {
    const pkg = pending.pop()!;
    for (const depId of pkg.requiresPackages ?? []) {
      const dep = packageById.get(depId);
      if (!dep || selected.has(dep.id)) continue;
      selected.set(dep.id, dep);
      pending.push(dep);
      requirementPaths.push({
        requirementId: `_dep:${dep.id}`,
        status: "supported_via_dependency",
        packageId: dep.id,
        reason: `Required by package ${pkg.id}`,
      });
    }
  }

  for (const mapping of focus?.requirementMappings ?? []) {
    for (const capId of mapping.capabilityIds) {
      const pkg = packageById.get(capId) ?? capabilityToPackage.get(capId);
      if (!pkg || !selected.has(pkg.id)) continue;
      if (!requirementToPackageId[mapping.requirementId]) {
        requirementToPackageId[mapping.requirementId] = pkg.id;
      }
      addExtraRequirement(packageExtraRequirements, pkg.id, mapping.requirementId);
    }
  }

  const ordered = orderByRequires([...selected.values()]);
  const packages: ResolvedPackage[] = ordered.map((pkg) => {
    const authored = pkg.requirementIds;
    const extra = [...(packageExtraRequirements.get(pkg.id) ?? new Set())];
    const requirementIds = [...new Set([...authored, ...extra])];
    for (const reqId of authored) {
      if (!requirementToPackageId[reqId]) requirementToPackageId[reqId] = pkg.id;
    }
    return { pkg, requirementIds };
  });

  const ownedCaps = new Set<string>();
  for (const { pkg } of packages) {
    for (const capId of pkg.capabilityIds) ownedCaps.add(capId);
  }

  const leftoverRuleIds = scopedRuleIds(
    (focus?.ruleIds ?? []).filter(
      (id) => !ownedCaps.has(id) && !blockedCapabilityIds.has(id)
    ),
    focus
  );
  const leftoverMatrixRowIds = scopedCapabilityIds(
    (focus?.matrixRowIds ?? []).filter(
      (id) => !ownedCaps.has(id) && !blockedCapabilityIds.has(id)
    ),
    focus
  );
  const leftoverRiskCategoryIds = (focus?.riskCategoryIds ?? []).filter(
    (id) => !ownedCaps.has(id) && !blockedCapabilityIds.has(id)
  );
  for (const id of scopedRuleIds([...directRuleIds], focus)) {
    if (!ownedCaps.has(id) && !leftoverRuleIds.includes(id)) leftoverRuleIds.push(id);
  }

  const resolution: PackageResolution = {
    packages,
    requirementToPackageId,
    requirementPaths,
    leftoverRuleIds,
    leftoverMatrixRowIds,
    leftoverRiskCategoryIds,
    blockedCapabilityIds: [...blockedCapabilityIds],
  };
  pacLog("PLAN package resolution", {
    packages: resolution.packages.map((p) => p.pkg.id),
    requirementToPackageId: resolution.requirementToPackageId,
    requirementPaths: resolution.requirementPaths.map((p) => ({
      requirementId: p.requirementId,
      status: p.status,
      packageId: p.packageId,
      requirementType: p.requirementType,
    })),
    leftoverRuleIds: resolution.leftoverRuleIds,
  });
  return resolution;
}

/**
 * Guard: extraction/coverage must never be scheduled as check_against_rule.
 * Unsupported requirements are recorded, not silently rewritten.
 */
export function validatePlannedWork(resolution: PackageResolution): void {
  for (const path of resolution.requirementPaths) {
    if (
      (path.requirementType === "extraction" || path.requirementType === "coverage") &&
      path.status === "direct_rule"
    ) {
      throw new PlanExecutionContractError(
        `No analysis package or rule mapping for ${path.requirementId}: extraction must not fall back to check_against_rule`
      );
    }
  }
}

export function hasUnsupportedExtraction(resolution: PackageResolution): boolean {
  return resolution.requirementPaths.some(
    (path) =>
      (path.requirementType === "extraction" || path.requirementType === "coverage") &&
      path.status === "not_supported"
  );
}

export function normalizeRequirementId(id: string): string {
  const raw = id.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return REQUIREMENT_ID_ALIASES[raw] ?? raw;
}

function collectPlanRequirements(
  focus?: InstructionFocus,
  intentRequirements?: IntentRequirement[]
): PlanReq[] {
  const byId = new Map<string, PlanReq>();
  for (const req of intentRequirements ?? []) {
    if (!req.id) continue;
    byId.set(normalizeRequirementId(req.id), {
      id: req.id,
      type: req.type,
      label: req.description,
    });
  }
  for (const req of focus?.requirements ?? []) {
    const key = normalizeRequirementId(req.id);
    const existing = byId.get(key);
    if (existing) continue;
    byId.set(key, {
      id: req.id,
      type: inferRequirementType(req.label ?? req.id),
      label: req.label,
    });
  }
  return [...byId.values()];
}

function inferRequirementType(text: string): IntentRequirementType {
  const hay = text.toLowerCase();
  if (/\b(list|identify|inventory|extract|every|all provisions|mentioned)\b/.test(hay)) {
    return "extraction";
  }
  if (/\b(coverage|complete|missing)\b/.test(hay)) return "coverage";
  if (/\b(adequa|sufficient|schrems|supplementary)\b/.test(hay)) return "adequacy";
  if (/\b(compare|playbook|versus|against the)\b/.test(hay)) return "comparison";
  if (/\b(whether|comply|compliance|verify|contain|include)\b/.test(hay)) {
    return "verification";
  }
  return "other";
}

function mappedCapabilitiesFor(requirementId: string, focus?: InstructionFocus): string[] {
  const mapping = focus?.requirementMappings?.find(
    (item) =>
      item.requirementId === requirementId ||
      normalizeRequirementId(item.requirementId) === normalizeRequirementId(requirementId)
  );
  const fromMapping = mapping?.capabilityIds ?? [];
  const selectedPackages = focus?.selectedPackageIds ?? [];
  return [...new Set([...fromMapping, ...selectedPackages])];
}

function collectRequestedCapabilities(focus?: InstructionFocus): Set<string> {
  const set = new Set<string>();
  if (!focus) return set;
  for (const id of focus.ruleIds ?? []) set.add(id);
  for (const id of focus.matrixRowIds ?? []) set.add(id);
  for (const id of focus.riskCategoryIds ?? []) set.add(id);
  for (const id of focus.requiredCapabilities ?? []) set.add(id);
  for (const id of focus.selectedPackageIds ?? []) set.add(id);
  for (const mapping of focus.requirementMappings ?? []) {
    for (const id of mapping.capabilityIds) set.add(id);
  }
  return set;
}

/**
 * Rights-matrix rows have a dedicated evaluate_matrix_row subgraph and renderer
 * that keys findings on matrixRowId. Grouped evaluate_package does not emit
 * those fields, so a package that merely owns focused matrix-row ids must not
 * swallow the matrix path.
 */
function defersToMatrixSubgraph(
  pkg: EvidencePackage,
  focus?: InstructionFocus
): boolean {
  const matrixIds = focus?.matrixRowIds ?? [];
  if (matrixIds.length === 0) return false;
  const matrixSet = new Set(matrixIds);
  return pkg.capabilityIds.some((id) => matrixSet.has(id));
}

function requirementHaystack(req: PlanReq): string {
  return `${req.id} ${req.label}`.toLowerCase().replace(/[\s-]+/g, "_");
}

function packageMatchesSemanticTopics(pkg: EvidencePackage, req: PlanReq): boolean {
  const topics = pkg.semanticTopics ?? [];
  if (topics.length === 0) return false;
  const kinds = pkg.requirementKinds ?? [];
  if (kinds.length > 0 && !kinds.includes(req.type)) return false;
  const hay = requirementHaystack(req);
  return topics.some((topic) => {
    const normalized = topic.toLowerCase().replace(/[\s-]+/g, "_");
    if (hay.includes(normalized)) return true;
    for (const part of normalized.split("_")) {
      if (part.length >= 3 && hay.includes(part)) return true;
    }
    return false;
  });
}

function pickBySemanticTopics(
  allPackages: EvidencePackage[],
  req: PlanReq
): EvidencePackage | undefined {
  const candidates = allPackages.filter((pkg) => packageMatchesSemanticTopics(pkg, req));
  return pickKindMatch(candidates, req.type);
}

function pickKindMatch(
  packages: EvidencePackage[],
  type: IntentRequirementType
): EvidencePackage | undefined {
  if (packages.length === 0) return undefined;
  if (type === "extraction" || type === "coverage") {
    return packages.find((pkg) => analysisPackageKind(pkg) === "inventory") ?? packages[0];
  }
  if (type === "verification" || type === "adequacy") {
    return (
      packages.find((pkg) => analysisPackageKind(pkg) === "evaluation") ?? packages[0]
    );
  }
  if (type === "comparison") {
    return packages.find((pkg) => analysisPackageKind(pkg) === "comparison") ?? packages[0];
  }
  return packages[0];
}

function looksLikeRuleId(id: string, skills: AnalysisSkillConfig[]): boolean {
  return skills.some((skill) => skill.regimeRules.some((rule) => rule.ruleId === id));
}

function addExtraRequirement(
  extra: Map<string, Set<string>>,
  packageId: string,
  requirementId: string
): void {
  const set = extra.get(packageId) ?? new Set<string>();
  set.add(requirementId);
  extra.set(packageId, set);
}

function pathForUnpackaged(req: PlanReq, focus?: InstructionFocus): RequirementExecutionPath {
  if (req.type === "extraction" || req.type === "coverage") {
    return {
      requirementId: req.id,
      status: "not_supported",
      requirementType: req.type,
      reason: `No analysis package for ${req.type} requirement "${req.id}"`,
    };
  }
  const mapped = mappedCapabilitiesFor(req.id, focus).filter((id) =>
    (focus?.ruleIds ?? []).includes(id)
  );
  if (
    (req.type === "verification" || req.type === "adequacy") &&
    mapped.length > 0 &&
    mapped.length <= NAMED_RULE_DIRECT_THRESHOLD
  ) {
    return {
      requirementId: req.id,
      status: "direct_rule",
      ruleIds: mapped,
      requirementType: req.type,
    };
  }
  return {
    requirementId: req.id,
    status: "not_supported",
    requirementType: req.type,
    reason: `No analysis package or named-rule mapping for "${req.id}"`,
  };
}

function orderByRequires(packages: EvidencePackage[]): EvidencePackage[] {
  const byId = new Map(packages.map((pkg) => [pkg.id, pkg]));
  const visiting = new Set<string>();
  const seen = new Set<string>();
  const out: EvidencePackage[] = [];

  const visit = (pkg: EvidencePackage) => {
    if (seen.has(pkg.id)) return;
    if (visiting.has(pkg.id)) return;
    visiting.add(pkg.id);
    for (const depId of pkg.requiresPackages ?? []) {
      const dep = byId.get(depId);
      if (dep) visit(dep);
    }
    visiting.delete(pkg.id);
    seen.add(pkg.id);
    out.push(pkg);
  };

  for (const pkg of packages) visit(pkg);
  return out;
}
