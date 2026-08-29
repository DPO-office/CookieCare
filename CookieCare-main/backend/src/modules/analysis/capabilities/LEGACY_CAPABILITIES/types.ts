import type { AnalysisState } from "../models/analysis-state.js";

export interface PacCapabilities {
  classifyIntent(state: AnalysisState): Promise<AnalysisState>;
  buildPlan(state: AnalysisState): Promise<AnalysisState>;
  executeActPlan(state: AnalysisState): Promise<AnalysisState>;
  runAudit(state: AnalysisState): Promise<AnalysisState>;
  runCritique(state: AnalysisState): Promise<AnalysisState>;
  askUser(state: AnalysisState): Promise<AnalysisState>;
  persistAnalysis(state: AnalysisState): Promise<AnalysisState>;
}
