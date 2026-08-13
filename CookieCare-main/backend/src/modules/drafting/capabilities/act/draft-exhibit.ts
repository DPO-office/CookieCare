import type { DraftState } from "../../models/draft-state.js";
import type { WorkUnit } from "../../models/draft-plan.js";
import { executeBoundedCompletion, LLMProvider, LLMTask } from "../../../../llm/index.js";
import { SYSTEM_CORE_GUARDRAILS } from "../../prompts/system-templates.js";
import {
  buildDealIdentity,
  formatDealIdentityLock,
} from "./deal-identity.js";

export async function draftExhibit(state: DraftState, unit: WorkUnit): Promise<DraftState> {
  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  const identity = buildDealIdentity(
    state.structuredFacts ?? state.plan?.structuredFacts,
    state.plan?.documentType
  );
  const prompt = [
    `Draft exhibit: ${unit.heading}`,
    `Work unit id: ${unit.id}`,
    `Document type: ${state.plan?.documentType ?? "contract"}`,
    identity ? formatDealIdentityLock(identity) : "",
    `Facts (use EXACT values; never invent):\n${JSON.stringify(state.structuredFacts ?? {})}`,
    `Instructions: ${state.request.rawInstructions}`,
    "HARD RULE — NO PLACEHOLDERS: Do not emit [● DATE], [PARTY NAME], TBD, or similar brackets. If a fact is missing, describe the schedule in prose without brackets.",
    "HARD RULE — PARTY CONSISTENCY: Use only the DEAL IDENTITY LOCK parties; never invent alternate company names.",
    "Return markdown for this exhibit only.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const outcome = await executeBoundedCompletion(
    prompt,
    SYSTEM_CORE_GUARDRAILS,
    LLMTask.SECTION_REFINE,
    LLMProvider.GEMINI,
    { tracker }
  );

  if (state.agent && tracker) {
    state.agent.tokensUsed = tracker.tokensUsed;
  }

  const body = outcome.text.trim();
  const exhibit = {
    workUnitId: unit.id,
    title: unit.heading,
    body,
    clauseProvenance: [{ spanStart: 0, spanEnd: body.length, source: "generated" as const }],
  };

  const exhibits = [
    ...(state.exhibits ?? []).filter((e) => e.workUnitId !== unit.id),
    exhibit,
  ];

  return { ...state, exhibits };
}
