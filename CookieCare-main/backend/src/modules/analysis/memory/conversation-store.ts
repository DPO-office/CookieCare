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

export async function applyUserAnswers(
  state: AnalysisState,
  answers: Record<string, string>
): Promise<AnalysisState> {
  let next = appendConversationTurns(state, [
    {
      role: "user",
      content: Object.entries(answers)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n"),
    },
  ]);

  // Apply operation override if user confirmed risk_flag
  if (answers.operation === "run_risk_flag" || answers.operation === "risk_flag") {
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
  if (answers.skillId) {
    const skill = getSkillById(answers.skillId);
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
    if (answers.scope) {
      intent.scope = answers.scope as typeof intent.scope;
      intent.confidence = { ...intent.confidence, scope: 1 };
    }
    if (answers.outputForm) {
      intent.outputForm = answers.outputForm as typeof intent.outputForm;
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
