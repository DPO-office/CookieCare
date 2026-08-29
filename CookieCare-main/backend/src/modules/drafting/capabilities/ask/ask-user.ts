import type { DraftState } from "../../models/draft-state.js";
import type { UserQuestion } from "../../pac/types.js";




/**
 * ASK capability — batch critical questions, pause job (needs_input).
 * Persistence of the paused snapshot is owned by PacController → persistDraft.
 */
export async function askUser(state: DraftState): Promise<DraftState> {
  const missing = state.plan?.missingFacts.filter((f) => f.severity === "critical") ?? [];
  const openQuestions: UserQuestion[] = missing.map((m, i) => ({
    id: `q-${m.field}-${i}`,
    field: m.field,
    question: m.question,
    severity: m.severity,
    options: m.options,
  }));

  if (state.agent) {
    state.agent.openQuestions = openQuestions;
    state.agent.askRounds += 1;
    state.agent.stoppedReason = "awaiting_user";
  }

  return state;
}
