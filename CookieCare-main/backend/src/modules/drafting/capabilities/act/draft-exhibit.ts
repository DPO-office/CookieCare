import type { DraftState } from "../../models/draft-state.js";
import type { WorkUnit } from "../../models/draft-plan.js";
import { executeBoundedCompletion, LLMProvider, LLMTask } from "../../../../llm/index.js";
import { SYSTEM_CORE_GUARDRAILS } from "../../prompts/system-templates.js";

export async function draftExhibit(state: DraftState, unit: WorkUnit): Promise<DraftState> {
  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  const prompt = [
    `Draft exhibit: ${unit.heading}`,
    `Work unit id: ${unit.id}`,
    `Document type: ${state.plan?.documentType ?? "contract"}`,
    `Facts: ${JSON.stringify(state.structuredFacts ?? {})}`,
    `Instructions: ${state.request.rawInstructions}`,
    "Return markdown for this exhibit only.",
  ].join("\n\n");

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
