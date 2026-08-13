import type { DraftState } from "../models/draft-state.js";
import { initAgentRunState, type EntryMode } from "./types.js";
import {
  nextPhaseAfterAct,
  nextPhaseAfterCritique,
  nextPhaseAfterPlan,
  resolveStoppedReason,
} from "./transitions.js";
import { markForRedraft } from "./policy.js";
import { appendHistory } from "../utils/persisted-state.js";
import type { PacCapabilities } from "../capabilities/types.js";

/**
 * PAC controller — TypeScript owns the loop; LLM never chooses phase hops.
 * Capabilities are injected so Phase 0 can unit-test with fakes and later phases fill real impls.
 */
export class PacController {
  constructor(private readonly capabilities: PacCapabilities) {}

  async run(state: DraftState): Promise<DraftState> {
    const entryMode: EntryMode = state.entryMode ?? "CREATE";
    state.agent ??= initAgentRunState(entryMode);
    state.entryMode = entryMode;

    while (state.agent?.phase !== "DONE") {
      if (state.agent.turn >= state.agent.maxTurns) {
        return this.stop(state, "max_turns");
      }
      if (state.agent.tokensUsed >= state.agent.tokenBudget) {
        return this.stop(state, "budget_exceeded");
      }

      switch (state.agent.phase) {
        case "PLAN": {
          state = await this.capabilities.extractRequirements(state);
          state = await this.capabilities.retrieveContext(state);
          // buildPlan owns the single detect-gaps call and freezes checklist/missingFacts.
          state = await this.capabilities.buildPlan(state);
          state = this.audit(state, "PLAN complete");
          state.agent!.phase = nextPhaseAfterPlan(state);
          break;
        }

        case "ASK": {
          state = await this.capabilities.askUser(state);
          state.agent!.stoppedReason = "awaiting_user";
          state = this.audit(state, "ASK — awaiting user");
          // Persist paused snapshot so resume-ask can reload from draft_state_ledger.
          return this.capabilities.persistDraft(state);
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
            state.agent!.stoppedReason = critique.isGreen ? "green" : resolveStoppedReason(state, critique);
            break;
          }

          if (next === "PLAN") {
            state.agent!.phase = "PLAN";
            break;
          }

          if (next === "ASK") {
            // Keep redraft targets so after answers we rewrite placeholder sections.
            const fixItems = critique.fixPlan ?? [];
            if (fixItems.length > 0 && state.plan) {
              state.plan = {
                ...state.plan,
                workUnits: markForRedraft(state.plan.workUnits, fixItems),
              };
              state.fixPlan = { items: fixItems, targetedOnly: true };
            }
            state.agent!.phase = "ASK";
            break;
          }

          // Targeted ACT only — never full regen.
          // If critique produced no fix targets, stop instead of spinning ACT(0) → CRITIQUE forever.
          const fixItems = critique.fixPlan ?? [];
          if (fixItems.length === 0) {
            console.warn(
              "[PAC] CRITIQUE → ACT with empty fixPlan; stopping loop (draft kept)."
            );
            state.agent!.phase = "DONE";
            state.agent!.stoppedReason = state.draft?.formattedDocument
              ? "green"
              : resolveStoppedReason(state, critique);
            break;
          }

          if (state.plan) {
            state.plan = {
              ...state.plan,
              workUnits: markForRedraft(state.plan.workUnits, fixItems),
            };
          }
          state.fixPlan = { items: fixItems, targetedOnly: true };
          state.agent!.phase = "ACT";
          break;
        }

        default:
          state.agent!.phase = "DONE";
          state.agent!.stoppedReason = "blocked";
      }
    }

    return this.capabilities.persistDraft(state);
  }

  private async stop(
    state: DraftState,
    reason: NonNullable<DraftState["agent"]>["stoppedReason"]
  ): Promise<DraftState> {
    if (state.agent) {
      state.agent.stoppedReason = reason;
      state.agent.phase = "DONE";
    }
    state = this.audit(state, `stopped: ${reason}`);
    return this.capabilities.persistDraft(state);
  }

  private audit(state: DraftState, action: string): DraftState {
    return appendHistory(state, {
      version: state.draft?.version ?? 0,
      actor: "controller",
      action,
      phase: state.agent?.phase,
      timestamp: new Date().toISOString(),
    });
  }
}
