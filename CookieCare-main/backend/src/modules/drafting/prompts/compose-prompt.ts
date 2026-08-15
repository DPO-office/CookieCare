import type { PlanContext, ActContext, CritiqueContext } from "../packs/document-types/types.js";
import { ORCHESTRATOR_SYSTEM } from "./orchestrator-system.js";

export function composePlanPrompt(ctx: PlanContext, packPrompt: (c: PlanContext) => string): string {
  return `${ORCHESTRATOR_SYSTEM}\n\n${packPrompt(ctx)}`;
}

export function composeActPrompt(ctx: ActContext, packPrompt: (c: ActContext) => string): string {
  return `${ORCHESTRATOR_SYSTEM}\n\n${packPrompt(ctx)}`;
}

export function composeCritiquePrompt(
  ctx: CritiqueContext,
  packPrompt: (c: CritiqueContext) => string
): string {
  return `${ORCHESTRATOR_SYSTEM}\n\n${packPrompt(ctx)}`;
}
