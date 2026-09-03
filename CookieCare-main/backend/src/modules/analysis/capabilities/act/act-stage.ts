import type { AnalysisToolName } from "../../models/analysis-plan.js";

/**
 * The four explicit ACT stages from the rebuild
 * (docs-legacy/rebuild/ACT_AND_PLAN_REDESIGN_RESEARCH.md §2.1):
 * INVESTIGATE (candidate generation) → VERIFY (proposition-level entailment,
 * or the old grouped-judgment fallback) → LOCK (deterministic aggregation)
 * → RENDER (format-matched output). Every work-unit tool maps onto exactly
 * one of these — this is the single place that mapping lives, so logs and
 * any other stage-aware code stay in sync.
 */
export type ActStage = "SETUP" | "INVESTIGATE" | "VERIFY" | "LOCK" | "RENDER";

const STAGE_BY_TOOL: Record<AnalysisToolName, ActStage> = {
  classify_document: "SETUP",
  extract_clauses: "INVESTIGATE",
  extract_shared_evidence: "INVESTIGATE",
  inventory_provisions: "INVESTIGATE",
  extract_playbook_positions: "INVESTIGATE",
  web_assisted_reference: "INVESTIGATE",
  // These are the judgment-producing tools — they decide proves/gap, whether
  // via per-candidate verifyProposition() or (VERIFY disabled) the older
  // one-shot grouped judgment call.
  evaluate_package: "VERIFY",
  check_expected_clauses: "VERIFY",
  flag_risk: "VERIFY",
  check_against_rule: "VERIFY",
  evaluate_matrix_row: "VERIFY",
  derive_risk: "VERIFY",
  aggregate_requirements: "LOCK",
  render_output: "RENDER",
  merge_branch_outputs: "RENDER",
};

export function actStageForTool(tool: AnalysisToolName): ActStage {
  return STAGE_BY_TOOL[tool] ?? "INVESTIGATE";
}
