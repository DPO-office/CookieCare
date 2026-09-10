import type { EvidenceSpan, Locator } from "./locator.js";

/** Analysis → Drafting handoff contract. Only object that crosses PAC boundaries. */
export interface DraftTask {
  sourceFindingId: string;
  clauseLocator: Locator;
  evidence: EvidenceSpan[];
  reason: string;
  ruleId?: string;
  instruction: string;
}
