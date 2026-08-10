import type { DraftState } from "../../models/draft-state.js";
import type { DraftPlan, WorkUnit } from "../../models/draft-plan.js";
import { orderByDependency } from "../../utils/topo-batches.js";
import { resolveApplicablePacks } from "../../packs/resolve-applicable-packs.js";
import { detectGaps } from "./detect-gaps.js";

/** PLAN capability — three-axis pack merge + one-shot LLM detect-gaps freeze. */
export async function buildPlan(state: DraftState): Promise<DraftState> {
  const { typePack, regimes, jurisdiction, jurisdictionId, facts } =
    resolveApplicablePacks(state);

  const workUnits: WorkUnit[] = orderByDependency([
    ...typePack.skeleton.map((u) => ({ ...u, status: "pending" as const })),
    ...regimes.flatMap((r) =>
      r.additionalWorkUnits.map((u) => ({ ...u, status: "pending" as const }))
    ),
  ]);

  // Single detect-gaps call for this deal — checklist/missingFacts frozen here.
  const gaps = await detectGaps(state);

  const plan: DraftPlan = {
    documentType: typePack.id,
    packId: typePack.id,
    title: typePack.id.toUpperCase(),
    workUnits,
    structuredFacts: facts,
    missingFacts: gaps.missingFacts,
    applicableRegimes: regimes.map((r) => r.id),
    jurisdictionId: jurisdiction?.id ?? jurisdictionId,
    mandatoryChecklist: gaps.checklist,
    loadedSkillPaths: [
      "orchestrator-system",
      ...typePack.skillPaths,
      ...regimes.flatMap((r) => r.skillPaths),
      ...(jurisdiction?.skillPaths ?? []),
    ],
    selectedClauseIds: [],
    negotiationPositions: state.retrieval.applicablePlaybookRules ?? [],
    glossary: {},
  };

  return {
    ...state,
    plan,
    context: {
      systemPrompt: state.context?.systemPrompt ?? "",
      assembledPrompt: state.context?.assembledPrompt ?? "",
      documentSkeleton: workUnits.map((u) => u.heading),
      draftSummary: state.context?.draftSummary,
    },
  };
}
