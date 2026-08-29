import type { AnalysisState } from "../../../models/analysis-state.js";
import {
  appendConversationTurns,
  ensureConversation,
} from "../../../memory/conversation-store.js";
import { recordSkillUse, saveOrgMemory } from "../../../memory/org-memory.js";
import { emitAnalysisToken } from "../../../utils/pac-log.js";

export async function persistAnalysis(state: AnalysisState): Promise<AnalysisState> {
  let next = ensureConversation(state);
  const released =
    next.agent?.phase === "DONE" && next.agent.stoppedReason !== "awaiting_user"
      ? next.declineMessage || next.renderedOutput
      : undefined;
  if (released && (next.userFacingCharsEmitted ?? 0) === 0) emitAnalysisToken(next, released);

  if (next.declineMessage) {
    next = appendConversationTurns(next, [
      { role: "user", content: next.request.instruction },
      { role: "assistant", content: next.declineMessage },
    ]);
    return next;
  }

  if (next.request.instruction) {
    const lastUser = [...(next.conversation?.turns ?? [])]
      .reverse()
      .find((turn) => turn.role === "user");
    const summary =
      next.renderedOutput?.slice(0, 4000) ||
      `Analysis complete: ${next.findings.length} findings.` +
        (next.agent?.stoppedReason ? ` (${next.agent.stoppedReason})` : "");
    const turns =
      lastUser?.content === next.request.instruction
        ? [{ role: "assistant" as const, content: summary }]
        : [
            { role: "user" as const, content: next.request.instruction },
            { role: "assistant" as const, content: summary },
          ];
    next = appendConversationTurns(next, turns);
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
