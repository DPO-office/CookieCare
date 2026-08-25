import type { DraftState } from "../../models/draft-state.js";
import type { DraftPlan, WorkUnit } from "../../models/draft-plan.js";
import { orderByDependency } from "../../utils/topo-batches.js";
import { resolveApplicablePacks } from "../../packs/resolve-applicable-packs.js";
import { detectGaps } from "./detect-gaps.js";
import { sanitizeKnownFacts } from "./core-deal-facts.js";
import { resolveRequirements } from "./resolve-requirements.js";
import { computeGapsAndConflicts } from "./compute-gaps.js";
import {
  applyDealIdentityToPlanGlossary,
  buildDealIdentity,
} from "../act/deal-identity.js";

/** PLAN capability — resolve requirements, detect-gaps checklist, compute ASK gaps. */
export async function buildPlan(state: DraftState): Promise<DraftState> {
  const { typePack, regimes, jurisdiction, jurisdictionId, facts } =
    resolveApplicablePacks(state);

  const workUnits: WorkUnit[] = orderByDependency([
    ...typePack.skeleton.map((u) => ({ ...u, status: "pending" as const })),
    ...regimes.flatMap((r) =>
      r.additionalWorkUnits.map((u) => ({ ...u, status: "pending" as const }))
    ),
  ]);

  // Merge pack facts + extracted structuredFacts, then resolve catalog statuses.
  const factBag = sanitizeKnownFacts({
    ...(facts as Record<string, unknown>),
    ...((state.structuredFacts ?? {}) as Record<string, unknown>),
    documentType:
      state.structuredFacts?.documentType ||
      typePack.id ||
      state.requirements?.contractType,
  });

  let working: DraftState = {
    ...state,
    structuredFacts: {
      ...factBag,
      documentType:
        (typeof factBag.documentType === "string"
          ? factBag.documentType
          : undefined) || typePack.id,
    },
  };

  working = resolveRequirements(working);

  // detect-gaps: checklist is authoritative; missingFacts are hints only.
  const gaps = await detectGaps(working);
  const missingFacts = computeGapsAndConflicts(working, gaps.missingFacts);

  const criticalCount = missingFacts.filter((f) => f.severity === "critical").length;
  console.log(
    `[buildPlan] missingFacts total=${missingFacts.length} critical=${criticalCount} fields=${missingFacts.map((f) => `${f.field}:${f.severity}`).join(",") || "(none)"}`
  );

  const structuredFacts = {
    ...(working.structuredFacts ?? {}),
  };
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
    negotiationPositions: working.retrieval.applicablePlaybookRules ?? [],
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
    ...working,
    structuredFacts: plan.structuredFacts,
    plan,
    context: {
      systemPrompt: working.context?.systemPrompt ?? "",
      assembledPrompt: working.context?.assembledPrompt ?? "",
      documentSkeleton: workUnits.map((u) => u.heading),
      draftSummary: working.context?.draftSummary,
    },
  };
}
