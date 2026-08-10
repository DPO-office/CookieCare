import type { DraftState } from "../../models/draft-state.js";
import type { WorkUnit } from "../../models/draft-plan.js";
import { executeBoundedCompletion, LLMProvider, LLMTask } from "../../../../llm/index.js";
import { SYSTEM_CORE_GUARDRAILS } from "../../prompts/system-templates.js";

/**
 * Draft a single section work unit.
 * Prefer approved clause text when clause ids are in the plan; record provenance.
 */
export async function draftSection(state: DraftState, unit: WorkUnit): Promise<DraftState> {
  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  const glossary = state.plan?.glossary ?? {};
  const approved = (state.retrieval.fallbackClauses ?? []).filter(
    (c) => unit.clauseTypes.includes(c.clauseType) && c.isApproved
  );

  const system = SYSTEM_CORE_GUARDRAILS;
  const prompt = [
    `Draft ONLY the section headed: ${unit.heading}`,
    `Work unit id: ${unit.id}`,
    `Document type: ${state.plan?.documentType ?? "contract"}`,
    state.plan?.jurisdictionId ? `Governing law pack: ${state.plan.jurisdictionId}` : "",
    Object.keys(glossary).length
      ? `Defined terms glossary (use these; do not renumber sections):\n${JSON.stringify(glossary)}`
      : "",
    approved.length
      ? `Insert these approved clauses VERBATIM where applicable; only generate connective tissue:\n${approved
          .map((c) => `[${c.id}] ${c.text}`)
          .join("\n\n")}`
      : "",
    `Facts: ${JSON.stringify(state.structuredFacts ?? {})}`,
    `Instructions: ${state.request.rawInstructions}`,
    state.fixPlan?.items
      .filter((f) => f.workUnitId === unit.id)
      .map((f) => `Fix instruction: ${f.instruction}`)
      .join("\n") || "",
    "Use semantic anchors like [[SEC:definitions]] for cross-refs — never hardcode section numbers.",
    "Return markdown for this section only, starting with a ## heading.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const outcome = await executeBoundedCompletion(
    prompt,
    system,
    LLMTask.SECTION_REFINE,
    LLMProvider.GEMINI,
    {
      onDelta: state.onToken,
      tracker,
    }
  );

  if (state.agent && tracker) {
    state.agent.tokensUsed = tracker.tokensUsed;
  }

  const body = outcome.text.trim();
  const provenance =
    approved.length > 0
      ? approved.map((c) => {
          const idx = body.indexOf(c.text.slice(0, Math.min(40, c.text.length)));
          return {
            spanStart: idx >= 0 ? idx : 0,
            spanEnd: idx >= 0 ? idx + c.text.length : 0,
            source: "approved-clause" as const,
            clauseId: c.id,
          };
        })
      : [{ spanStart: 0, spanEnd: body.length, source: "generated" as const }];

  // Extract simple defined terms from "X" means patterns to seed glossary
  const glossaryAdds: Record<string, string> = {};
  const termRe = /["“]([^"”]{2,60})["”]\s+means\s+/gi;
  let m: RegExpExecArray | null;
  while ((m = termRe.exec(body)) !== null) {
    glossaryAdds[m[1]] = m[1];
  }

  const section = {
    id: unit.id,
    heading: unit.heading,
    body,
    workUnitId: unit.id,
    clauseType: unit.clauseTypes[0],
    clauseProvenance: provenance,
  };

  const sections = [...(state.draft?.sections ?? []).filter((s) => s.workUnitId !== unit.id), section];

  return {
    ...state,
    plan: state.plan
      ? {
          ...state.plan,
          glossary: { ...state.plan.glossary, ...glossaryAdds },
        }
      : state.plan,
    draft: {
      rawOutput: sections.map((s) => s.body).join("\n\n"),
      formattedDocument: sections.map((s) => s.body).join("\n\n"),
      sections,
      version: state.draft?.version ?? 1,
      parentVersionId: state.draft?.parentVersionId,
    },
  };
}
