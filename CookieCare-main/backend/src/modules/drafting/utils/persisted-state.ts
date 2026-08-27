import { DraftState, DraftHistoryEntry, DraftedExhibit } from "../models/draft-state.js";
import type { DraftConversation } from "../models/conversation.js";
import type { DraftPlan } from "../models/draft-plan.js";
import type { CritiqueReport } from "../models/critique-report.js";
import type { StructuredFacts } from "../models/structured-facts.js";
import type { DraftRequirementsState } from "../models/draft-requirements.js";
import type { DraftingContext } from "../models/drafting-context.js";
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
  draftRequirements?: DraftRequirementsState;
  draftingContext?: DraftingContext;
  intakeOverlay?: DraftState["intakeOverlay"];
  conversation?: DraftConversation;
  exhibits?: DraftedExhibit[];
  organizationId?: string;
  fixPlan?: DraftState["fixPlan"];
}

/**
 * Skill configs carry `when: (facts) => …` predicates which cannot be
 * structuredClone'd / JSON-serialized into draft_state_ledger.
 * Persist a lean context: drop live skill objects; keep ids + serializable briefs.
 * Runtime can re-resolve skills from skillIds via pack registry.
 */
export function toSerializableDraftingContext(
  ctx: DraftingContext | undefined
): DraftingContext | undefined {
  if (!ctx) return undefined;
  return {
    documentType: ctx.documentType,
    skillIds: ctx.skillIds,
    facts: ctx.facts,
    draftRequirements: ctx.draftRequirements,
    requirements: ctx.requirements,
    userIntent: ctx.userIntent,
    conflicts: ctx.conflicts,
    gaps: ctx.gaps,
    outline: ctx.outline,
    provenance: ctx.provenance,
    template: ctx.template,
    playbook: ctx.playbook,
    clauses: ctx.clauses,
    sectionBriefs: ctx.sectionBriefs,
    exhibitBriefs: ctx.exhibitBriefs,
    exhibitSpecs: ctx.exhibitSpecs,
    // Strip `when` predicates — functions are not cloneable.
    validationRules: (ctx.validationRules ?? []).map(
      ({ when: _when, ...rest }) => rest
    ),
    // Never persist live skill configs (conditionalWorkUnits.when, etc.).
    skills: [],
  };
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
    draftRequirements: state.draftRequirements,
    draftingContext: toSerializableDraftingContext(state.draftingContext),
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
