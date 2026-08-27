import type { AnalysisSkillConfig } from "../catalog/types.js";
import {
  analysisPackageKind,
  type EvidencePackage,
} from "../../../models/evidence-package.js";
import type {
  InstructionFocus,
  RequirementExecutionPath,
  ScopeAuditEntry,
} from "../../../models/analysis-plan.js";
import type { IntentRequirement, IntentRequirementType } from "../../../models/intent.js";
import { mergeEvidencePackages } from "../catalog/registry.js";
import { pacLog } from "../../../utils/pac-log.js";
import {
  capabilityIdMatchesScope,
  packageIdMatchesScope,
  ruleIdMatchesScope,
  scopeBoundaryActive,
} from "../focus/extract-explicit-scope.js";
import { matchMetaRequirementBindings } from "./meta-requirement-bindings.js";
import { phraseMapCompanionRuleIds } from "../focus/extract-instruction-focus.js";
import {
  canonicalRequirementId,
  registerPackageRequirementIds,
} from "../../../shared/requirement-identity.js";

/** Max named rules that may execute as direct check_against_rule for verification. */
export const NAMED_RULE_DIRECT_THRESHOLD = 3;

export interface ResolvedPackage {
  pkg: EvidencePackage;
  /**
   * Requirement ids this package should establish for THIS run: the package's
   * authored requirementIds plus any PLAN requirement whose mapped capability
   * falls inside the package. Empty means "use the package's authored set".
   */
  requirementIds: string[];
  /** In-scope capability ids scheduled for standalone evaluation. */
  capabilityIds: string[];
  /** Out-of-scope authored capabilities retained as reference context only. */
  contextCapabilityIds: string[];
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
  /** Audit trail for explicit-scope filtering during package resolution. */
  scopeAudit: ScopeAuditEntry[];
  /**
   * Packages whose `report` block should seed ReportSpec even when ACT defers
   * the package (matrix-owner packages skipped in favor of evaluate_matrix_row).
   */
  reportPackages?: EvidencePackage[];
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

function dedupeStrings(ids: string[]): string[] {
  return [...new Set(ids)];
}

function isMatrixLinkedRule(
  ruleId: string,
  skills: AnalysisSkillConfig[],
  matrixRowIds: string[]
): boolean {
  if (matrixRowIds.length === 0) return false;
  const matrixSet = new Set(matrixRowIds);
  for (const skill of skills) {
    const rule = skill.regimeRules?.find((candidate) => candidate.ruleId === ruleId);
    if (rule?.matrixLinkage?.matrixRowIds?.some((id) => matrixSet.has(id))) {
      return true;
    }
    for (const pkg of skill.evidencePackages ?? []) {
      if (!pkg.capabilityIds.includes(ruleId)) continue;
      if (pkg.capabilityIds.some((id) => matrixSet.has(id))) return true;
    }
  }
  return false;
}

function ruleOverlapsFocusedMatrix(
  ruleId: string,
  skills: AnalysisSkillConfig[],
  matrixRowIds: string[],
  focus?: InstructionFocus
): boolean {
  if (isMatrixLinkedRule(ruleId, skills, matrixRowIds)) return true;
  return (focus?.requirementMappings ?? []).some(
    (mapping) =>
      mapping.capabilityIds.includes(ruleId) &&
      mapping.capabilityIds.some((id) => matrixRowIds.includes(id))
  );
}

function splitPackageCapabilities(
  pkg: EvidencePackage,
  focus?: InstructionFocus
): { capabilityIds: string[]; contextCapabilityIds: string[] } {
  const authored = pkg.capabilityIds;
  if (!focus?.explicitScope || !scopeBoundaryActive(focus.explicitScope)) {
    return { capabilityIds: authored, contextCapabilityIds: [] };
  }
  const capabilityIds = scopedCapabilityIds(authored, focus);
  const capabilitySet = new Set(capabilityIds);
  const contextCapabilityIds = authored.filter((id) => !capabilitySet.has(id));
  return { capabilityIds, contextCapabilityIds };
}

function packageEligibleUnderScope(pkg: EvidencePackage, focus?: InstructionFocus): boolean {
  const scope = focus?.explicitScope;
  if (!scope || !scopeBoundaryActive(scope)) return true;
  if (!packageIdMatchesScope(pkg.id, scope)) return false;
  if (pkg.capabilityIds.length === 0) return true;
  return splitPackageCapabilities(pkg, focus).capabilityIds.length > 0;
}

function upsertScopeAudit(
  audit: Map<string, ScopeAuditEntry>,
  packageId: string,
  patch: Partial<Pick<ScopeAuditEntry, "droppedCapabilityIds" | "droppedDependencyIds">>
): void {
  const existing = audit.get(packageId) ?? {
    packageId,
    droppedCapabilityIds: [],
    droppedDependencyIds: [],
  };
  if (patch.droppedCapabilityIds?.length) {
    existing.droppedCapabilityIds = [
      ...new Set([...existing.droppedCapabilityIds, ...patch.droppedCapabilityIds]),
    ];
  }
  if (patch.droppedDependencyIds?.length) {
    existing.droppedDependencyIds = [
      ...new Set([...existing.droppedDependencyIds, ...patch.droppedDependencyIds]),
    ];
  }
  audit.set(packageId, existing);
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
    scopeAudit: [],
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
    for (const alias of pkg.requirementAliases ?? []) {
      const key = normalizeRequirementId(alias);
      const list = requirementIdToPackages.get(key) ?? [];
      if (!list.includes(pkg)) list.push(pkg);
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
  const scopeAuditMap = new Map<string, ScopeAuditEntry>();

  const reqTypeById = new Map<string, IntentRequirementType>();
  for (const req of planReqs) reqTypeById.set(req.id, req.type);

  const catalogPackageIds = new Set(
    scopedCapabilityIds(focus?.selectedPackageIds ?? [], focus)
  );
  const matrixFocusActive = (focus?.matrixRowIds?.length ?? 0) > 0;
  const focusedMatrixIds = focus?.matrixRowIds ?? [];
  const wantsStructuralParticulars = planReqs.some((req) =>
    wantsStructuralPackage(req, allPackages)
  );
  for (const id of catalogPackageIds) {
    const pkg = packageById.get(id);
    if (
      pkg &&
      packageEligibleUnderScope(pkg, focus) &&
      !defersToMatrixSubgraph(pkg, focus) &&
      !(
        isStructuralReviewPackage(pkg) &&
        matrixFocusActive &&
        !wantsStructuralParticulars
      )
    ) {
      selected.set(pkg.id, pkg);
    }
  }

  if (planReqs.length > 0) {
    for (const req of planReqs) {
      const metaCaps = matchMetaRequirementBindings(req, skills);
      const mappedCaps = [
        ...mappedCapabilitiesFor(req.id, focus),
        ...metaCaps,
      ];
      const byReqId = requirementIdToPackages.get(normalizeRequirementId(req.id)) ?? [];
      const byTopic = pickBySemanticTopics(allPackages, req);
      const byKind = kindToPackages.get(req.type) ?? [];
      const byCap = mappedCaps
        .map((capId) =>
          packageById.has(capId) ? packageById.get(capId) : capabilityToPackage.get(capId)
        )
        .filter((pkg): pkg is EvidencePackage => Boolean(pkg));

      const matrixScopedReq = isMatrixScopedRequirement(
        req,
        mappedCaps,
        focusedMatrixIds,
        skills
      );

      if (matrixFocusActive && (matrixScopedReq || metaCaps.length > 0)) {
        const matrixIds = mappedCaps.filter((id) => focusedMatrixIds.includes(id));
        const fallbackMatrix =
          matrixIds.length > 0 ? matrixIds : focusedMatrixIds;
        const ruleIds = mappedCaps.filter((id) => looksLikeRuleId(id, skills));
        const leftoverRules = ruleIds.filter(
          (id) => !ruleOverlapsFocusedMatrix(id, skills, focusedMatrixIds, focus)
        );
        const riskIds = mappedCaps.filter(
          (id) => !looksLikeRuleId(id, skills) && !focusedMatrixIds.includes(id)
        );
        for (const id of leftoverRules) directRuleIds.add(id);
        const extractionLike =
          req.type === "extraction" || req.type === "coverage";
        requirementPaths.push({
          requirementId: req.id,
          status:
            extractionLike || leftoverRules.length === 0 || fallbackMatrix.length > 0
              ? "supported"
              : "direct_rule",
          ruleIds: [...fallbackMatrix, ...leftoverRules, ...riskIds],
          requirementType: req.type,
          reason:
            fallbackMatrix.length > 0
              ? "Focused rights-matrix rows execute as evaluate_matrix_row"
              : "Requirement mapped via authored meta-requirement binding",
        });
        continue;
      }

      const isInventoryReq = req.type === "extraction" || req.type === "coverage";
      let candidate =
        pickKindMatch(byReqId, req.type) ??
        byTopic ??
        (isInventoryReq ? undefined : pickKindMatch(byKind, req.type) ?? byCap[0]);

      if (
        candidate &&
        isStructuralReviewPackage(candidate) &&
        matrixFocusActive &&
        !wantsStructuralParticulars
      ) {
        candidate =
          byCap.find((pkg) => !isStructuralReviewPackage(pkg)) ??
          allPackages.find(
            (pkg) =>
              defersToMatrixSubgraph(pkg, focus) && packageEligibleUnderScope(pkg, focus)
          );
      }

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
        if (!packageEligibleUnderScope(candidate, focus)) {
          requirementPaths.push({
            requirementId: req.id,
            status: "not_supported",
            requirementType: req.type,
            reason: `Package "${candidate.id}" is out of explicit scope`,
          });
          continue;
        }
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
        if (metaCaps.length > 0) {
          const leftoverRules = mappedCaps.filter(
            (id) =>
              looksLikeRuleId(id, skills) &&
              !ruleOverlapsFocusedMatrix(id, skills, focusedMatrixIds, focus)
          );
          for (const id of leftoverRules) directRuleIds.add(id);
          requirementPaths.push({
            requirementId: req.id,
            status: "supported",
            ruleIds: leftoverRules.length > 0 ? leftoverRules : metaCaps,
            requirementType: req.type,
            reason: "Requirement mapped via authored meta-requirement binding",
          });
          continue;
        }
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
            : ruleIds.length > 0
              ? ruleIds.slice(0, NAMED_RULE_DIRECT_THRESHOLD)
              : [];
        if (usable.length > 0 || metaCaps.length > 0) {
          for (const id of usable) {
            if (!ruleOverlapsFocusedMatrix(id, skills, focusedMatrixIds, focus)) {
              directRuleIds.add(id);
            }
          }
          requirementPaths.push({
            requirementId: req.id,
            status: usable.length > 0 ? "direct_rule" : "supported",
            ruleIds: usable.length > 0 ? usable : metaCaps,
            requirementType: req.type,
            reason:
              usable.length > 0
                ? undefined
                : "Requirement mapped via authored meta-requirement binding",
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
    for (const pkg of allPackages) {
      if (
        isStructuralReviewPackage(pkg) &&
        matrixFocusActive &&
        !wantsStructuralParticulars
      ) {
        continue;
      }
      if (packageEligibleUnderScope(pkg, focus)) selected.set(pkg.id, pkg);
    }
  } else {
    for (const pkg of allPackages) {
      if (defersToMatrixSubgraph(pkg, focus)) continue;
      if (
        isStructuralReviewPackage(pkg) &&
        matrixFocusActive &&
        !wantsStructuralParticulars
      ) {
        continue;
      }
      if (
        pkg.capabilityIds.some((capId) => requestedCapabilities.has(capId)) &&
        packageEligibleUnderScope(pkg, focus)
      ) {
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
      const scope = focus?.explicitScope;
      if (scope && scopeBoundaryActive(scope)) {
        if (!packageIdMatchesScope(dep.id, scope)) {
          upsertScopeAudit(scopeAuditMap, pkg.id, { droppedDependencyIds: [dep.id] });
          continue;
        }
        if (dep.capabilityIds.length > 0 && !packageEligibleUnderScope(dep, focus)) {
          upsertScopeAudit(scopeAuditMap, pkg.id, { droppedDependencyIds: [dep.id] });
          continue;
        }
      }
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

  for (const pkg of [...selected.values()]) {
    if (!pkg.orchestration?.suppressWhenPeerEvaluation) continue;
    if (!isStructuralReviewPackage(pkg)) continue;
    const hasPeerEvaluation = [...selected.values()].some(
      (other) =>
        other.id !== pkg.id &&
        !isStructuralReviewPackage(other) &&
        analysisPackageKind(other) === "evaluation"
    );
    if (hasPeerEvaluation) selected.delete(pkg.id);
  }

  for (const mapping of focus?.requirementMappings ?? []) {
    for (const capId of mapping.capabilityIds) {
      const pkg = packageById.get(capId) ?? capabilityToPackage.get(capId);
      if (!pkg || !selected.has(pkg.id)) continue;
      // Matrix-owned packages must not swallow per-article requirements — those
      // execute as evaluate_matrix_row via leftoverMatrixRowIds.
      if (defersToMatrixSubgraph(pkg, focus)) continue;
      if (!requirementToPackageId[mapping.requirementId]) {
        requirementToPackageId[mapping.requirementId] = pkg.id;
      }
      addExtraRequirement(packageExtraRequirements, pkg.id, mapping.requirementId);

      // PLAN/ACT contract reconciliation:
      // `requirementExecutionPaths` is used by Critique coverage/alignment.
      // Some extraction requirements may initially be recorded as `not_supported`
      // during capability/package resolution, but later become mapped via
      // `requirementMappings`. If so, promote any stale `not_supported` entries
      // for this requirementId to `supported` so Critique doesn't replan.
      const mappedType = reqTypeById.get(mapping.requirementId);
      const hasAnySupported = requirementPaths.some(
        (p) =>
          p.requirementId === mapping.requirementId &&
          (p.status === "supported" ||
            p.status === "supported_via_dependency" ||
            p.status === "direct_rule")
      );
      if (hasAnySupported) continue;

      let updated = false;
      for (let i = 0; i < requirementPaths.length; i++) {
        const p = requirementPaths[i];
        if (
          p.requirementId !== mapping.requirementId ||
          (p.status !== "not_supported" && p.status !== "needs_replan")
        )
          continue;
        requirementPaths[i] = {
          ...p,
          status: "supported",
          packageId: pkg.id,
          requirementType: mappedType ?? p.requirementType,
          reason: undefined,
        };
        updated = true;
      }
      if (!updated) {
        requirementPaths.push({
          requirementId: mapping.requirementId,
          status: "supported",
          packageId: pkg.id,
          requirementType: mappedType,
        });
      }
    }
  }

  const ordered = orderByRequires([...selected.values()]);
  const packages: ResolvedPackage[] = [];
  for (const pkg of ordered) {
    if (!packageEligibleUnderScope(pkg, focus)) {
      upsertScopeAudit(scopeAuditMap, pkg.id, {
        droppedCapabilityIds: pkg.capabilityIds,
      });
      continue;
    }
    const { capabilityIds, contextCapabilityIds } = splitPackageCapabilities(pkg, focus);
    if (contextCapabilityIds.length > 0) {
      upsertScopeAudit(scopeAuditMap, pkg.id, {
        droppedCapabilityIds: contextCapabilityIds,
      });
    }
    // Eval list is package-authored natives only. PLAN ids stay in
    // requirementToPackageId / coverage paths as aliases — they must not
    // become a second eval identity alongside duration / art28_3_* etc.
    const authored = pkg.requirementIds;
    registerPackageRequirementIds(authored);
    for (const reqId of packageExtraRequirements.get(pkg.id) ?? []) {
      if (!requirementToPackageId[reqId]) requirementToPackageId[reqId] = pkg.id;
    }
    for (const reqId of authored) {
      if (!requirementToPackageId[reqId]) requirementToPackageId[reqId] = pkg.id;
    }
    packages.push({
      pkg,
      requirementIds: [...authored],
      capabilityIds,
      contextCapabilityIds,
    });
  }

  const ownedCaps = new Set<string>();
  for (const resolved of packages) {
    for (const capId of resolved.capabilityIds) ownedCaps.add(capId);
  }

  const leftoverRuleCandidates = (focus?.ruleIds ?? []).filter(
    (id) => !ownedCaps.has(id) && !blockedCapabilityIds.has(id)
  );
  const leftoverMatrixRowIds = scopedCapabilityIds(
    (focus?.matrixRowIds ?? []).filter((id) => !blockedCapabilityIds.has(id)),
    focus
  );
  const companionRuleIds = new Set(
    phraseMapCompanionRuleIds(skills, leftoverMatrixRowIds)
  );
  const leftoverRuleIds = leftoverRuleCandidates.filter((id) => {
    const inScope =
      scopedRuleIds([id], focus).length > 0 || companionRuleIds.has(id);
    if (!inScope) return false;
    if (!matrixFocusActive) return true;
    return !ruleOverlapsFocusedMatrix(id, skills, leftoverMatrixRowIds, focus);
  });
  const leftoverRiskCategoryIds = (focus?.riskCategoryIds ?? []).filter(
    (id) => !ownedCaps.has(id) && !blockedCapabilityIds.has(id)
  );
  for (const id of scopedRuleIds([...directRuleIds], focus)) {
    if (ownedCaps.has(id) || leftoverRuleIds.includes(id)) continue;
    if (
      matrixFocusActive &&
      ruleOverlapsFocusedMatrix(id, skills, leftoverMatrixRowIds, focus)
    ) {
      continue;
    }
    leftoverRuleIds.push(id);
  }

  const deferredReportPackages = allPackages.filter(
    (pkg) => defersToMatrixSubgraph(pkg, focus) && !selected.has(pkg.id)
  );

  const resolution: PackageResolution = {
    packages,
    requirementToPackageId,
    requirementPaths,
    leftoverRuleIds,
    leftoverMatrixRowIds,
    leftoverRiskCategoryIds,
    blockedCapabilityIds: [...blockedCapabilityIds],
    scopeAudit: [...scopeAuditMap.values()],
    reportPackages: [...packages.map((item) => item.pkg), ...deferredReportPackages],
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
    leftoverMatrixRowIds: resolution.leftoverMatrixRowIds,
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
  return canonicalRequirementId(id);
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
 * Rights-matrix rows have a dedicated evaluate_matrix_row subgraph. Grouped
 * evaluate_package does not emit matrixRowId, so a package that owns focused
 * matrix-row ids must not swallow the matrix path.
 */
function defersToMatrixSubgraph(
  pkg: EvidencePackage,
  focus?: InstructionFocus
): boolean {
  const matrixIds = focus?.matrixRowIds ?? [];
  if (matrixIds.length === 0) return false;
  const matrixSet = new Set(matrixIds);
  const matrixCaps = pkg.capabilityIds.filter((id) => matrixSet.has(id));
  if (matrixCaps.length === 0) return false;
  if (pkg.orchestration?.role === "matrix_owner") return true;
  const nonMatrix = pkg.capabilityIds.filter((id) => !matrixSet.has(id));
  if (nonMatrix.length === 0) return true;
  const leftoverSet = new Set([
    ...(focus?.ruleIds ?? []),
    ...(focus?.riskCategoryIds ?? []),
    ...(pkg.orchestration?.matrixDeferCapabilities ?? []),
  ]);
  const leftoverish = nonMatrix.every((id) => leftoverSet.has(id));
  return leftoverish && matrixCaps.length >= Math.min(matrixIds.length, 4);
}

function isStructuralReviewPackage(pkg: EvidencePackage): boolean {
  return (
    pkg.orchestration?.role === "structural_review" ||
    pkg.orchestration?.suppressWhenMatrixFocus === true
  );
}

function isMatrixScopedRequirement(
  req: PlanReq,
  mappedCaps: string[],
  matrixRowIds: string[],
  skills: AnalysisSkillConfig[]
): boolean {
  const matrixSet = new Set(matrixRowIds);
  if (mappedCaps.some((id) => matrixSet.has(id))) return true;
  if (mappedCaps.some((id) => isMatrixLinkedRule(id, skills, matrixRowIds))) {
    return true;
  }
  return matrixRowIds.some((id) => req.id.includes(id) || id.includes(req.id));
}

function wantsStructuralPackage(
  req: PlanReq,
  packages: EvidencePackage[]
): boolean {
  return packages
    .filter(isStructuralReviewPackage)
    .some(
      (pkg) =>
        packageMatchesSemanticTopics(pkg, req) ||
        pkg.requirementIds.some((id) => requirementIdOverlaps(req.id, id))
    );
}

function requirementIdOverlaps(a: string, b: string): boolean {
  const left = normalizeRequirementId(a);
  const right = normalizeRequirementId(b);
  if (left === right) return true;
  const leftTail = left.split(".").pop() ?? left;
  const rightTail = right.split(".").pop() ?? right;
  return leftTail === rightTail && leftTail.length >= 12;
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
