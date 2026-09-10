import type { AnalysisState } from "../models/analysis-state.js";
import { PacController } from "../pac/controller.js";
import { initAgentRunState, type EntryMode } from "../pac/types.js";
import {
  resolveAnalysisProfile,
  resolveThinkingMode,
} from "../pac/analysis-profile.js";
import { defaultPacCapabilities } from "../capabilities/index.js";
import { ensureConversation } from "../memory/conversation-store.js";
import {
  CLAUSE_TAXONOMY_VERSION,
} from "../taxonomies/clause-taxonomy.js";
import { RISK_TAXONOMY_VERSION } from "../taxonomies/index.js";
import { pacLog } from "../utils/pac-log.js";

/**
 * Single entry for Analysis PAC: CREATE | RESUME (after ASK).
 */
export class AnalysisEntry {
  private readonly pac = new PacController(defaultPacCapabilities);

  async run(state: AnalysisState): Promise<AnalysisState> {
    const entryMode: EntryMode = state.entryMode ?? "CREATE";
    const thinkingMode = resolveThinkingMode(state.request.thinkingMode);
    const profile =
      state.analysisProfile ?? resolveAnalysisProfile(thinkingMode);
    pacLog("analysisProfile", {
      thinkingMode: profile.thinkingMode,
      maxTurns: profile.maxTurns,
      enableDeepCritique: profile.enableDeepCritique,
      maxTier2Attempts: profile.maxTier2Attempts,
      maxReplans: profile.maxReplans,
    });
    const seeded: AnalysisState = {
      ...ensureConversation(state),
      entryMode,
      analysisProfile: profile,
      request: {
        ...state.request,
        thinkingMode,
      },
      agent:
        state.agent ??
        initAgentRunState(entryMode, { maxTurns: profile.maxTurns }),
      metadata: {
        ...state.metadata,
        timestamp: state.metadata?.timestamp ?? new Date().toISOString(),
        clauseTaxonomyVersion: CLAUSE_TAXONOMY_VERSION,
        riskTaxonomyVersion: RISK_TAXONOMY_VERSION,
        thinkingMode: profile.thinkingMode,
        analysisProfile: {
          thinkingMode: profile.thinkingMode,
          maxTurns: profile.maxTurns,
          enableDeepCritique: profile.enableDeepCritique,
          maxTier2Attempts: profile.maxTier2Attempts,
          maxReplans: profile.maxReplans,
          thinkingByTask: profile.thinkingByTask,
          critiqueUsesProChecklist: profile.critiqueUsesProChecklist,
        },
      },
    };
    if (seeded.agent && seeded.agent.maxTurns !== profile.maxTurns) {
      seeded.agent = { ...seeded.agent, maxTurns: profile.maxTurns };
    }
    return this.pac.run(seeded);
  }

  async resumeAfterAsk(state: AnalysisState): Promise<AnalysisState> {
    const thinkingMode = resolveThinkingMode(state.request.thinkingMode);
    const profile =
      state.analysisProfile ?? resolveAnalysisProfile(thinkingMode);
    const seeded: AnalysisState = {
      ...state,
      entryMode: "RESUME",
      analysisProfile: profile,
      request: { ...state.request, thinkingMode },
      agent: state.agent
        ? {
            ...state.agent,
            entryMode: "RESUME",
            phase: "PLAN",
            stoppedReason: undefined,
            maxTurns: profile.maxTurns,
          }
        : initAgentRunState("RESUME", { maxTurns: profile.maxTurns }),
    };
    return this.pac.run(seeded);
  }
}

export const analysisEntry = new AnalysisEntry();
