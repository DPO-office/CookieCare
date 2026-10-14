import type { AnalysisState } from "../models/analysis-state.js";
import { initAgentRunState, type EntryMode } from "./types.js";
import {
  nextPhaseAfterAct,
  nextPhaseAfterAudit,
  nextPhaseAfterPlan,
  resolveStoppedReason,
} from "./transitions.js";
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
            // The redo-oriented CRITIQUE phase is retired, but every run must
            // still pass the deterministic Critique Lite release gate.
            state = await this.capabilities.runCritique(state);
            state = this.audit(state, "CRITIQUE-LITE release gate");
            state.agent!.phase = "DONE";
            state.agent!.stoppedReason = resolveStoppedReason(state, state.critique);
            break;
          }
          state.agent!.phase = next;
          break;
        }

        case "AUDIT": {
          void state.onProgress?.(90, "Verifying evidence…");
          state = await this.capabilities.runAudit(state);
          state = this.audit(state, "AUDIT complete");
          const next = nextPhaseAfterAudit(state);
          pacLog(`AUDIT done → ${next}`, {
            ms: Date.now() - phaseStarted,
            findingDowngrades: state.auditReport?.findingsChanged.length ?? 0,
          });
          // Deep mode audits evidence first, then uses the same deterministic
          // release gate. Semantic deep critique remains profile-controlled.
          state = await this.capabilities.runCritique(state);
          state = this.audit(state, "CRITIQUE-LITE release gate after AUDIT");
          state.agent!.phase = next;
          state.agent!.stoppedReason = resolveStoppedReason(state, state.critique);
          break;
        }

        case "CRITIQUE": {
          pacWarn("CRITIQUE phase is retired; going DONE without redo");
          state.agent!.phase = "DONE";
          state.agent!.stoppedReason = resolveStoppedReason(state, state.critique);
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
