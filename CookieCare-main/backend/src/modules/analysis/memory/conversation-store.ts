import crypto from "crypto";
import type { AnalysisState } from "../models/analysis-state.js";
import {
  createEmptyConversation,
  type ConversationTurn,
  type AnalysisConversation,
  type ConversationRole,
} from "../models/conversation.js";
import { getSkillById } from "../skills/registry.js";
import { loadSkillMarkdownForSkills } from "../skills/load-skill-md.js";
import {
  mergeExpectedClauses,
  mergeRegimeRules,
  mergeSkillClauseTypes,
  mergeSkillRiskCategories,
} from "../skills/registry.js";

export function ensureConversation(state: AnalysisState): AnalysisState {
  if (state.conversation) return state;
  return {
    ...state,
    conversation: createEmptyConversation(
      state.request.sessionId,
      state.organizationId ?? ""
    ),
  };
}

export function appendConversationTurns(
  state: AnalysisState,
  turns: Array<{ role: ConversationRole; content: string }>
): AnalysisState {
  const base = ensureConversation(state);
  const nextTurns: ConversationTurn[] = turns.map((t) => ({
    id: `turn_${crypto.randomUUID()}`,
    role: t.role,
    content: t.content,
    createdAt: new Date().toISOString(),
  }));

  const conversation: AnalysisConversation = {
    ...base.conversation!,
    turns: [...base.conversation!.turns, ...nextTurns],
  };

  return { ...base, conversation };
}

/** Map ASK answer keys (question id or field) onto intent/skill field names. */
function answersByField(
  state: AnalysisState,
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

    const match = /^q-(.+)-(\d+)$/.exec(key);
    if (match) {
      patch[match[1]] = value;
      continue;
    }

    patch[key] = value;
  }

  return patch;
}

export async function applyUserAnswers(
  state: AnalysisState,
  answers: Record<string, string>
): Promise<AnalysisState> {
  const fieldAnswers = answersByField(state, answers);

  let next = appendConversationTurns(state, [
    {
      role: "user",
      content: Object.entries(fieldAnswers)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n"),
    },
  ]);

  // Apply operation override if user confirmed risk_flag
  if (fieldAnswers.operation === "run_risk_flag" || fieldAnswers.operation === "risk_flag") {
    next = {
      ...next,
      intent: next.intent
        ? {
            ...next.intent,
            operation: "risk_flag",
            confidence: {
              ...next.intent.confidence,
              operation: 1,
            },
          }
        : next.intent,
    };
  }

  // Explicit skill selection from ambiguity ASK
  if (fieldAnswers.skillId) {
    const skill = getSkillById(fieldAnswers.skillId);
    if (skill) {
      const skillMd = await loadSkillMarkdownForSkills([skill]);
      next = {
        ...next,
        activeSkills: [skill],
        activeSkillIds: [skill.skillId],
        mergedClauseTypes: mergeSkillClauseTypes([skill]),
        mergedRiskCategories: mergeSkillRiskCategories([skill]).map((r) => r.category),
        mergedExpectedClauses: mergeExpectedClauses([skill]),
        mergedRegimeRules: mergeRegimeRules([skill]),
        skillMarkdown: skillMd,
        skillSelectionPath: "free_text",
        pendingSkillClarification: undefined,
      };
    }
  }

  // Merge other axis answers into intent when present
  if (next.intent) {
    const intent = { ...next.intent };
    if (fieldAnswers.scope) {
      intent.scope = fieldAnswers.scope as typeof intent.scope;
      intent.confidence = { ...intent.confidence, scope: 1 };
    }
    if (fieldAnswers.outputForm) {
      intent.outputForm = fieldAnswers.outputForm as typeof intent.outputForm;
      intent.confidence = { ...intent.confidence, outputForm: 1 };
    }
    next = { ...next, intent };
  }

  next = {
    ...next,
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
