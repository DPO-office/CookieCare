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

function cleanPartyName(raw: string): string {
  let s = (raw || "").trim();
  // Strip trailing operational instructions and words that follow entity names
  s = s.replace(
    /\s+(?:everywhere|throughout|in\s+all\s+(?:clauses|sections)|across\s+the\s+(?:draft|agreement)|all\s+occurrences|in\s+this\s+draft|remove.*|ensure.*|and\s+ensure.*|and\s+remove.*|and\s+no.*|and\s+do\s+not.*)$/i,
    ""
  );
  return s.replace(/^["'`\s]+|["'`\s]+$/g, "").trim();
}

/** Extract explicit party and deal fact overrides from user refinement instruction. */
export function extractFactOverrides(instruction: string): Record<string, string> {
  const patch: Record<string, string> = {};

  // 1. Data Fiduciary = <Name> / Data Fiduciary is <Name>
  const fidMatch = /(?:data\s+fiduciary|fiduciary)\s*(?:=|is|to|:)\s*([^,\n;]+?)(?=\s*(?:\band\b|\beverywhere\b|\bthroughout\b|\ball\s+occurrences\b|\bremove\b|\bensure\b|,|;|\.|\n|\bdata\s+processor\b|\bprocessor\b|\bparty\s*a\b|\bparty\s*b\b|\bcan\s+you\b|\bplease\b|$))/i.exec(
    instruction
  );
  if (fidMatch && fidMatch[1].trim()) {
    const val = cleanPartyName(fidMatch[1]);
    if (val) {
      patch.dataFiduciaryLegalName = val;
      patch.dataFiduciary = val;
    }
  }

  // 2. Data Processor = <Name> / Data Processor is <Name>
  const procMatch = /(?:data\s+processor|processor)\s*(?:=|is|to|:)\s*([^,\n;]+?)(?=\s*(?:\band\b|\beverywhere\b|\bthroughout\b|\ball\s+occurrences\b|\bremove\b|\bensure\b|,|;|\.|\n|\bdata\s+fiduciary\b|\bfiduciary\b|\bparty\s*a\b|\bparty\s*b\b|\bcan\s+you\b|\bplease\b|$))/i.exec(
    instruction
  );
  if (procMatch && procMatch[1].trim()) {
    const val = cleanPartyName(procMatch[1]);
    if (val) {
      patch.dataProcessorLegalName = val;
      patch.dataProcessor = val;
    }
  }

  // 3. Party A = <Name> / Party B = <Name>
  const partyAMatch = /party\s*a\s*(?:=|is|to|:)\s*([^,\n;]+?)(?=\s*(?:\band\b|\beverywhere\b|\bthroughout\b|\ball\s+occurrences\b|\bremove\b|\bensure\b|,|;|\.|\n|\bparty\s*b\b|\bcan\s+you\b|\bplease\b|$))/i.exec(
    instruction
  );
  if (partyAMatch && partyAMatch[1].trim()) {
    const val = cleanPartyName(partyAMatch[1]);
    if (val) patch.partyA = val;
  }
  const partyBMatch = /party\s*b\s*(?:=|is|to|:)\s*([^,\n;]+?)(?=\s*(?:\band\b|\beverywhere\b|\bthroughout\b|\ball\s+occurrences\b|\bremove\b|\bensure\b|,|;|\.|\n|\bparty\s*a\b|\bcan\s+you\b|\bplease\b|$))/i.exec(
    instruction
  );
  if (partyBMatch && partyBMatch[1].trim()) {
    const val = cleanPartyName(partyBMatch[1]);
    if (val) patch.partyB = val;
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

/** Synchronize breach notification SLA in exhibits (Schedule B) when breach timeline is updated. */
export function syncBreachHoursInExhibits(state: DraftState, instruction?: string): DraftState {
  if (!instruction || !state.exhibits || state.exhibits.length === 0) return state;
  const lower = instruction.toLowerCase();
  if (!lower.includes("breach")) return state;

  const hourMatch =
    lower.match(/(?:to|within)\s*([0-9]{1,3})\s*(?:hours?|hrs?)/i) ||
    lower.match(/([0-9]{1,3})\s*(?:hours?|hrs?)\s*(?:notification|notice|window|sla)/i) ||
    lower.match(/([0-9]{1,3})\s*(?:hours?|hrs?)/i);

  if (!hourMatch) return state;
  const newHours = hourMatch[1];

  const updatedExhibits = state.exhibits.map((ex) => {
    let b = ex.body;
    // Replace "within 48 hours", "within 72 hours", etc. in breach SLAs
    b = b.replace(/within\s*(?:[0-9]{1,3})\s*hours/gi, `within ${newHours} hours`);
    b = b.replace(/(?:[0-9]{1,3})\s*hours\s*of\s*becoming\s*aware/gi, `${newHours} hours of becoming aware`);
    return { ...ex, body: b };
  });

  return {
    ...state,
    exhibits: updatedExhibits,
  };
}

/** In-place update of party names in existing draft sections and exhibits. */
export function applyPartyNameToSections(
  state: DraftState,
  newFid?: string,
  newProc?: string
): DraftState {
  const fid = cleanPartyName(newFid || "");
  const proc = cleanPartyName(newProc || "");
  if (!fid && !proc) return state;

  const rawInstruction = state.request?.rawInstructions || "";
  const wantsRemoveHipaa = /remove.*hipaa|no.*hipaa|without.*hipaa|drop.*hipaa/i.test(rawInstruction);
  const wantsNoController = /no.*controller|ensure no.*controller|remove.*controller|replace.*controller/i.test(rawInstruction);

  // Gather prior party name candidates so we can swap them everywhere without colliding
  const priorFidList: string[] = [];
  const priorProcList: string[] = [];

  if (state.structuredFacts?.dataFiduciaryLegalName) {
    priorFidList.push(String(state.structuredFacts.dataFiduciaryLegalName));
  }
  if (state.structuredFacts?.partyA) {
    priorFidList.push(String(state.structuredFacts.partyA));
  }
  if (state.structuredFacts?.dataProcessorLegalName) {
    priorProcList.push(String(state.structuredFacts.dataProcessorLegalName));
  }
  if (state.structuredFacts?.partyB) {
    priorProcList.push(String(state.structuredFacts.partyB));
  }

  // Also extract prior party names from existing section bodies (e.g. Section 1)
  for (const s of state.draft?.sections ?? []) {
    const mFid = /(?:1\.\s*\*\*|\bData Fiduciary:?\s*\*\*?)([^*]+?)(?:\*\*,?\s*acting as|\s*\(hereinafter)/i.exec(s.body);
    if (mFid && mFid[1].trim()) priorFidList.push(mFid[1].trim());

    const mProc = /(?:2\.\s*\*\*|\bData Processor:?\s*\*\*?)([^*]+?)(?:\*\*,?\s*acting as|\s*\(hereinafter)/i.exec(s.body);
    if (mProc && mProc[1].trim()) priorProcList.push(mProc[1].trim());
  }

  // Deduplicate and filter out candidates that match the new target names
  const expandCandidates = (list: string[], exclude: string) => {
    const set = new Set<string>();
    for (const item of list) {
      const trimmed = item.trim();
      if (!trimmed || trimmed.toLowerCase() === exclude.toLowerCase()) continue;
      set.add(trimmed);
      // If "Name and 123456", also add "Name"
      const base = trimmed.replace(/\s+and\s+\d+.*$/i, "").trim();
      if (base && base.toLowerCase() !== exclude.toLowerCase()) set.add(base);
    }
    return Array.from(set).sort((a, b) => b.length - a.length);
  };

  const fidCandidates = expandCandidates(priorFidList, fid);
  const procCandidates = expandCandidates(priorProcList, proc);

  const TOKEN_FID = "__TEMP_FID_SWAP_TOKEN__";
  const TOKEN_PROC = "__TEMP_PROC_SWAP_TOKEN__";

  const replacePartiesInText = (text: string): string => {
    let t = text;

    // 1. Substitute prior names with temporary tokens
    for (const c of fidCandidates) {
      t = t.split(c).join(TOKEN_FID);
    }
    for (const c of procCandidates) {
      t = t.split(c).join(TOKEN_PROC);
    }

    // 2. Resolve temporary tokens to new names
    if (fid) t = t.split(TOKEN_FID).join(fid);
    if (proc) t = t.split(TOKEN_PROC).join(proc);

    // 3. Structured section 1 replacements (Parties and Background)
    if (fid) {
      t = t.replace(
        /(1\.\s*\*\*)[^*]+(\*\*(?:,\s*acting as the data fiduciary)?\s*\(hereinafter referred to as the [“"']Data Fiduciary[”"']\))/gi,
        `$1${fid}$2`
      );
      t = t.replace(
        /(1\.\s*\*\*)[^*]+(\*\*,\s*acting as the data fiduciary)/gi,
        `$1${fid}$2`
      );
      t = t.replace(
        /\*\*[^*]+?\*\*\s*,?\s*acting as the data fiduciary/gi,
        `**${fid}**, acting as the data fiduciary`
      );
      t = t.replace(
        /(?:[A-Z0-9][A-Za-z0-9\s.,&-]+?)\s*\(hereinafter referred to as the [“"']Data Fiduciary[”"']\)/g,
        `${fid} (hereinafter referred to as the “Data Fiduciary”)`
      );
      t = t.replace(
        /([“"']Data Fiduciary[”"']\s+means\s+)[^,.\n]+([,.\n])/gi,
        `$1${fid}$2`
      );
    }

    if (proc) {
      t = t.replace(
        /(2\.\s*\*\*)[^*]+(\*\*(?:,\s*acting as the data processor)?\s*\(hereinafter referred to as the [“"']Data Processor[”"']\))/gi,
        `$1${proc}$2`
      );
      t = t.replace(
        /(2\.\s*\*\*)[^*]+(\*\*,\s*acting as the data processor)/gi,
        `$1${proc}$2`
      );
      t = t.replace(
        /\*\*[^*]+?\*\*\s*,?\s*acting as the data processor/gi,
        `**${proc}**, acting as the data processor`
      );
      t = t.replace(
        /(?:[A-Z0-9][A-Za-z0-9\s.,&-]+?)\s*\(hereinafter referred to as the [“"']Data Processor[”"']\)/g,
        `${proc} (hereinafter referred to as the “Data Processor”)`
      );
      t = t.replace(
        /([“"']Data Processor[”"']\s+means\s+)[^,.\n]+([,.\n])/gi,
        `$1${proc}$2`
      );
    }

    // 4. Bind entities preceding (the "Data Processor") or (the "Data Fiduciary")
    if (proc) {
      t = t.replace(
        /(?:[A-Z0-9][A-Za-z0-9.,&'-]+(?:\s+[A-Z0-9][A-Za-z0-9.,&'-]+){0,6})\s*\((?:the\s+)?[“"']Data Processor[”"']\)/g,
        `${proc} (the "Data Processor")`
      );
    }
    if (fid) {
      t = t.replace(
        /(?:[A-Z0-9][A-Za-z0-9.,&'-]+(?:\s+[A-Z0-9][A-Za-z0-9.,&'-]+){0,6})\s*\((?:the\s+)?[“"']Data Fiduciary[”"']\)/g,
        `${fid} (the "Data Fiduciary")`
      );
    }

    // 5. If Controller labels are forbidden or DPDPA active, replace them
    if (wantsNoController) {
      t = t.replace(/\bData Controller\b/gi, "Data Fiduciary");
      t = t.replace(/[“"']Controller[”"']/gi, "“Data Fiduciary”");
      t = t.replace(/\bthe Controller\b/gi, "the Data Fiduciary");
    }

    return t;
  };

  const sections = (state.draft?.sections ?? []).map((s) => {
    let body = replacePartiesInText(s.body);
    return { ...s, body };
  });

  // Update exhibits/schedules (e.g. Schedule A, Schedule B)
  const exhibits = (state.exhibits ?? []).map((e) => {
    let body = replacePartiesInText(e.body);
    if (proc) {
      body = body.replace(
        /Data Processor\s*\([^)]+\)/gi,
        `Data Processor (${proc})`
      );
    }
    if (fid) {
      body = body.replace(
        /Data Fiduciary\s*\([^)]+\)/gi,
        `Data Fiduciary (${fid})`
      );
    }
    return { ...e, body };
  });

  // Also remove HIPAA section if present in a DPDPA agreement or explicitly requested
  const isDpdpa = Boolean(
    String(state.structuredFacts?.privacyRegime || "").toLowerCase().includes("dpdpa") ||
      String(state.structuredFacts?.governingLaw || "").toLowerCase().includes("india") ||
      state.structuredFacts?.dataFiduciaryLegalName ||
      wantsRemoveHipaa
  );

  const cleanedSections = isDpdpa || wantsRemoveHipaa
    ? sections
        .filter((s) => {
          if (s.workUnitId === "sec-hipaa-ba" || s.id === "sec-hipaa-ba") return false;
          if (s.heading && s.heading.toLowerCase().includes("hipaa")) return false;
          return true;
        })
        .map((s) => ({
          ...s,
          body: wantsRemoveHipaa
            ? s.body.replace(/\b(?:HIPAA|Business Associate Agreement|Business Associate)\b[^\n.]*\./gi, "").trim()
            : s.body,
        }))
    : sections;

  let nextState: DraftState = {
    ...state,
    exhibits,
    draft: {
      ...state.draft,
      sections: cleanedSections,
    },
  };

  if ((isDpdpa || wantsRemoveHipaa) && nextState.plan) {
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

    if (newFid && newProc) {
      const priorFidName = String(enriched.structuredFacts?.dataFiduciaryLegalName || enriched.structuredFacts?.partyA || "");
      const priorProcName = String(enriched.structuredFacts?.dataProcessorLegalName || enriched.structuredFacts?.partyB || "");
      if (
        priorFidName &&
        priorProcName &&
        newFid.toLowerCase().includes(priorProcName.toLowerCase()) &&
        newProc.toLowerCase().includes(priorFidName.toLowerCase())
      ) {
        if (nextStructured.dataFiduciaryCin || nextStructured.dataProcessorCin) {
          const tempCin = nextStructured.dataFiduciaryCin;
          nextStructured.dataFiduciaryCin = nextStructured.dataProcessorCin;
          nextStructured.dataProcessorCin = tempCin;
        }
        if (nextStructured.dataFiduciaryAddress || nextStructured.dataProcessorAddress) {
          const tempAddr = nextStructured.dataFiduciaryAddress;
          nextStructured.dataFiduciaryAddress = nextStructured.dataProcessorAddress;
          nextStructured.dataProcessorAddress = tempAddr;
        }
      }
    }

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
    let refined = await regenerateSections(workingState, surgical, "user");
    refined = syncBreachHoursInExhibits(refined, workingState.request.rawInstructions);
    refined = await assembleDocument(refined);
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
