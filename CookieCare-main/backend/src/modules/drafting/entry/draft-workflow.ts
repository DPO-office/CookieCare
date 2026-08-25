import type { DraftState } from "../models/draft-state.js";
import { PacController } from "../pac/controller.js";
import { initAgentRunState, type EntryMode } from "../pac/types.js";
import { defaultPacCapabilities } from "../capabilities/index.js";
import { applyFixPlan, synthesizePlanFromDraft } from "../capabilities/act/apply-fix-plan.js";
import { persistDraft } from "../capabilities/persist/persist-draft.js";
import { ensureConversation } from "../memory/conversation-store.js";

/**
 * Single entry for Draft Agreement: always PAC (CREATE | HUMAN_REFINE).
 */

export class DraftEntry {
  private readonly pac = new PacController(defaultPacCapabilities);

  async run(state: DraftState): Promise<DraftState> {
    const entryMode = resolveEntryMode(state);
    let seeded: DraftState = {
      ...ensureConversation(state),
      entryMode,
      agent: state.agent ?? initAgentRunState(entryMode),
    };

    
    if (entryMode === "HUMAN_REFINE") {
      seeded = await applyFixPlan(seeded);

      // Surgical section patch already applied — persist and return.
      if (seeded.metadata?.surgicalRefineApplied) {
        seeded.agent = {
          ...initAgentRunState("HUMAN_REFINE", {
            tokensUsed: seeded.agent?.tokensUsed ?? 0,
          }),
          phase: "DONE",
          stoppedReason: "green",
        };
        return persistDraft(seeded);
      }

      if (!seeded.plan) {
        seeded = synthesizePlanFromDraft(seeded);
      }
      seeded.agent = initAgentRunState("HUMAN_REFINE", {
        tokensUsed: seeded.agent?.tokensUsed ?? 0,
      });
      return this.pac.run(seeded);
    }

    return this.pac.run(seeded);
  }

  async resumeAfterAsk(state: DraftState): Promise<DraftState> {
    const criticalLeft =
      state.plan?.missingFacts?.filter((f) => f.severity === "critical") ?? [];

    // Do NOT re-enter full PLAN/detectGaps after answers — that re-asks the same
    // fields. Either collect remaining critical questions in one ASK, or ACT.
    const phase = criticalLeft.length > 0 ? "ASK" : "ACT";

    const seeded: DraftState = {
      ...state,
      entryMode: "CREATE",
      agent: state.agent
        ? {
            ...state.agent,
            phase,
            stoppedReason: undefined,
            openQuestions: [],
          }
        : initAgentRunState("CREATE", { phase }),
    };
    return this.pac.run(seeded);
  }
}

function resolveEntryMode(state: DraftState): EntryMode {
  if (state.entryMode) return state.entryMode;
  if (state.request.intent === "REFINEMENT") return "HUMAN_REFINE";
  return "CREATE";
}

export const draftEntry = new DraftEntry();
