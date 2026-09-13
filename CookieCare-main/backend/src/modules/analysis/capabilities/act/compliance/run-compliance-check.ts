import type { AnalysisState } from "../../../models/analysis-state.js";
import { executeCompliancePipeline } from "./runtime/index.js";
/** Application boundary; stages own their results and diagnostics only observe them. */
export async function runCompliancePipeline(state: AnalysisState): Promise<AnalysisState> {
  return executeCompliancePipeline(state);
}
