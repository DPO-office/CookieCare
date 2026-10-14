import type { DraftState } from "../../models/draft-state.js";
import type { UserQuestion } from "../../pac/types.js";
import { canonicalizeFieldId } from "../../models/draft-requirements.js";

/**
 * ASK capability — batch critical questions, pause job (needs_input).
 * Persistence of the paused snapshot is owned by PacController → persistDraft.
 */
export async function askUser(state: DraftState): Promise<DraftState> {
  const previouslyAsked = new Set(state.agent?.askedFieldIds ?? []);
  const allCritical = state.plan?.missingFacts.filter((f) => f.severity === "critical") ?? [];

  // Filter out any field that was already asked in a prior round
  const unaskedMissing = allCritical.filter(
    (m) => !previouslyAsked.has(canonicalizeFieldId(m.field))
  );

  const openQuestions: UserQuestion[] = unaskedMissing.map((m, i) => ({
    id: `q-${m.field}-${i}`,
    field: m.field,
    question: m.question,
    severity: m.severity,
    options: m.options,
    placeholder: m.placeholder || m.example,
    example: m.example || m.placeholder,
    reasonRequired: m.reasonRequired,
  }));

  if (state.agent) {
    const newlyAskedFields = unaskedMissing.map((m) => canonicalizeFieldId(m.field));
    state.agent.askedFieldIds = [
      ...(state.agent.askedFieldIds ?? []),
      ...newlyAskedFields,
    ];
    state.agent.openQuestions = openQuestions;
    state.agent.askRounds += 1;
    state.agent.stoppedReason = "awaiting_user";
  }

  return state;
}
