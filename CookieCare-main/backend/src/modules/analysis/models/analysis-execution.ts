/**
 * Runtime completion of an analysis finding/requirement. This is deliberately
 * separate from legal coverage: a provider timeout cannot mean that a
 * contractual obligation is absent or unsupported.
 */
export type AnalysisExecutionStatus =
  | "complete"
  | "timed_out"
  | "failed"
  | "not_run";

export interface AnalysisExecutionState {
  status: AnalysisExecutionStatus;
  /** Safe, user-readable operational detail; never treated as legal evidence. */
  detail?: string;
}

export function isAnalysisExecutionIncomplete(
  execution: AnalysisExecutionState | undefined
): boolean {
  return Boolean(execution && execution.status !== "complete");
}
