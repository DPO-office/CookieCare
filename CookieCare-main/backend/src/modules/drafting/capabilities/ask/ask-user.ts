import type { DraftState } from "../../models/draft-state.js";
import type { UserQuestion } from "../../pac/types.js";
import { appendConversationTurns } from "../../memory/conversation-store.js";

/**
 * ASK capability — batch critical questions, pause job (needs_input).
 * Never proceeds on unresolved critical facts once maxAskRounds is hit.
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

  const docId = state.request.payloadFields?.documentId ?? state.conversation?.documentId ?? "";
  if (docId && openQuestions.length > 0) {
    state = appendConversationTurns(state, [
      {
        role: "assistant",
        content: `Need clarification:\n${openQuestions.map((q) => `- ${q.question}`).join("\n")}`,
      },
    ]);
  }

  return state;
}
