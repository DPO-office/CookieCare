import type { AnalysisState } from "../models/analysis-state.js";
import { initAgentRunState, type EntryMode } from "./types.js";
import {
  nextPhaseAfterAct,
  nextPhaseAfterCritique,
  nextPhaseAfterPlan,
  resolveStoppedReason,
} from "./transitions.js";
import { markForRedo } from "./policy.js";
import { appendHistory } from "../utils/persisted-state.js";
import type { PacCapabilities } from "../capabilities/types.js";

/**
 * Analysis PAC controller — TypeScript owns the loop; LLM never chooses phase hops.
 */
export class PacController {
  constructor(private readonly capabilities: PacCapabilities) {}

  async run(state: AnalysisState): Promise<AnalysisState> {
    const entryMode: EntryMode = state.entryMode ?? "CREATE";
    state.agent ??= initAgentRunState(entryMode);
    state.entryMode = entryMode;

    while (state.agent?.phase !== "DONE") {
      if (state.agent.turn >= state.agent.maxTurns) {
        return this.stop(state, "max_turns");
      }
      if (
        state.agent.tokensUsed >= state.agent.tokenBudget ||
        state.agent.docCount > state.agent.maxDocs ||
        state.agent.extractionUnitsUsed > state.agent.maxExtractionUnits
      ) {
        return this.stop(state, "budget_exceeded");
      }

      switch (state.agent.phase) {
        case "PLAN": {
          state = await this.capabilities.classifyIntent(state);
          if (state.intent?.operation === "out_of_scope" || state.declineMessage) {
            state.agent!.phase = "DONE";
            state.agent!.stoppedReason = "out_of_scope";
            state = this.audit(state, "PLAN — out_of_scope decline");
            break;
          }
          state = await this.capabilities.buildPlan(state);
          state = this.audit(state, "PLAN complete");
          state.agent!.phase = nextPhaseAfterPlan(state);
          break;
        }

        case "ASK": {
          state = await this.capabilities.askUser(state);
          state.agent!.stoppedReason = "awaiting_user";
          state = this.audit(state, "ASK — awaiting user");
          return state;
        }

        case "ACT": {
          state = await this.capabilities.executeActPlan(state);
          state = this.audit(state, "ACT complete");
          state.agent!.phase = nextPhaseAfterAct(state);
          break;
        }

        case "CRITIQUE": {
          state = await this.capabilities.runCritique(state);
          state.agent!.turn++;
          const critique = state.critique!;
          const next = nextPhaseAfterCritique(state, critique);

          if (next === "DONE") {
            state.agent!.phase = "DONE";
            state.agent!.stoppedReason = critique.isGreen
              ? "green"
              : resolveStoppedReason(state, critique);
            break;
          }

          if (next === "PLAN") {
            state.agent!.phase = "PLAN";
            break;
          }

          if (next === "ASK") {
            state.agent!.phase = "ASK";
            break;
          }

          if (state.plan) {
            state.plan = {
              ...state.plan,
              workUnits: markForRedo(state.plan.workUnits, critique.fixPlan),
            };
          }
          state.fixPlan = { items: critique.fixPlan, targetedOnly: true };
          state.agent!.phase = "ACT";
          break;
        }

        default:
          state.agent!.phase = "DONE";
          state.agent!.stoppedReason = "blocked";
      }
    }

    return this.capabilities.persistAnalysis(state);
  }

  private async stop(
    state: AnalysisState,
    reason: NonNullable<AnalysisState["agent"]>["stoppedReason"]
  ): Promise<AnalysisState> {
    if (state.agent) {
      state.agent.stoppedReason = reason;
      state.agent.phase = "DONE";
    }
    state = this.audit(state, `stopped: ${reason}`);
    return this.capabilities.persistAnalysis(state);
  }

  private audit(state: AnalysisState, action: string): AnalysisState {
    return appendHistory(state, {
      version: state.findings.length,
      actor: "controller",
      action,
      phase: state.agent?.phase,
      timestamp: new Date().toISOString(),
    });
  }
}
