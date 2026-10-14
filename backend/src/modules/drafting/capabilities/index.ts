import type { PacCapabilities } from "./types.js";
import { extractRequirements } from "./plan/extract-requirements.js";
import { extractDealFacts } from "./plan/extract-deal-facts.js";
import { retrieveContext } from "./plan/retrieve-context.js";
import { buildPlan } from "./plan/build-plan.js";
import { executeActPlan } from "./act/execute-act-plan.js";
import { runCritique } from "./critique/run-critique.js";
import { askUser } from "./ask/ask-user.js";
import { persistDraft } from "./persist/persist-draft.js";

/** Production capability bundle — detect-gaps runs inside buildPlan once. */
export const defaultPacCapabilities: PacCapabilities = {
  extractRequirements,
  extractDealFacts,
  retrieveContext,
  buildPlan,
  executeActPlan,
  runCritique,
  askUser,
  persistDraft,
};
