import type { AnalysisState } from "../models/analysis-state.js";
import { PacController } from "../pac/controller.js";
import { initAgentRunState, type EntryMode } from "../pac/types.js";
import { defaultPacCapabilities } from "../capabilities/index.js";
import { ensureConversation } from "../memory/conversation-store.js";
import {
  CLAUSE_TAXONOMY_VERSION,
} from "../taxonomies/clause-taxonomy.js";
import { RISK_TAXONOMY_VERSION } from "../taxonomies/index.js";

/**
 * Single entry for Analysis PAC: CREATE | RESUME (after ASK).
 */
export class AnalysisEntry {
  private readonly pac = new PacController(defaultPacCapabilities);

  async run(state: AnalysisState): Promise<AnalysisState> {
    const entryMode: EntryMode = state.entryMode ?? "CREATE";
    const seeded: AnalysisState = {
      ...ensureConversation(state),
      entryMode,
      agent: state.agent ?? initAgentRunState(entryMode),
      metadata: {
        timestamp: state.metadata?.timestamp ?? new Date().toISOString(),
        clauseTaxonomyVersion: CLAUSE_TAXONOMY_VERSION,
        riskTaxonomyVersion: RISK_TAXONOMY_VERSION,
        ...state.metadata,
      },
    };
    return this.pac.run(seeded);
  }

  async resumeAfterAsk(state: AnalysisState): Promise<AnalysisState> {
    const seeded: AnalysisState = {
      ...state,
      entryMode: "RESUME",
      agent: state.agent
        ? { ...state.agent, entryMode: "RESUME", phase: "PLAN", stoppedReason: undefined }
        : initAgentRunState("RESUME"),
    };
    return this.pac.run(seeded);
  }
}

export const analysisEntry = new AnalysisEntry();
