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
import {
  assembleDraftingContext,
  collectSkillConfigs,
  resolveConditionalWorkUnits,
} from "./assemble-drafting-context.js";

/** PLAN capability — resolve requirements, detect-gaps checklist, compute ASK gaps. */
export async function buildPlan(state: DraftState): Promise<DraftState> {
  const applicableInitial = resolveApplicablePacks(state);
  const { typePack, facts } = applicableInitial;

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

  const applicable = resolveApplicablePacks(working);
  const skills = collectSkillConfigs(applicable);
  const conditionalUnits = resolveConditionalWorkUnits(
    skills,
    working.structuredFacts ?? {}
  );

  const workUnits: WorkUnit[] = orderByDependency([
    ...applicable.typePack.skeleton.map((u) => ({
      ...u,
      status: "pending" as const,
    })),
    ...applicable.regimes.flatMap((r) =>
      r.additionalWorkUnits.map((u) => ({ ...u, status: "pending" as const }))
    ),
    ...conditionalUnits,
  ]);

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
    applicable.typePack.id || state.requirements?.contractType
  );

  const draftingContext = assembleDraftingContext(
    working,
    applicable,
    workUnits
  );
  draftingContext.gaps = missingFacts;

  const plan: DraftPlan = {
    documentType: applicable.typePack.id,
    packId: applicable.typePack.id,
    title: applicable.typePack.id.toUpperCase(),
    workUnits,
    structuredFacts,
    missingFacts,
    applicableRegimes: applicable.regimes.map((r) => r.id),
    jurisdictionId: applicable.jurisdiction?.id ?? applicable.jurisdictionId,
    mandatoryChecklist: gaps.checklist,
    loadedSkillPaths: [
      "orchestrator-system",
      ...applicable.typePack.skillPaths,
      ...applicable.regimes.flatMap((r) => r.skillPaths),
      ...(applicable.jurisdiction?.skillPaths ?? []),
    ],
    selectedTemplateId:
      draftingContext.template?.id ||
      working.request.templateId ||
      working.request.vaultDocumentId ||
      undefined,
    selectedClauseIds: working.request.clauseIds ?? [],
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
    draftingContext,
    plan,
    context: {
      systemPrompt: working.context?.systemPrompt ?? "",
      assembledPrompt: working.context?.assembledPrompt ?? "",
      documentSkeleton: workUnits.map((u) => u.heading),
      draftSummary: working.context?.draftSummary,
    },
  };
}
