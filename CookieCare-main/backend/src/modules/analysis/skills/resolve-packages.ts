import type { AnalysisSkillConfig } from "./types.js";
import type { EvidencePackage } from "../models/evidence-package.js";
import type { InstructionFocus } from "../models/analysis-plan.js";
import { mergeEvidencePackages } from "./registry.js";

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
  /** Ordered, de-duplicated packages to execute (authored order preserved). */
  packages: ResolvedPackage[];
  /** requirementId -> packageId (first package that can establish it wins). */
  requirementToPackageId: Record<string, string>;
}

/**
 * Deterministically map a PLAN focus to authored EvidencePackages (ACT refactor §3).
 *
 * Resolution is capability-driven — never semantic similarity. A package is
 * selected when any of its authored capabilityIds is requested by the focus
 * (rule / matrix-row / risk-category ids, requiredCapabilities, or requirement
 * mappings). When the focus requests nothing specific, every authored package
 * for the active skills runs (whole-document review).
 *
 * If several requirements resolve to the same package, that package appears
 * once and its evidence fans out to all affected requirements downstream.
 */
export function resolvePackages(
  skills: AnalysisSkillConfig[],
  focus?: InstructionFocus
): PackageResolution {
  const allPackages = mergeEvidencePackages(skills);
  if (allPackages.length === 0) {
    return { packages: [], requirementToPackageId: {} };
  }

  // capabilityId -> package (first authored package that owns it wins).
  const capabilityToPackage = new Map<string, EvidencePackage>();
  for (const pkg of allPackages) {
    for (const capId of pkg.capabilityIds) {
      if (!capabilityToPackage.has(capId)) capabilityToPackage.set(capId, pkg);
    }
  }

  const requestedCapabilities = collectRequestedCapabilities(focus);

  // No specific focus -> run every authored package.
  const selectedPackages =
    requestedCapabilities.size === 0
      ? allPackages
      : allPackages.filter((pkg) =>
          pkg.capabilityIds.some((capId) => requestedCapabilities.has(capId))
        );

  // Map each PLAN requirement (via its mapped capabilities) to a package.
  const requirementToPackageId: Record<string, string> = {};
  const packageExtraRequirements = new Map<string, Set<string>>();

  for (const mapping of focus?.requirementMappings ?? []) {
    for (const capId of mapping.capabilityIds) {
      const pkg = capabilityToPackage.get(capId);
      if (!pkg) continue;
      if (!requirementToPackageId[mapping.requirementId]) {
        requirementToPackageId[mapping.requirementId] = pkg.id;
      }
      const extra =
        packageExtraRequirements.get(pkg.id) ?? new Set<string>();
      extra.add(mapping.requirementId);
      packageExtraRequirements.set(pkg.id, extra);
    }
  }

  const packages: ResolvedPackage[] = selectedPackages.map((pkg) => {
    const authored = pkg.requirementIds;
    const extra = [...(packageExtraRequirements.get(pkg.id) ?? new Set())];
    const requirementIds = [...new Set([...authored, ...extra])];
    // Ensure authored requirementIds are always mapped back to this package.
    for (const reqId of authored) {
      if (!requirementToPackageId[reqId]) {
        requirementToPackageId[reqId] = pkg.id;
      }
    }
    return { pkg, requirementIds };
  });

  return { packages, requirementToPackageId };
}

function collectRequestedCapabilities(focus?: InstructionFocus): Set<string> {
  const set = new Set<string>();
  if (!focus) return set;
  for (const id of focus.ruleIds ?? []) set.add(id);
  for (const id of focus.matrixRowIds ?? []) set.add(id);
  for (const id of focus.riskCategoryIds ?? []) set.add(id);
  for (const id of focus.requiredCapabilities ?? []) set.add(id);
  for (const mapping of focus.requirementMappings ?? []) {
    for (const id of mapping.capabilityIds) set.add(id);
  }
  return set;
}
