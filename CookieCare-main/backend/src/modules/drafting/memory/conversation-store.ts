import crypto from "crypto";
import type { DraftState } from "../models/draft-state.js";
import {
  createEmptyConversation,
  type ConversationTurn,
  type DraftConversation,
  type ConversationRole,
} from "../models/conversation.js";

export function ensureConversation(state: DraftState): DraftState {
  if (state.conversation) return state;
  const documentId = state.request.payloadFields?.documentId ?? `doc_${crypto.randomUUID()}`;
  return {
    ...state,
    conversation: createEmptyConversation(documentId, state.organizationId ?? ""),
  };
}

export function appendConversationTurns(
  state: DraftState,
  turns: Array<{
    role: ConversationRole;
    content: string;
    documentVersion?: number;
    relatedSectionIds?: string[];
  }>
): DraftState {
  const base = ensureConversation(state);
  const nextTurns: ConversationTurn[] = turns.map((t) => ({
    id: `turn_${crypto.randomUUID()}`,
    role: t.role,
    content: t.content,
    documentVersion: t.documentVersion,
    relatedSectionIds: t.relatedSectionIds,
    createdAt: new Date().toISOString(),
  }));

  const conversation: DraftConversation = {
    ...base.conversation!,
    turns: [...base.conversation!.turns, ...nextTurns],
  };

  return { ...base, conversation };
}

/** Resume ASK: merge user answers into structuredFacts and conversation, clear open questions. */
export function applyUserAnswers(
  state: DraftState,
  answers: Record<string, string>
): DraftState {
  let next = appendConversationTurns(state, [
    {
      role: "user",
      content: Object.entries(answers)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n"),
    },
  ]);

  next = {
    ...next,
    structuredFacts: {
      ...(next.structuredFacts ?? {}),
      ...answers,
    },
    agent: next.agent
      ? {
          ...next.agent,
          openQuestions: [],
          stoppedReason: undefined,
          phase: "PLAN",
        }
      : next.agent,
  };

  return next;
}
