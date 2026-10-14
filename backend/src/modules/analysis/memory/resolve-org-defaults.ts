import type { AnalysisState } from "../models/analysis-state.js";
import type { AnalysisSkillConfig } from "../skills/runtime/catalog/types.js";
import { preferredSkillId, type OrgMemoryProfile } from "./org-memory.js";
import { getSkillById } from "../skills/runtime/catalog/registry.js";
import { hydrateActiveSkills } from "../skills/runtime/catalog/hydrate-active-skills.js";
import { INTENT_CONFIDENCE_THRESHOLD } from "../models/intent.js";
import { pacLog } from "../utils/pac-log.js";

/**
 * Memory may bias routing and defaults only. Never finding substance.
 * Every applied bias is returned as a visible attribution line.
 */
export async function applyOrgRoutingDefaults(
  state: AnalysisState,
  profile: OrgMemoryProfile | undefined
): Promise<AnalysisState> {
  if (!profile) return state;
  let next: AnalysisState = { ...state, orgMemory: profile };
  const attributions = [...(next.memoryAttributions ?? [])];

  next = applyJurisdictionDefault(next, profile, attributions);

  // Skill-frequency tie-break only when PLAN already marked skill ambiguity
  if (next.pendingSkillClarification?.options?.length) {
    const preferred = preferredSkillId(profile);
    const options = next.pendingSkillClarification.options;
    if (preferred && options.includes(preferred)) {
      const skill = getSkillById(preferred);
      if (skill) {
        attributions.push(
          `Defaulting to ${skill.label} based on your org's prior analyses — override anytime.`
        );
        pacLog("org-memory skill tie-break", { skillId: preferred });
        next = await hydrateActiveSkill(next, skill, attributions);
        return { ...next, pendingSkillClarification: undefined };
      }
    }
  }

  // Doc-type / free-text fallback: prefer org frequency over general-review
  if (next.skillSelectionPath === "fallback") {
    const preferred = preferredSkillId(profile);
    const skill = preferred ? getSkillById(preferred) : undefined;
    const currentId = next.activeSkillIds?.[0];
    if (skill && skill.skillId !== currentId && skill.skillId !== "_global") {
      attributions.push(
        `Defaulting to ${skill.label} based on your org's prior analyses — override anytime.`
      );
      pacLog("org-memory fallback skill", { skillId: skill.skillId });
      next = await hydrateActiveSkill(next, skill, attributions);
      return next;
    }
  }

  return {
    ...next,
    memoryAttributions: attributions.length ? attributions : next.memoryAttributions,
  };
}

function applyJurisdictionDefault(
  state: AnalysisState,
  profile: OrgMemoryProfile,
  attributions: string[]
): AnalysisState {
  if (!profile.defaultJurisdiction) return state;

  const intent = state.intent;
  let clarificationRequest = state.clarificationRequest;
  let nextIntent = intent;

  if (
    clarificationRequest?.axes.includes("standard") &&
    (intent?.confidence.standard ?? 0) < INTENT_CONFIDENCE_THRESHOLD
  ) {
    const questions = clarificationRequest.questions.filter((q) => q.field !== "standard");
    const axes = clarificationRequest.axes.filter((a) => a !== "standard");
    clarificationRequest = questions.length
      ? { ...clarificationRequest, axes, questions }
      : undefined;
    if (nextIntent) {
      nextIntent = {
        ...nextIntent,
        confidence: { ...nextIntent.confidence, standard: INTENT_CONFIDENCE_THRESHOLD },
      };
    }
  }

  if (!attributions.some((a) => a.includes("jurisdiction")) && clarificationRequest !== state.clarificationRequest) {
    attributions.push(
      `Assuming ${profile.defaultJurisdiction} review based on your org's prior analyses — override anytime.`
    );
  }

  return {
    ...state,
    intent: nextIntent,
    clarificationRequest,
    memoryAttributions: attributions,
  };
}

async function hydrateActiveSkill(
  state: AnalysisState,
  skill: AnalysisSkillConfig,
  attributions: string[]
): Promise<AnalysisState> {
  return hydrateActiveSkills(state, [skill], {
    skillSelectionPath: state.skillSelectionPath === "library" ? "library" : "free_text",
    updateMetadata: false,
    patch: {
      pendingSkillClarification: undefined,
      memoryAttributions: attributions,
    },
  });
}
