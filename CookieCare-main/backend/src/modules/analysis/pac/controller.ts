import type { AnalysisState } from "../models/analysis-state.js";
import { initAgentRunState, type EntryMode } from "./types.js";
import {
  nextPhaseAfterAct,
  nextPhaseAfterCritique,
  nextPhaseAfterPlan,
  resolveStoppedReason,
} from "./transitions.js";
import { markForRedo, isBudgetExceeded, isMaxTurnsReached } from "./policy.js";
import { markBudgetExhaustedOutcomes } from "../capabilities/critique/resolve-work-unit.js";
import { appendHistory } from "../utils/persisted-state.js";
import type { PacCapabilities } from "../capabilities/types.js";
import { pacLog, pacWarn } from "../utils/pac-log.js";

/**
 * Analysis PAC controller — TypeScript owns the loop; LLM never chooses phase hops.
 */
export class PacController {
  constructor(private readonly capabilities: PacCapabilities) {}

  async run(state: AnalysisState): Promise<AnalysisState> {
    const entryMode: EntryMode = state.entryMode ?? "CREATE";
    state.agent ??= initAgentRunState(entryMode);
    state.entryMode = entryMode;
    const t0 = Date.now();
    pacLog("run start", {
      entry: entryMode,
      session: state.request?.sessionId,
      phase: state.agent.phase,
      turn: state.agent.turn,
      maxTurns: state.agent.maxTurns,
    });

    while (state.agent?.phase !== "DONE") {
      if (state.agent.turn >= state.agent.maxTurns) {
        return this.stop(state, "max_turns", t0, true);
      }
      if (
        state.agent.tokensUsed >= state.agent.tokenBudget ||
        state.agent.docCount > state.agent.maxDocs ||
        state.agent.extractionUnitsUsed > state.agent.maxExtractionUnits
      ) {
        return this.stop(state, "budget_exceeded", t0, true);
      }

      const phase = state.agent.phase;
      const phaseStarted = Date.now();
      pacLog(`▶ ${phase}`, {
        turn: `${state.agent.turn}/${state.agent.maxTurns}`,
        tokens: `${state.agent.tokensUsed}/${state.agent.tokenBudget}`,
      });

      switch (phase) {
        case "PLAN": {
          state = await this.capabilities.classifyIntent(state);
          if (state.intent?.operation === "out_of_scope" || state.declineMessage) {
            state.agent!.phase = "DONE";
            state.agent!.stoppedReason = "out_of_scope";
            state = this.audit(state, "PLAN — out_of_scope decline");
            pacLog("PLAN out_of_scope → DONE", { ms: Date.now() - phaseStarted });
            break;
          }
          state = await this.capabilities.buildPlan(state);
          state = this.audit(state, "PLAN complete");
          const next = nextPhaseAfterPlan(state);
          pacLog(`PLAN done → ${next}`, {
            ms: Date.now() - phaseStarted,
            units: state.plan?.workUnits.length ?? 0,
            asks: state.plan?.missingClarifications.length ?? 0,
          });
          state.agent!.phase = next;
          break;
        }

        case "ASK": {
          state = await this.capabilities.askUser(state);
          state.agent!.stoppedReason = "awaiting_user";
          state = this.audit(state, "ASK — awaiting user");
          pacLog("ASK pause — awaiting user", {
            ms: Date.now() - phaseStarted,
            questions: state.agent?.openQuestions?.length ?? 0,
          });
          return state;
        }

        case "ACT": {
          state = await this.capabilities.executeActPlan(state);
          state = this.audit(state, "ACT complete");
          const next = nextPhaseAfterAct(state);
          pacLog(`ACT done → ${next}`, {
            ms: Date.now() - phaseStarted,
            findings: state.findings.length,
            tokens: state.agent?.tokensUsed,
          });
          if (next === "DONE") {
            state.agent!.phase = "DONE";
            state.agent!.stoppedReason = state.agent!.stoppedReason ?? "green";
            break;
          }
          state.agent!.phase = next;
          break;
        }

        case "CRITIQUE": {
          state = await this.capabilities.runCritique(state);
          state.agent!.turn++;
          const critique = state.critique!;
          const next = nextPhaseAfterCritique(state, critique);
          const fails = critique.results.filter(
            (r) => r.status === "fail" || r.status === "missing"
          ).length;
          pacLog(`CRITIQUE ${critique.isGreen ? "GREEN" : "not green"} → ${next}`, {
            ms: Date.now() - phaseStarted,
            iter: critique.iteration,
            fail: fails,
            fixes: critique.fixPlan.length,
            skeleton: critique.skeletonMismatch ? "yes" : "no",
          });

          if (next === "DONE") {
            state.agent!.phase = "DONE";
            state.agent!.stoppedReason =
              critique.isGreen || critique.allUnitsTerminal
                ? critique.isGreen
                  ? "green"
                  : "blocked"
                : resolveStoppedReason(state, critique);
            if (isMaxTurnsReached(state) || isBudgetExceeded(state)) {
              state = markBudgetExhaustedOutcomes(state);
            }
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

          if (!critique.fixPlan.length) {
            pacWarn("CRITIQUE → ACT with empty fixPlan; stopping to avoid a freeze loop");
            state.agent!.phase = "DONE";
            state.agent!.stoppedReason = critique.isGreen
              ? "green"
              : resolveStoppedReason(state, critique);
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
          pacWarn(`unknown phase "${String(phase)}" → DONE`);
          state.agent!.phase = "DONE";
          state.agent!.stoppedReason = "blocked";
      }
    }

    pacLog("run end", {
      reason: state.agent?.stoppedReason ?? "done",
      ms: Date.now() - t0,
      findings: state.findings.length,
      tokens: state.agent?.tokensUsed,
    });
    return this.capabilities.persistAnalysis(state);
  }

  private async stop(
    state: AnalysisState,
    reason: NonNullable<AnalysisState["agent"]>["stoppedReason"],
    t0?: number,
    markExhausted = false
  ): Promise<AnalysisState> {
    if (markExhausted) {
      state = markBudgetExhaustedOutcomes(state);
    }
    if (state.agent) {
      state.agent.stoppedReason = reason;
      state.agent.phase = "DONE";
    }
    pacWarn(`stopped: ${reason}`, {
      turn: state.agent?.turn,
      tokens: state.agent?.tokensUsed,
      ms: t0 ? Date.now() - t0 : undefined,
    });
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
