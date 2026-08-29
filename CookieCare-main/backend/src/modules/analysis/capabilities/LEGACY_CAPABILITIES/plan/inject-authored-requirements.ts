import type { InstructionFocus } from "../../../models/analysis-plan.js";
import type { IntentClassification } from "../../../models/intent.js";
import type { AnalysisSkillConfig } from "../../../skills/runtime/catalog/types.js";
import { pacLog } from "../../../utils/pac-log.js";

/**
 * Inject doc-type skill authoredRequirements into intent when the user asked
 * for a broad whole-document review and the classifier produced no
 * requirements. Never overwrites classifier output (P4).
 */
export function injectAuthoredRequirements(
  intent: IntentClassification,
  activeSkills: AnalysisSkillConfig[],
  focus?: InstructionFocus
): IntentClassification {
  if (!isBroadReview(intent, focus)) return intent;

  const seen = new Set<string>();
  const injected = [];
  for (const skill of activeSkills) {
    if (skill.axis !== "doc-type") continue;
    for (const req of skill.authoredRequirements ?? []) {
      if (!req.id || seen.has(req.id)) continue;
      seen.add(req.id);
      injected.push(req);
    }
  }

  if (injected.length === 0) return intent;

  pacLog("PLAN inject authoredRequirements", {
    count: injected.length,
    ids: injected.map((r) => r.id).join(","),
  });

  return {
    ...intent,
    requirements: injected,
  };
}

function isBroadReview(
  intent: IntentClassification,
  focus?: InstructionFocus
): boolean {
  if (intent.scope !== "whole_document") return false;
  if ((intent.requirements ?? []).length > 0) return false;
  if ((focus?.ruleIds?.length ?? 0) > 0) return false;
  if ((focus?.matrixRowIds?.length ?? 0) > 0) return false;
  if ((focus?.riskCategoryIds?.length ?? 0) > 0) return false;
  if ((focus?.explicitScope?.articles?.length ?? 0) > 0) return false;
  return true;
}
