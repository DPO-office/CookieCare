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
  const documentId = state.request?.payloadFields?.documentId ?? `doc_${crypto.randomUUID()}`;
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

/** Map ASK answer keys (question id or field) onto structuredFacts field names. */
function answersToFactPatch(
  state: DraftState,
  answers: Record<string, string>
): Record<string, string> {
  const open = state.agent?.openQuestions ?? [];
  const byId = new Map(open.map((q) => [q.id, q.field]));
  const patch: Record<string, string> = {};

  for (const [key, raw] of Object.entries(answers)) {
    const value = String(raw ?? "").trim();
    if (!value) continue;

    const fromOpen = byId.get(key);
    if (fromOpen) {
      patch[fromOpen] = value;
      continue;
    }

    // q-<field>-<index> from ask-user.ts
    const match = /^q-(.+)-(\d+)$/.exec(key);
    if (match) {
      patch[match[1]] = value;
      continue;
    }

    patch[key] = value;
  }

  return patch;
}

/** Resume ASK: merge user answers into structuredFacts and conversation, clear open questions. */
export function applyUserAnswers(
  state: DraftState,
  answers: Record<string, string>
): DraftState {
  const factsPatch = answersToFactPatch(state, answers);

  let next = appendConversationTurns(state, [
    {
      role: "user",
      content: Object.entries(factsPatch)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n"),
    },
  ]);

  next = {
    ...next,
    structuredFacts: {
      ...(next.structuredFacts ?? {}),
      ...factsPatch,
    },
    requirements: next.requirements
      ? {
          ...next.requirements,
          ...(factsPatch.governingLaw
            ? { jurisdiction: factsPatch.governingLaw }
            : {}),
          ...(factsPatch.documentType
            ? { contractType: factsPatch.documentType }
            : {}),
          ...(factsPatch.parties
            ? {
                parties: String(factsPatch.parties)
                  .split(",")
                  .map((p) => p.trim())
                  .filter(Boolean),
              }
            : {}),
        }
      : next.requirements,
    // Keep missingFacts cleared for answered fields so PLAN→ASK does not re-block.
    plan: next.plan
      ? {
          ...next.plan,
          missingFacts: (next.plan.missingFacts ?? []).filter(
            (f) => !(f.field in factsPatch)
          ),
          structuredFacts: {
            ...(next.plan.structuredFacts ?? {}),
            ...factsPatch,
          },
        }
      : next.plan,
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
