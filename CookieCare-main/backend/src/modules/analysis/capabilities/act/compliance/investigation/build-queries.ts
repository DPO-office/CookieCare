import type { InvestigationRequirement, RequirementSearchPlan } from "./types.js";

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

export function buildRequirementSearchPlan(
  requirement: InvestigationRequirement
): RequirementSearchPlan {
  const hypothesis = requirement.profile.hypothesis?.trim() || "";
  const hints = unique(requirement.profile.evidenceHints ?? []);
  const exactQueries = hints.filter((hint) => hint.split(/\s+/).length >= 2);
  return {
    requirementId: requirement.requirementId,
    exactQueries,
    sparseQueries: unique([hypothesis, ...hints]),
    denseQueries: unique([hypothesis, ...exactQueries]),
  };
}

