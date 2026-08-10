import type { DraftState } from "../models/draft-state.js";

/**
 * Capability surface invoked by PacController on a fixed schedule.
 */
export interface PacCapabilities {
  extractRequirements(state: DraftState): Promise<DraftState>;
  retrieveContext(state: DraftState): Promise<DraftState>;
  /** Resolves packs and runs detect-gaps once; freezes checklist/missingFacts. */
  buildPlan(state: DraftState): Promise<DraftState>;
  executeActPlan(state: DraftState): Promise<DraftState>;
  runCritique(state: DraftState): Promise<DraftState>;
  askUser(state: DraftState): Promise<DraftState>;
  persistDraft(state: DraftState): Promise<DraftState>;
  applyFixPlan?(state: DraftState): Promise<DraftState>;
}
