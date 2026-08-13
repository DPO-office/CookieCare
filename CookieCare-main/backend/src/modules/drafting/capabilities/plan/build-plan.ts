import type { DraftState } from "../../models/draft-state.js";
import type { DraftPlan, WorkUnit, MissingFact } from "../../models/draft-plan.js";
import { orderByDependency } from "../../utils/topo-batches.js";
import { resolveApplicablePacks } from "../../packs/resolve-applicable-packs.js";
import { detectGaps } from "./detect-gaps.js";
import {
  isFactSatisfied,
  mergeCoreMissingFacts,
  prioritizeMissingFacts,
  sanitizeKnownFacts,
} from "./core-deal-facts.js";
import {
  applyDealIdentityToPlanGlossary,
  buildDealIdentity,
} from "../act/deal-identity.js";

function dropSatisfiedGaps(
  missingFacts: MissingFact[],
  facts: Record<string, unknown>
): MissingFact[] {
  return missingFacts.filter((f) => !isFactSatisfied(facts, f.field));
}

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

  // Only pass real known facts into detect-gaps (drop placeholders / inventions).
  const factBag = sanitizeKnownFacts({
    ...(facts as Record<string, unknown>),
    ...((state.structuredFacts ?? {}) as Record<string, unknown>),
  });

  // Single detect-gaps call for this deal — checklist/missingFacts frozen here.
  const gaps = await detectGaps({
    ...state,
    structuredFacts: factBag,
  });

  let missingFacts = dropSatisfiedGaps(gaps.missingFacts, factBag);
  // Deterministic core ASK: universal + document-type deal facts; promote LLM gaps to critical.
  missingFacts = mergeCoreMissingFacts(
    missingFacts,
    factBag,
    typePack.id || state.requirements?.contractType
  );
  missingFacts = dropSatisfiedGaps(missingFacts, factBag);
  missingFacts = prioritizeMissingFacts(missingFacts, 10);

  const criticalCount = missingFacts.filter((f) => f.severity === "critical").length;
  console.log(
    `[buildPlan] missingFacts total=${missingFacts.length} critical=${criticalCount} fields=${missingFacts.map((f) => `${f.field}:${f.severity}`).join(",") || "(none)"}`
  );

  const structuredFacts = { ...facts, ...factBag };
  const identity = buildDealIdentity(
    structuredFacts,
    typePack.id || state.requirements?.contractType
  );

  const plan: DraftPlan = {
    documentType: typePack.id,
    packId: typePack.id,
    title: typePack.id.toUpperCase(),
    workUnits,
    structuredFacts,
    missingFacts,
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
    glossary: identity
      ? applyDealIdentityToPlanGlossary({}, identity)
      : {},
  };

  if (identity) {
    console.log(
      `[buildPlan] deal identity locked: ${identity.roleA}=${identity.partyA} | ${identity.roleB}=${identity.partyB}`
    );
  }

  return {
    ...state,
    structuredFacts: plan.structuredFacts,
    plan,
    context: {
      systemPrompt: state.context?.systemPrompt ?? "",
      assembledPrompt: state.context?.assembledPrompt ?? "",
      documentSkeleton: workUnits.map((u) => u.heading),
      draftSummary: state.context?.draftSummary,
    },
  };
}
