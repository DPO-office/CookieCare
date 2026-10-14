export type ConversationRole = "user" | "assistant" | "system";

export interface ConversationTurn {
  id: string;
  role: ConversationRole;
  content: string;
  createdAt: string;
}

export interface AnalysisConversation {
  sessionId: string;
  organizationId: string;
  turns: ConversationTurn[];
  summary?: string;
}

export function createEmptyConversation(
  sessionId: string,
  organizationId = ""
): AnalysisConversation {
  return {
    sessionId,
    organizationId,
    turns: [],
  };
}
