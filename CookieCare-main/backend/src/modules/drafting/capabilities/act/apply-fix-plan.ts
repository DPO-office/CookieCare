import type { DraftState } from "../../models/draft-state.js";
import { planHumanRefine, regenerateSections } from "./section-refine.js";
import { conversationWindowText } from "../../memory/conversation-window.js";
import { documentTypeRegistry } from "../../packs/document-types/registry.js";
import type { WorkUnit } from "../../models/draft-plan.js";

/**
 * HUMAN_REFINE — apply a synthetic fix plan from the user instruction,
 * with conversation window context.
 */
export async function applyFixPlan(state: DraftState): Promise<DraftState> {
  const window = conversationWindowText(state.conversation);
  const enriched: DraftState = {
    ...state,
    request: {
      ...state.request,
      rawInstructions: window
        ? `${state.request.rawInstructions}\n\nPrior conversation:\n${window}`
        : state.request.rawInstructions,
    },
  };

  const surgical = planHumanRefine(enriched);
  if (surgical) {
    const refined = await regenerateSections(enriched, surgical, "user");
    return {
      ...refined,
      metadata: {
        ...refined.metadata,
        surgicalRefineApplied: true,
      },
    };
  }

  const withPlan = enriched.plan ? enriched : synthesizePlanFromDraft(enriched);

  return {
    ...withPlan,
    fixPlan: {
      targetedOnly: true,
      items: (withPlan.plan?.workUnits ?? []).map((u) => ({
        workUnitId: u.id,
        instruction: withPlan.request.rawInstructions,
        sourceChecklistItemId: "human-refine",
      })),
    },
    plan: withPlan.plan
      ? {
          ...withPlan.plan,
          workUnits: withPlan.plan.workUnits.map((u) => ({
            ...u,
            status: "flagged" as const,
          })),
        }
      : withPlan.plan,
  };
}

/** Build a minimal plan from existing draft sections when ledger has no PAC plan yet. */
export function synthesizePlanFromDraft(state: DraftState): DraftState {
  const sections = state.draft?.sections ?? [];
  const typeHint =
    state.structuredFacts?.documentType ||
    state.requirements?.contractType ||
    "dpa";
  const packId = documentTypeRegistry.resolveId(String(typeHint));

  const workUnits: WorkUnit[] =
    sections.length > 0
      ? sections.map((s) => ({
          id: s.workUnitId ?? s.id,
          kind: "section" as const,
          heading: s.heading,
          dependsOn: [],
          clauseTypes: s.clauseType ? [s.clauseType] : [],
          status: "pending" as const,
        }))
      : documentTypeRegistry.get(packId).skeleton.map((u) => ({
          ...u,
          status: "pending" as const,
        }));

  return {
    ...state,
    plan: {
      documentType: packId,
      packId,
      title: packId.toUpperCase(),
      workUnits,
      structuredFacts: state.structuredFacts ?? {},
      missingFacts: [],
      applicableRegimes: state.plan?.applicableRegimes ?? [],
      jurisdictionId: state.plan?.jurisdictionId,
      mandatoryChecklist: state.plan?.mandatoryChecklist ?? [],
      loadedSkillPaths: state.plan?.loadedSkillPaths ?? [],
      selectedClauseIds: state.plan?.selectedClauseIds ?? [],
      negotiationPositions: state.retrieval.applicablePlaybookRules ?? [],
      glossary: state.plan?.glossary ?? {},
    },
  };
}
