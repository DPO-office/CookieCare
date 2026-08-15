import type { AnalysisState } from "../../models/analysis-state.js";
import {
  appendConversationTurns,
  ensureConversation,
} from "../../memory/conversation-store.js";
import { recordSkillUse, saveOrgMemory } from "../../memory/org-memory.js";

export async function persistAnalysis(state: AnalysisState): Promise<AnalysisState> {
  let next = ensureConversation(state);

  if (next.declineMessage) {
    next = appendConversationTurns(next, [
      { role: "user", content: next.request.instruction },
      { role: "assistant", content: next.declineMessage },
    ]);
    return next;
  }

  if (next.request.instruction) {
    const summary =
      next.renderedOutput?.slice(0, 2000) ||
      `Analysis complete: ${next.findings.length} findings.` +
        (next.agent?.stoppedReason ? ` (${next.agent.stoppedReason})` : "");
    next = appendConversationTurns(next, [
      { role: "user", content: next.request.instruction },
      { role: "assistant", content: summary },
    ]);
  }

  const stopped = next.agent?.stoppedReason;
  const skillId = next.activeSkillIds?.[0];
  if (
    skillId &&
    next.orgMemory &&
    stopped &&
    stopped !== "awaiting_user" &&
    stopped !== "out_of_scope"
  ) {
    const updated = recordSkillUse(next.orgMemory, skillId);
    await saveOrgMemory(updated);
    next = { ...next, orgMemory: updated };
  }

  return next;
}
