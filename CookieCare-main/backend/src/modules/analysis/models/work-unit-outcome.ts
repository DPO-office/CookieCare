export type FailureReason =
  | { kind: "not_authored"; details: string }
  | { kind: "tool_execution_error"; error: string }
  | { kind: "verification_rejected"; critiqueReason: string }
  | { kind: "intent_mismatch"; details: string };

export type TerminalStatus =
  | "verified"
  | "not_covered"
  | "retries_exhausted"
  | "needs_replan";

export interface AttemptRecord {
  attemptNumber: number;
  findingId?: string;
  outcome: "accepted" | "rejected";
  rejectionReason?: string;
  outputHash: string;
}

export interface WorkUnitOutcome {
  workUnitId: string;
  terminalStatus?: TerminalStatus;
  attempts: AttemptRecord[];
  failureReason?: FailureReason;
}

export interface TierCCacheEntry {
  reliable: boolean;
  claim?: string;
  sourceUrl?: string;
  findingId?: string;
}
