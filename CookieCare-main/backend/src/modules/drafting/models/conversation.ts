export type ConversationRole = "user" | "assistant" | "system";

export interface ConversationTurn {
  id: string;
  role: ConversationRole;
  content: string;
  documentVersion?: number;
  relatedSectionIds?: string[];
  createdAt: string;
}

export interface DraftConversation {
  documentId: string;
  organizationId: string;
  turns: ConversationTurn[];
  summary?: string;
}

export function createEmptyConversation(
  documentId: string,
  organizationId = ""
): DraftConversation {
  return {
    documentId,
    organizationId,
    turns: [],
  };
}
