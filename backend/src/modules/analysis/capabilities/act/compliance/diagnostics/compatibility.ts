import type { AnalysisState } from "../../../../models/analysis-state.js";
import { createComplianceLogSink } from "./log-sink.js";
export function emitComplianceEvent(state: AnalysisState, event: string, payload: Record<string, unknown>): void {
  if (!state.request?.sessionId)
    return;
  createComplianceLogSink()({ event, analysisId: state.request.sessionId ?? "unknown", timestamp: new Date().toISOString(), ...payload });
}
const mark = (stage: string) => (state: AnalysisState, requirementIds: string[]) => emitComplianceEvent(state, "compliance.stage.observed", { stage, requirementIds });
export const markAssessed = mark("assess"), markRendered = mark("render"), markRetrieved = mark("retrieve"), markVerified = mark("verify");
export function recordStageDuration(state: AnalysisState, stage: string, durationMs: number): void { emitComplianceEvent(state, "compliance.stage.duration", { stage, durationMs }); }
export function recordRetrievalPool(state: AnalysisState, ...payload: unknown[]): void { emitComplianceEvent(state, "compliance.retrieval.pool", { payload }); }
