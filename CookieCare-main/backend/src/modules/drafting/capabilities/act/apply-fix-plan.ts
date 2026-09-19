import type { DraftState } from "../../models/draft-state.js";
import { planHumanRefine, regenerateSections } from "./section-refine.js";
import { conversationWindowText } from "../../memory/conversation-window.js";
import { documentTypeRegistry } from "../../packs/document-types/registry.js";
import type { WorkUnit } from "../../models/draft-plan.js";
import { assembleDocument } from "./assemble-document.js";
import {
  applyDealIdentityToPlanGlossary,
  buildDealIdentity,
} from "./deal-identity.js";

/** Extract explicit party and deal fact overrides from user refinement instruction. */
export function extractFactOverrides(instruction: string): Record<string, string> {
  const patch: Record<string, string> = {};

  // 1. Data Fiduciary = <Name> / Data Fiduciary is <Name>
  const fidMatch = /(?:data\s+fiduciary|fiduciary)\s*(?:=|is|to|:)\s*([^,\n;]+?)(?=\s*(?:\band\b|,|;|\.|\n|\bdata\s+processor\b|\bprocessor\b|\bcan\s+you\b|\bplease\b|$))/i.exec(
    instruction
  );
  if (fidMatch && fidMatch[1].trim()) {
    const val = fidMatch[1].trim();
    patch.dataFiduciaryLegalName = val;
    patch.dataFiduciary = val;
  }

  // 2. Data Processor = <Name> / Data Processor is <Name>
  const procMatch = /(?:data\s+processor|processor)\s*(?:=|is|to|:)\s*([^,\n;]+?)(?=\s*(?:\band\b|,|;|\.|\n|\bdata\s+fiduciary\b|\bfiduciary\b|\bcan\s+you\b|\bplease\b|$))/i.exec(
    instruction
  );
  if (procMatch && procMatch[1].trim()) {
    const val = procMatch[1].trim();
    patch.dataProcessorLegalName = val;
    patch.dataProcessor = val;
  }

  // 3. Party A = <Name> / Party B = <Name>
  const partyAMatch = /party\s*a\s*(?:=|is|to|:)\s*([^,\n;]+?)(?=\s*(?:\band\b|,|;|\.|\n|\bparty\s*b\b|\bcan\s+you\b|\bplease\b|$))/i.exec(
    instruction
  );
  if (partyAMatch && partyAMatch[1].trim()) {
    patch.partyA = partyAMatch[1].trim();
  }
  const partyBMatch = /party\s*b\s*(?:=|is|to|:)\s*([^,\n;]+?)(?=\s*(?:\band\b|,|;|\.|\n|\bparty\s*a\b|\bcan\s+you\b|\bplease\b|$))/i.exec(
    instruction
  );
  if (partyBMatch && partyBMatch[1].trim()) {
    patch.partyB = partyBMatch[1].trim();
  }

  // If fidMatch & procMatch are present, also set partyA and partyB
  if (patch.dataFiduciaryLegalName && patch.dataProcessorLegalName) {
    patch.partyA = patch.dataFiduciaryLegalName;
    patch.partyB = patch.dataProcessorLegalName;
    patch.parties = `${patch.dataFiduciaryLegalName}, ${patch.dataProcessorLegalName}`;
  } else if (patch.dataFiduciaryLegalName && !patch.partyA) {
    patch.partyA = patch.dataFiduciaryLegalName;
  } else if (patch.dataProcessorLegalName && !patch.partyB) {
    patch.partyB = patch.dataProcessorLegalName;
  }

  return patch;
}

/** In-place update of party names in existing draft sections. */
export function applyPartyNameToSections(
  state: DraftState,
  newFid?: string,
  newProc?: string
): DraftState {
  if (!state.draft?.sections) return state;

  const fid = newFid?.trim();
  const proc = newProc?.trim();
  if (!fid && !proc) return state;

  const sections = state.draft.sections.map((s) => {
    let body = s.body;

    if (fid) {
      // In Parties clause: replace entity name before (hereinafter... Data Fiduciary)
      body = body.replace(
        /(?:[A-Z0-9][A-Za-z0-9\s.,&-]+?)\s*\(hereinafter referred to as the [“"']Data Fiduciary[”"']\)/g,
        `${fid} (hereinafter referred to as the “Data Fiduciary”)`
      );
      body = body.replace(
        /Data Fiduciary\s*\(hereinafter/g,
        `${fid} (hereinafter`
      );
      // In Definitions clause: “Data Fiduciary” means <Entity>,
      body = body.replace(
        /([“"']Data Fiduciary[”"']\s+means\s+)[^,]+,/g,
        `$1${fid},`
      );
    }

    if (proc) {
      // In Parties clause: replace entity name before (hereinafter... Data Processor)
      body = body.replace(
        /(?:[A-Z0-9][A-Za-z0-9\s.,&-]+?)\s*\(hereinafter referred to as the [“"']Data Processor[”"']\)/g,
        `${proc} (hereinafter referred to as the “Data Processor”)`
      );
      body = body.replace(
        /Data Processor\s*\(hereinafter/g,
        `${proc} (hereinafter`
      );
      // In Definitions clause: “Data Processor” means <Entity>,
      body = body.replace(
        /([“"']Data Processor[”"']\s+means\s+)[^,]+,/g,
        `$1${proc},`
      );
    }

    return { ...s, body };
  });

  // Also remove HIPAA section if present in a DPDPA agreement
  const isDpdpa = Boolean(
    String(state.structuredFacts?.privacyRegime || "").toLowerCase().includes("dpdpa") ||
      String(state.structuredFacts?.governingLaw || "").toLowerCase().includes("india") ||
      state.structuredFacts?.dataFiduciaryLegalName
  );

  const cleanedSections = isDpdpa
    ? sections.filter((s) => {
        if (s.workUnitId === "sec-hipaa-ba" || s.id === "sec-hipaa-ba") return false;
        if (s.heading && s.heading.toLowerCase().includes("hipaa")) return false;
        return true;
      })
    : sections;

  let nextState: DraftState = {
    ...state,
    draft: {
      ...state.draft,
      sections: cleanedSections,
    },
  };

  if (isDpdpa && nextState.plan) {
    nextState = {
      ...nextState,
      plan: {
        ...nextState.plan,
        workUnits: nextState.plan.workUnits.filter(
          (u) => u.id !== "sec-hipaa-ba" && !u.heading.toLowerCase().includes("hipaa")
        ),
      },
    };
  }

  return nextState;
}

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

  const overrides = extractFactOverrides(state.request.rawInstructions || "");
  let workingState = enriched;

  if (Object.keys(overrides).length > 0) {
    const nextStructured = {
      ...(workingState.structuredFacts ?? {}),
      ...overrides,
    };
    workingState = {
      ...workingState,
      structuredFacts: nextStructured,
      plan: workingState.plan
        ? {
            ...workingState.plan,
            structuredFacts: {
              ...(workingState.plan.structuredFacts ?? {}),
              ...nextStructured,
            },
          }
        : workingState.plan,
    };

    const newFid = overrides.dataFiduciaryLegalName;
    const newProc = overrides.dataProcessorLegalName;
    if (newFid || newProc) {
      const identity = buildDealIdentity(
        workingState.structuredFacts,
        workingState.plan?.documentType
      );
      if (identity && workingState.plan) {
        workingState = {
          ...workingState,
          plan: {
            ...workingState.plan,
            glossary: applyDealIdentityToPlanGlossary(
              workingState.plan.glossary,
              identity
            ),
          },
        };
      }

      workingState = applyPartyNameToSections(workingState, newFid, newProc);
      workingState = await assembleDocument(workingState);
      return {
        ...workingState,
        metadata: {
          ...workingState.metadata,
          surgicalRefineApplied: true,
        },
      };
    }
  }

  const surgical = planHumanRefine(workingState);
  if (surgical) {
    const refined = await regenerateSections(workingState, surgical, "user");
    return {
      ...refined,
      metadata: {
        ...refined.metadata,
        surgicalRefineApplied: true,
      },
    };
  }

  const withPlan = workingState.plan
    ? workingState
    : synthesizePlanFromDraft(workingState);

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
