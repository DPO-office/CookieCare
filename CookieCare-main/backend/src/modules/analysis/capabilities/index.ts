import type { PacCapabilities } from "./types.js";
import { classifyIntent } from "./plan/classify-intent.js";
import { buildPlan } from "./plan/build-plan.js";
import { executeActPlan } from "./act/execute-act-plan.js";
import { runCritique } from "./critique/run-critique.js";
import { askUser } from "./ask/ask-user.js";
import { persistAnalysis } from "./persist/persist-analysis.js";

export const defaultPacCapabilities: PacCapabilities = {
  classifyIntent,
  buildPlan,
  executeActPlan,
  runCritique,
  askUser,
  persistAnalysis,
};
