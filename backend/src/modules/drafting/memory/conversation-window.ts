import type { DraftConversation, ConversationTurn } from "../models/conversation.js";

const DEFAULT_MAX_TURNS = 12;

/**
 * Keep the last N turns for prompts; older turns collapse into conversation.summary.
 */
export function windowConversation(
  conversation: DraftConversation | undefined,
  maxTurns = DEFAULT_MAX_TURNS
): { turns: ConversationTurn[]; summary?: string } {
  if (!conversation) return { turns: [] };
  if (conversation.turns.length <= maxTurns) {
    return { turns: conversation.turns, summary: conversation.summary };
  }

  const older = conversation.turns.slice(0, -maxTurns);
  const recent = conversation.turns.slice(-maxTurns);
  const rolled = older
    .map((t) => `${t.role}: ${t.content.slice(0, 200)}`)
    .join(" | ");

  return {
    turns: recent,
    summary: [conversation.summary, rolled].filter(Boolean).join(" || ").slice(0, 4000),
  };
}

export function conversationWindowText(
  conversation: DraftConversation | undefined,
  maxTurns = DEFAULT_MAX_TURNS
): string {
  const { turns, summary } = windowConversation(conversation, maxTurns);
  const parts: string[] = [];
  if (summary) parts.push(`Earlier summary: ${summary}`);
  for (const t of turns) {
    parts.push(`${t.role.toUpperCase()}: ${t.content}`);
  }
  return parts.join("\n");
}
