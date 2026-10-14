import type { AnalysisState } from "../../../../models/analysis-state.js";
import type { EvidencePackage } from "../../../../models/evidence-package.js";
import type { SkillRegimeRule } from "../../../../skills/runtime/catalog/types.js";
import { compileComplianceRule } from "../../../../skills/runtime/catalog/compile-compliance-rule.js";
import type { ComplianceRequirementSelection } from "../../../../models/analysis-plan.js";
import { complianceRequirementRoutingMode } from "../../../plan/compliance-routing-mode.js";
import type {
  InvestigationRequirement,
  InvestigationResolutionIssue,
} from "./types.js";

export interface InvestigationRequirementResolution {
  requirements: InvestigationRequirement[];
  issues: InvestigationResolutionIssue[];
}

/** Resolve a rule-first selection's atomic rule by skillId + ruleId only —
 * never through a package. Returns undefined when the rule (or its
 * investigation profile) is not present on an active skill. */
function findRuleFirstRule(
  state: AnalysisState,
  skillId: string,
  ruleId: string
): SkillRegimeRule | undefined {
  const skill = (state.activeSkills ?? []).find((s) => s.skillId === skillId);
  return skill?.regimeRules?.find((rule) => rule.ruleId === ruleId && rule.investigation);
}

/** Resolve only the package/profile links explicitly selected by PLAN. */
export function resolveInvestigationRequirements(
  state: AnalysisState
): InvestigationRequirementResolution {
  const requirements: InvestigationRequirement[] = [];
  const issues: InvestigationResolutionIssue[] = [];
  const packagesById = new Map<string, EvidencePackage[]>();
  for (const skill of state.activeSkills ?? []) {
    for (const pkg of skill.evidencePackages ?? []) {
      const owners = packagesById.get(pkg.id) ?? [];
      owners.push(pkg);
      packagesById.set(pkg.id, owners);
    }
  }

  const bindings = state.plan?.requirementBindings ?? [];
  const ruleFirstResolution = state.plan?.complianceRequirementResolution;
  const ruleFirstSelections = ruleFirstResolution?.selections ?? [];
  const useRuleFirst =
    complianceRequirementRoutingMode() !== "off" &&
    Boolean(ruleFirstResolution && ruleFirstResolution.facets.length > 0);
  const units = (state.plan?.workUnits ?? []).filter(
    (unit) => unit.tool === "run_compliance_pipeline"
  );
  const seen = new Set<string>();

  for (const unit of units) {
    const documentId = String(unit.input?.docId ?? "");
    const plannedIds = new Set(
      (((unit.input?.requirementIds as string[]) ?? unit.requirementIds ?? []) as string[])
    );
    const unitBindings = useRuleFirst ? [] : bindings.filter(
      (binding) =>
        plannedIds.has(binding.nativeRequirementId) &&
        (binding.facetId === undefined || binding.facetId === unit.facetId)
    );
    // Rule-first selections take priority over a package binding for the
    // same id — resolved directly through skillId + ruleId, never through
    // `package.requirementEvidence`.
    const unitRuleFirstSelections: ComplianceRequirementSelection[] = [];
    const seenRuleFirstIds = new Set<string>();
    for (const selection of ruleFirstSelections) {
      const legacyId = findRuleFirstRule(state, selection.skillId, selection.ruleId)?.legacyRequirementId;
      if (!useRuleFirst || (plannedIds.size > 0 && !plannedIds.has(selection.ruleId) && !(legacyId && plannedIds.has(legacyId))) || seenRuleFirstIds.has(`${selection.skillId}:${selection.ruleId}`)) continue;
      seenRuleFirstIds.add(`${selection.skillId}:${selection.ruleId}`);
      unitRuleFirstSelections.push(selection);
    }

    for (const requirementId of useRuleFirst ? [] : plannedIds) {
      const hasBinding = unitBindings.some((binding) => binding.nativeRequirementId === requirementId);
      const hasRuleFirstSelection = seenRuleFirstIds.has(requirementId);
      if (!hasBinding && !hasRuleFirstSelection) {
        issues.push({
          documentId,
          requirementId,
          reason: "binding_missing",
          detail: "PLAN did not provide a requirement binding for this compliance work unit.",
        });
      }
    }

    for (const selection of unitRuleFirstSelections) {
      const rule = findRuleFirstRule(state, selection.skillId, selection.ruleId);
      if (!rule?.investigation) {
        issues.push({
          documentId,
          requirementId: selection.ruleId,
          packageId: `rule:${selection.skillId}`,
          reason: "profile_missing",
          detail: `Rule-first selection ${selection.skillId}/${selection.ruleId} has no investigation profile.`,
        });
        continue;
      }
      const skill = (state.activeSkills ?? []).find((s) => s.skillId === selection.skillId);
      let compiled;
      try {
        compiled = compileComplianceRule(state.activeSkills ?? [], selection.skillId, selection.ruleId);
      } catch (error) {
        issues.push({ documentId, requirementId: selection.ruleId, reason: "profile_missing", detail: String(error) });
        continue;
      }
      const key = `${documentId}::rule::${selection.skillId}::${selection.ruleId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      requirements.push({
        requestRequirementId: selection.facetId,
        requirementId: selection.ruleId,
        packageId: `rule:${selection.skillId}`,
        documentId,
        profile: {
          hypothesis: rule.investigation.hypothesis,
          evidenceHints: rule.investigation.evidenceHints,
          proofStandard: compiled.proofStandard,
        },
        evidenceScope: rule.investigation.evidenceScope,
        clauseTypes: rule.investigation.clauseTypeHints ?? skill?.clauseTypes ?? [],
        extractionTargets: rule.investigation.extractionTargets ?? [],
        elementIds: compiled.elements.filter((element) => element.kind !== "optional").map((element) => element.id),
        proofElements: compiled.elements,
      });
    }

    for (const binding of unitBindings) {
      if (seenRuleFirstIds.has(binding.nativeRequirementId)) continue;
      const owners = packagesById.get(binding.packageId) ?? [];
      if (owners.length === 0) {
        issues.push({
          documentId,
          requirementId: binding.nativeRequirementId,
          packageId: binding.packageId,
          reason: "package_missing",
          detail: `Selected package ${binding.packageId} is not present in activeSkills.`,
        });
        continue;
      }
      if (owners.length > 1) {
        issues.push({
          documentId,
          requirementId: binding.nativeRequirementId,
          packageId: binding.packageId,
          reason: "package_ambiguous",
          detail: `Selected package ${binding.packageId} has ${owners.length} active owners.`,
        });
        continue;
      }
      const pkg = owners[0];
      const profile = pkg.requirementEvidence?.[binding.nativeRequirementId];
      if (!profile?.hypothesis?.trim() && !profile?.proofStandard?.trim()) {
        issues.push({
          documentId,
          requirementId: binding.nativeRequirementId,
          packageId: binding.packageId,
          reason: "profile_missing",
          detail: `Package ${binding.packageId} has no usable evidence profile for this requirement.`,
        });
        continue;
      }
      const key = `${documentId}::${binding.packageId}::${binding.nativeRequirementId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      requirements.push({
        requestRequirementId: binding.requestRequirementId,
        requirementId: binding.nativeRequirementId,
        packageId: binding.packageId,
        documentId,
        profile,
        evidenceScope: pkg.evidenceScope,
        clauseTypes: pkg.clauseTypes,
        extractionTargets: pkg.extractionTargets,
        elementIds: ["E1"],
      });
    }

    if (useRuleFirst) {
      for (const unresolved of ruleFirstResolution?.unresolved ?? []) {
        issues.push({
          documentId,
          requirementId: `unresolved:${unresolved.facetId}`,
          reason: "facet_unresolved",
          detail: `${unresolved.sourceText}: ${unresolved.reason}`,
        });
      }
    }
  }

  return { requirements, issues };
}
