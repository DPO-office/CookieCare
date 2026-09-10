import type { DraftState } from "../../models/draft-state.js";
import type { WorkUnit } from "../../models/draft-plan.js";
import { executeBoundedCompletion, LLMProvider, LLMTask } from "../../../../llm/index.js";
import { SYSTEM_CORE_GUARDRAILS } from "../../prompts/system-templates.js";
import {
  applyDealIdentityToPlanGlossary,
  buildDealIdentity,
} from "./deal-identity.js";
import {
  buildSectionContext,
  DRAFTING_PRECEDENCE_BLOCK,
} from "./build-section-context.js";

/**
 * Draft a single section work unit.
 * Prefer approved clause text when clause ids are in the plan; record provenance.
 */
export async function draftSection(state: DraftState, unit: WorkUnit): Promise<DraftState> {
  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  const identity = buildDealIdentity(
    state.structuredFacts ?? state.plan?.structuredFacts,
    state.plan?.documentType
  );
  const glossary = identity
    ? applyDealIdentityToPlanGlossary(state.plan?.glossary, identity)
    : state.plan?.glossary ?? {};

  const sectionCtx = buildSectionContext(state, unit);
  console.log(
    `[draftSection] unit=${unit.id} skills=${sectionCtx.skillIds.join(",") || "(none)"} template=${sectionCtx.templateId ?? "none"} playbook=${sectionCtx.playbookId ?? "none"}`
  );

  const system = SYSTEM_CORE_GUARDRAILS;
  const prompt = [
    `Draft ONLY the section headed: ${unit.heading}`,
    `Work unit id: ${unit.id}`,
    `Document type: ${state.plan?.documentType ?? state.draftingContext?.documentType ?? "contract"}`,
    state.plan?.jurisdictionId ? `Governing law pack: ${state.plan.jurisdictionId}` : "",
    DRAFTING_PRECEDENCE_BLOCK,
    sectionCtx.identityLock,
    Object.keys(glossary).length
      ? `Defined terms glossary (locked party keys must not change):\n${JSON.stringify(glossary)}`
      : "",
    sectionCtx.sectionBriefBlock,
    sectionCtx.playbookBlock,
    sectionCtx.templateBlock,
    sectionCtx.approvedClausesBlock
      ? `${sectionCtx.approvedClausesBlock}\nInsert approved clauses VERBATIM where applicable; only generate connective tissue.`
      : "",
    `Canonical facts for this section (use EXACT values — never invent parties, dates, or jurisdictions):\n${JSON.stringify(sectionCtx.relevantFacts)}`,
    `User instructions: ${state.request.rawInstructions}`,
    sectionCtx.fixInstructions.map((f) => `Fix instruction: ${f}`).join("\n") || "",
    "HARD RULE — NO PLACEHOLDERS: Do not emit [● DATE], [PARTY NAME], [PURPOSE], TBD, TODO, or similar brackets. If a fact is missing, omit that optional detail or phrase it as 'the date of this Agreement' / 'the parties' without brackets.",
    "HARD RULE — PARTY CONSISTENCY: Never introduce alternate company names. Use only the DEAL IDENTITY LOCK parties above.",
    "Cross-references: write them in prose (e.g. 'as defined in the Definitions section') — never leave [[SEC:...]] tokens in the output.",
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
  const approved = (state.retrieval.fallbackClauses ?? []).filter(
    (c) => unit.clauseTypes.includes(c.clauseType) && c.isApproved
  );
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

  const glossaryAdds: Record<string, string> = {};
  const locked = new Set(Object.keys(identity?.glossary ?? {}));
  const termRe = /["“]([^"”]{2,60})["”]\s+means\s+/gi;
  let m: RegExpExecArray | null;
  while ((m = termRe.exec(body)) !== null) {
    if (!locked.has(m[1])) glossaryAdds[m[1]] = m[1];
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
  const nextGlossary = identity
    ? applyDealIdentityToPlanGlossary({ ...glossary, ...glossaryAdds }, identity)
    : { ...glossary, ...glossaryAdds };

  return {
    ...state,
    plan: state.plan
      ? {
          ...state.plan,
          glossary: nextGlossary,
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
