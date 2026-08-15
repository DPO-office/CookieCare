import type { AnalysisConversation } from "../models/conversation.js";

const WINDOW = 12;

/** Compact older turns into summary; keep last N turns (Drafting-compatible pattern). */
export function conversationWindowText(conversation?: AnalysisConversation): string {
  if (!conversation?.turns.length) return "";
  const turns = conversation.turns;
  if (turns.length <= WINDOW) {
    return turns.map((t) => `${t.role}: ${t.content}`).join("\n");
  }
  const older = turns.slice(0, -WINDOW);
  const recent = turns.slice(-WINDOW);
  const summary =
    conversation.summary ||
    older.map((t) => `${t.role}: ${t.content.slice(0, 120)}`).join(" | ");
  return `[Earlier summary] ${summary}\n` + recent.map((t) => `${t.role}: ${t.content}`).join("\n");
}
