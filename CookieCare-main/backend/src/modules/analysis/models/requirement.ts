import type {
  IntentRequirement,
  IntentRequirementPriority,
  IntentRequirementType,
  UnresolvedIntentNeed,
} from "./intent.js";
import type {
  InstructionRequirement,
  UnresolvedNeedDetail,
} from "./analysis-plan.js";

/**
 * Shared identity for a user-facing requirement across PLAN stages.
 * Stage-specific shapes (`IntentRequirement`, `InstructionRequirement`) remain;
 * use the converters below at boundaries.
 */
export interface RequirementRef {
  id: string;
  label: string;
}

export function toRequirementRef(
  req: IntentRequirement | InstructionRequirement
): RequirementRef {
  if ("description" in req) {
    return { id: req.id, label: req.description };
  }
  return { id: req.id, label: req.label };
}

export function toInstructionRequirement(
  req: IntentRequirement
): InstructionRequirement {
  return {
    id: req.id,
    label: req.description,
  };
}

export function toIntentRequirement(
  req: InstructionRequirement,
  options?: {
    type?: IntentRequirementType;
    priority?: IntentRequirementPriority;
  }
): IntentRequirement {
  return {
    id: req.id,
    description: req.label,
    type: options?.type ?? "other",
    priority: options?.priority ?? "required",
  };
}

export function unresolvedNeedToDetail(
  need: UnresolvedIntentNeed
): UnresolvedNeedDetail {
  return { requirement: need.description, reason: need.reason };
}

export function unresolvedDetailToNeed(
  detail: UnresolvedNeedDetail
): UnresolvedIntentNeed {
  return { description: detail.requirement, reason: detail.reason };
}
