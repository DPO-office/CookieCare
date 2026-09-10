import crypto from "crypto";
import type { AnalysisState } from "../models/analysis-state.js";
import {
  createEmptyConversation,
  type ConversationTurn,
  type AnalysisConversation,
  type ConversationRole,
} from "../models/conversation.js";
import { getSkillById } from "../skills/runtime/catalog/registry.js";
import { selectSkills } from "../skills/runtime/selection/select-skills.js";
import { hydrateActiveSkills } from "../skills/runtime/catalog/hydrate-active-skills.js";

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

  // Standard ASK may name a skill pack — treat as skillId when unresolved is cleared
  if (
    !fieldAnswers.skillId &&
    (fieldAnswers.standard === "privacy-gdpr-dpa" ||
      fieldAnswers.standard === "privacy" ||
      fieldAnswers.standard === "commercial" ||
      fieldAnswers.standard === "general-review" ||
      fieldAnswers.standard === "_global")
  ) {
    fieldAnswers.skillId = fieldAnswers.standard;
  }

  // Explicit skill selection from ambiguity ASK — use composition for library aliases
  if (fieldAnswers.skillId) {
    const composed = selectSkills({
      instruction: next.request.instruction,
      promptLibraryId: fieldAnswers.skillId,
      docType:
        next.workspace.documents.find((d) => d.docId === next.request.documentIds[0])?.docType ??
        "unknown",
    });
    const skills =
      composed.skills.length > 0
        ? composed.skills
        : ([getSkillById(fieldAnswers.skillId)].filter(Boolean) as NonNullable<
            ReturnType<typeof getSkillById>
          >[]);
    if (skills.length > 0) {
      next = await hydrateActiveSkills(next, skills, {
        skillSelectionPath: "free_text",
        partialCoverageWarning: composed.partialCoverageWarning,
        updateMetadata: false,
        patch: { pendingSkillClarification: undefined },
      });
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
    if (fieldAnswers.operation && fieldAnswers.operation !== "cancel") {
      const op =
        fieldAnswers.operation === "run_risk_flag" ? "risk_flag" : fieldAnswers.operation;
      intent.operation = op as typeof intent.operation;
      intent.confidence = { ...intent.confidence, operation: 1 };
    }
    if (fieldAnswers.standard) {
      if (fieldAnswers.standard === "use_skill_defaults" || fieldAnswers.standard === "none") {
        intent.standard = "none";
        intent.unresolvedStandard = undefined;
        intent.confidence = { ...intent.confidence, standard: 1 };
      } else if (
        fieldAnswers.standard === "privacy-gdpr-dpa" ||
        fieldAnswers.standard === "privacy" ||
        fieldAnswers.standard === "commercial" ||
        fieldAnswers.standard === "general-review" ||
        fieldAnswers.standard === "_global"
      ) {
        intent.standard = `regime_pack:${fieldAnswers.standard}`;
        intent.unresolvedStandard = undefined;
        intent.confidence = { ...intent.confidence, standard: 1 };
      } else {
        intent.confidence = { ...intent.confidence, standard: 1 };
        intent.unresolvedStandard = undefined;
      }
    }
    next = { ...next, intent };
  }

  if (fieldAnswers.documentRoles) {
    const roles = parseDocumentRoleAnswer(
      fieldAnswers.documentRoles,
      next.request.documentIds
    );
    if (Object.keys(roles).length) {
      next = {
        ...next,
        request: {
          ...next.request,
          documentRoles: { ...next.request.documentRoles, ...roles },
        },
      };
    }
  }

  next = {
    ...next,
    clarificationRequest: undefined,
    pendingSkillClarification: undefined,
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

function parseDocumentRoleAnswer(
  raw: string,
  documentIds: string[]
): Record<string, "target" | "reference"> {
  const roles: Record<string, "target" | "reference"> = {};
  const parts = raw.split(/[;,\n]+/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const m = /^([^:]+):(target|reference)$/i.exec(part);
    if (!m) continue;
    const id = m[1].trim();
    const role = m[2].toLowerCase() as "target" | "reference";
    if (documentIds.includes(id) || documentIds.length === 0) {
      roles[id] = role;
    }
  }
  return roles;
}
