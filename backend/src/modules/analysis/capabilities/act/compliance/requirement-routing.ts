import type { AnalysisState } from "../../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import { complianceRequirementRoutingMode } from "../../plan/compliance-routing-mode.js";
import { emitComplianceEvent } from "./diagnostics/index.js";

function complianceWorkUnits(state: AnalysisState): AnalysisWorkUnit[] {
  return (state.plan?.workUnits ?? []).filter((unit) => unit.tool === "run_compliance_pipeline");
}

/**
 * Emit a comparison for the PLAN-frozen rule resolution. ACT never reruns
 * requirement selection and never mutates a compliance work unit here.
 */
export async function recordComplianceRequirementRouting(state: AnalysisState): Promise<void> {
  const mode = complianceRequirementRoutingMode();
  if (mode === "off") return;

  const units = complianceWorkUnits(state);
  if (units.length === 0) return;

  const resolution = state.plan?.complianceRequirementResolution;
  if (!resolution) return;

  const ruleFirstIds = [...new Set(resolution.selections.map((s) => s.ruleId))];
  const legacyIds = [
    ...new Set((state.plan?.requirementBindings ?? []).map((binding) => binding.nativeRequirementId)),
  ];

  for (const unit of units) {
    const addedByRuleFirst = ruleFirstIds.filter((id) => !legacyIds.includes(id));
    const missedByRuleFirst = legacyIds.filter((id) => !ruleFirstIds.includes(id));

    emitComplianceEvent(state, "compliance.requirement_routing.compare", {
      mode,
      workUnitId: unit.workUnitId,
      legacyCount: legacyIds.length,
      ruleFirstCount: ruleFirstIds.length,
      addedByRuleFirst,
      missedByRuleFirst,
      unresolvedFacets: resolution.unresolved,
      selections: resolution.selections.map((s) => ({
        facetId: s.facetId,
        skillId: s.skillId,
        ruleId: s.ruleId,
        source: s.source,
        confidence: s.confidence,
        required: s.required,
      })),
    });
  }
}
