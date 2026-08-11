import type { AnalysisState } from "../../models/analysis-state.js";
import type { UserQuestion } from "../../pac/types.js";
import { appendConversationTurns } from "../../memory/conversation-store.js";

export async function askUser(state: AnalysisState): Promise<AnalysisState> {
  const missing =
    state.plan?.missingClarifications.filter((f) => f.severity === "critical") ?? [];
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

  if (openQuestions.length > 0) {
    state = appendConversationTurns(state, [
      {
        role: "assistant",
        content: `Need clarification:\n${openQuestions.map((q) => `- ${q.question}`).join("\n")}`,
      },
    ]);
  }

  return state;
}
