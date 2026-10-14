export type ComplianceRequirementRoutingMode = "off" | "shadow" | "canonical";

/**
 * Rule-first routing and graph-native investigation are now the production
 * pipeline. Keep this small compatibility function while callers are
 * migrated, but do not make correctness depend on process configuration.
 */
export function complianceRequirementRoutingMode(): ComplianceRequirementRoutingMode {
  return "canonical";
}

/** Apply the PLAN-frozen rule selection to compliance units in canonical mode. */
export function applyComplianceRequirementRouting(
  workUnits: AnalysisWorkUnit[],
  resolution: ComplianceRequirementResolution | undefined,
  mode: ComplianceRequirementRoutingMode
): AnalysisWorkUnit[] {
  if (mode !== "canonical" || !resolution || resolution.facets.length === 0) return workUnits;
  const requirementIds = [...new Set(resolution.selections.map((selection) => selection.ruleId))];
  return workUnits.map((unit) => unit.tool !== "run_compliance_pipeline" ? unit : {
    ...unit,
    requirementIds,
    input: {
      ...unit.input,
      requirementIds,
      unresolvedComplianceFacets: resolution.unresolved,
    },
  });
}
import type {
  AnalysisWorkUnit,
  ComplianceRequirementResolution,
} from "../../models/analysis-plan.js";
