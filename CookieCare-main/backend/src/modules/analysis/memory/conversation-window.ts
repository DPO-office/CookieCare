import type { AnalysisConversation } from "../models/conversation.js";

const WINDOW = 12;
const TURN_CHARS = 2500;

/** Compact older turns into summary; keep last N turns (Drafting-compatible pattern). */
export function conversationWindowText(conversation?: AnalysisConversation): string {
  if (!conversation?.turns.length) return "";
  const turns = conversation.turns;
  if (turns.length <= WINDOW) {
    return turns.map((t) => formatTurn(t.role, t.content)).join("\n\n");
  }
  const older = turns.slice(0, -WINDOW);
  const recent = turns.slice(-WINDOW);
  const summary =
    conversation.summary ||
    older.map((t) => `${t.role}: ${t.content.slice(0, 120)}`).join(" | ");
  return (
    `[Earlier summary] ${summary}\n\n` +
    recent.map((t) => formatTurn(t.role, t.content)).join("\n\n")
  );
}

function formatTurn(role: string, content: string): string {
  return `${role.toUpperCase()}: ${content.slice(0, TURN_CHARS)}`;
}

/** Prompt block for intent classification and follow-up synthesis. */
export function conversationContextForIntent(args: {
  conversation?: AnalysisConversation;
  priorInstruction?: string;
  priorReport?: string;
}): string {
  const parts: string[] = [];
  const window = conversationWindowText(args.conversation);
  if (window) {
    parts.push("PRIOR CONVERSATION", window);
  } else if (args.priorInstruction) {
    parts.push("PRIOR USER INSTRUCTION", args.priorInstruction.slice(0, 800));
  }
  if (args.priorReport?.trim()) {
    parts.push(
      "PRIOR ANALYSIS REPORT (truncated — use to interpret follow-ups, do not reprint unless asked)",
      args.priorReport.slice(0, 4000)
    );
  }
  return parts.join("\n");
}
