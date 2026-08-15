import type { AnalysisState } from "../models/analysis-state.js";

/** Stream only renderer-owned output. ACT findings and tool telemetry must never use this path. */
export function emitAnalysisToken(state: AnalysisState, delta: string): void {
  if (!delta) return;
  state.onToken?.(delta);
}
