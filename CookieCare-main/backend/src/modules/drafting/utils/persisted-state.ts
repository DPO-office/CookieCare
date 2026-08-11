import { DraftState, DraftHistoryEntry, DraftedExhibit } from "../models/draft-state.js";
import type { DraftConversation } from "../models/conversation.js";
import type { DraftPlan } from "../models/draft-plan.js";
import type { CritiqueReport } from "../models/critique-report.js";
import type { StructuredFacts } from "../models/structured-facts.js";
import type { AgentRunState, EntryMode } from "../pac/types.js";

/**
 * STATE LIFETIME HYGIENE
 * Drops huge prompts and callbacks; keeps PAC plan/critique/conversation for resume.
 */
export interface PersistedDraftState {
  request: DraftState["request"];
  requirements: DraftState["requirements"];
  retrieval: DraftState["retrieval"];
  context: { documentSkeleton?: string[]; draftSummary?: string } | null;
  draft: DraftState["draft"];
  validation: DraftState["validation"];
  riskReview: DraftState["riskReview"];
  history: DraftHistoryEntry[];
  metadata: DraftState["metadata"];
  entryMode?: EntryMode;
  agent?: AgentRunState;
  plan?: DraftPlan | null;
  critique?: CritiqueReport | null;
  structuredFacts?: StructuredFacts;
  intakeOverlay?: DraftState["intakeOverlay"];
  conversation?: DraftConversation;
  exhibits?: DraftedExhibit[];
  organizationId?: string;
  fixPlan?: DraftState["fixPlan"];
}

export function toPersistedState(state: DraftState): PersistedDraftState {
  const leanContext = state.context
    ? {
        documentSkeleton: state.context.documentSkeleton,
        draftSummary: state.context.draftSummary,
      }
    : null;

  return {
    request: state.request,
    requirements: state.requirements,
    retrieval: state.retrieval,
    context: leanContext,
    draft: state.draft,
    validation: state.validation,
    riskReview: state.riskReview,
    history: state.history ?? [],
    metadata: state.metadata,
    entryMode: state.entryMode,
    agent: state.agent,
    plan: state.plan,
    critique: state.critique,
    structuredFacts: state.structuredFacts,
    intakeOverlay: state.intakeOverlay,
    conversation: state.conversation,
    exhibits: state.exhibits,
    organizationId: state.organizationId,
    fixPlan: state.fixPlan,
  };
}

/** Immutably append an entry to the append-only memory log. */
export function appendHistory(state: DraftState, entry: DraftHistoryEntry): DraftState {
  return { ...state, history: [...(state.history ?? []), entry] };
}
