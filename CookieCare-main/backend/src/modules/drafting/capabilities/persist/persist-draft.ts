import type { DraftState } from "../../models/draft-state.js";
import { saveStep } from "./save.js";
import {
  appendConversationTurns,
  ensureConversation,
} from "../../memory/conversation-store.js";

export async function persistDraft(state: DraftState): Promise<DraftState> {
  let next = ensureConversation(state);
  const version = next.draft?.version ?? 1;

  if (next.request.rawInstructions) {
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
