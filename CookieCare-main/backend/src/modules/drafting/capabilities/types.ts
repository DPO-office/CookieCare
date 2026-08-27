import type { DraftState } from "../models/draft-state.js";

/**
 * Capability surface invoked by PacController on a fixed schedule.
 */
export interface PacCapabilities {
  extractRequirements(state: DraftState): Promise<DraftState>;
  /** EXTRACT_FACTS — fill deal facts from full prompt before retrieval/ASK. */
  extractDealFacts(state: DraftState): Promise<DraftState>;
  retrieveContext(state: DraftState): Promise<DraftState>;
  /** Resolves packs, requirements, detect-gaps checklist; freezes missingFacts from gaps. */
  buildPlan(state: DraftState): Promise<DraftState>;
  executeActPlan(state: DraftState): Promise<DraftState>;
  runCritique(state: DraftState): Promise<DraftState>;
  askUser(state: DraftState): Promise<DraftState>;
  persistDraft(state: DraftState): Promise<DraftState>;
  applyFixPlan?(state: DraftState): Promise<DraftState>;
}
