import type {
  IntentRequirement,
  IntentRequirementPriority,
  IntentRequirementType,
  OperationAxis,
  UnresolvedIntentNeed,
} from "../../models/intent.js";
import { pacWarn } from "../../utils/pac-log.js";

const REQUIREMENT_TYPES = new Set<IntentRequirementType>([
  "verification",
  "adequacy",
  "extraction",
  "comparison",
  "coverage",
  "recommendation",
  "other",
]);

const REQUIREMENT_PRIORITIES = new Set<IntentRequirementPriority>([
  "required",
  "supporting",
]);

export function normalizeRequirements(
  requirements: IntentRequirement[] | undefined
): IntentRequirement[] {
  if (!requirements?.length) return [];

  const seen = new Set<string>();
  const normalized: IntentRequirement[] = [];

  for (const item of requirements) {
    if (!item || typeof item !== "object") continue;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const description = typeof item.description === "string" ? item.description.trim() : "";
    const type = REQUIREMENT_TYPES.has(item.type as IntentRequirementType)
      ? (item.type as IntentRequirementType)
      : "other";
    const priority = REQUIREMENT_PRIORITIES.has(item.priority as IntentRequirementPriority)
      ? (item.priority as IntentRequirementPriority)
      : "required";

    if (!id || !description || seen.has(id)) continue;
    seen.add(id);
    normalized.push({ id, description, type, priority });
  }

  return normalized;
}

export function normalizeUnresolvedNeeds(
  unresolvedNeeds: UnresolvedIntentNeed[] | undefined
): UnresolvedIntentNeed[] {
  if (!unresolvedNeeds?.length) return [];

  const normalized: UnresolvedIntentNeed[] = [];
  for (const item of unresolvedNeeds) {
    if (!item || typeof item !== "object") continue;
    const description =
      typeof item.description === "string" ? item.description.trim() : "";
    const reason = typeof item.reason === "string" ? item.reason.trim() : "";
    if (!description) continue;
    normalized.push({
      description,
      reason: reason || "Could not express as a structured requirement",
    });
  }
  return normalized;
}

export function parseRequirementsFromRaw(value: unknown): IntentRequirement[] {
  if (!Array.isArray(value)) return [];
  const parsed: IntentRequirement[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    parsed.push({
      id: typeof record.id === "string" ? record.id : "",
      description: typeof record.description === "string" ? record.description : "",
      type: (typeof record.type === "string"
        ? record.type
        : "other") as IntentRequirementType,
      priority: (typeof record.priority === "string"
        ? record.priority
        : "required") as IntentRequirementPriority,
    });
  }
  return normalizeRequirements(parsed);
}

export function parseUnresolvedNeedsFromRaw(value: unknown): UnresolvedIntentNeed[] {
  if (!Array.isArray(value)) return [];
  const parsed: UnresolvedIntentNeed[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    parsed.push({
      description: typeof record.description === "string" ? record.description : "",
      reason: typeof record.reason === "string" ? record.reason : "",
    });
  }
  return normalizeUnresolvedNeeds(parsed);
}

/**
 * Conservative post-classification guard — logs under-extraction; never replaces LLM output.
 */
export function warnRequirementCoverageGuard(
  instruction: string,
  operation: OperationAxis,
  requirements: IntentRequirement[]
): void {
  const trimmed = instruction.trim();
  if (!trimmed) return;

  if (
    (operation === "compliance_check" ||
      operation === "extract" ||
      operation === "compare") &&
    requirements.length === 0
  ) {
    pacWarn("semantic coverage warning: operation expects requirements but none extracted", {
      operation,
      instructionPreview: trimmed.slice(0, 200),
    });
    return;
  }

  const enumerationSignals =
    /\b(?:verify|check|assess|ensure|confirm)\b[^.!?]{0,120}(?:,|\band\b)/gi;
  const enumMatches = trimmed.match(enumerationSignals) ?? [];
  if (
    operation === "compliance_check" &&
    enumMatches.length >= 2 &&
    requirements.length <= 1
  ) {
    pacWarn(
      "semantic coverage warning: enumerated instruction but few requirements extracted",
      {
        requirementCount: requirements.length,
        enumerationHints: enumMatches.length,
        instructionPreview: trimmed.slice(0, 200),
      }
    );
  }
}

export function countRequirementsByPriority(requirements: IntentRequirement[]): {
  required: number;
  supporting: number;
} {
  let required = 0;
  let supporting = 0;
  for (const requirement of requirements) {
    if (requirement.priority === "supporting") supporting += 1;
    else required += 1;
  }
  return { required, supporting };
}
