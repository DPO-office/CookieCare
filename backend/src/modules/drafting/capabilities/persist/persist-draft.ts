import type { DraftState } from "../../models/draft-state.js";
import { saveStep } from "./save.js";
import {
  appendConversationTurns,
  ensureConversation,
} from "../../memory/conversation-store.js";

export async function persistDraft(state: DraftState): Promise<DraftState> {
  let next = ensureConversation(state);
  const paused = next.agent?.stoppedReason === "awaiting_user";
  const version = next.draft?.version ?? (paused ? 0 : 1);

  if (paused) {
    const questions = next.agent?.openQuestions ?? [];
    if (questions.length > 0) {
      next = appendConversationTurns(next, [
        {
          role: "assistant",
          content: `Need clarification:\n${questions.map((q) => `- ${q.question}`).join("\n")}`,
        },
      ]);
    }
    return saveStep(next, { allowEmptyDraft: true });
  }

  if (next.request?.rawInstructions) {
    next = appendConversationTurns(next, [
      { role: "user", content: next.request.rawInstructions },
      {
        role: "assistant",
        content: `Draft v${version} ready (${next.plan?.documentType ?? "document"}).`,
        documentVersion: version,
      },
    ]);
  }

  return saveStep(next);
}
