import { DraftState, DraftHistoryEntry } from "../models/draft-state";

/**
 * STATE LIFETIME HYGIENE (Gap 3)
 * ---------------------------------------------------------------------------
 * `DraftState` mixes three lifetimes: ephemeral run data (assembled prompts, the
 * onProgress/onToken callbacks), persistent document data (requirements, draft,
 * history), and config (metadata). Persisting the whole object bloats the ledger
 * and can leak the full compiled prompts.
 *
 * `toPersistedState` is the single boundary that decides what is safe to store:
 * it drops the huge `assembledPrompt`/`systemPrompt` and never includes callbacks
 * (they aren't data). Keep the lightweight skeleton/summary for reload context.
 */
export interface PersistedDraftState {
  requirements: DraftState["requirements"];
  retrieval: DraftState["retrieval"];
  context: { documentSkeleton?: string[]; draftSummary?: string } | null;
  draft: DraftState["draft"];
  validation: DraftState["validation"];
  riskReview: DraftState["riskReview"];
  history: DraftHistoryEntry[];
  metadata: DraftState["metadata"];
}

export function toPersistedState(state: DraftState): PersistedDraftState {
  const leanContext = state.context
    ? {
        documentSkeleton: state.context.documentSkeleton,
        draftSummary: state.context.draftSummary,
      }
    : null;

  return {
    requirements: state.requirements,
    retrieval: state.retrieval,
    // Intentionally EXCLUDES context.systemPrompt / context.assembledPrompt.
    context: leanContext,
    draft: state.draft,
    validation: state.validation,
    riskReview: state.riskReview,
    history: state.history ?? [],
    metadata: state.metadata,
  };
}

/** Immutably append an entry to the append-only memory log. */
export function appendHistory(state: DraftState, entry: DraftHistoryEntry): DraftState {
  return { ...state, history: [...(state.history ?? []), entry] };
}
