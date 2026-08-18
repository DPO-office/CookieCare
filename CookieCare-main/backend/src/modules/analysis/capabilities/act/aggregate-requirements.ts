import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import type { RequirementAssessment } from "../../models/requirement-assessment.js";
import {
  deriveRequirementStatus,
  findingsForRequirement,
} from "./requirement-status-policy.js";

/**
 * Build the RequirementAssessment reporting view from the authoritative
 * Findings (ACT refactor doc §9). The assessment status is DERIVED
 * deterministically from the supporting findings — it never stores a competing
 * verdict. Requirement ids come from the package evaluations that tagged
 * findings with `requirementId`.
 */
export function aggregateRequirements(
  state: AnalysisState,
  _unit: AnalysisWorkUnit,
  findings: Finding[]
): { state: AnalysisState; findings: Finding[] } {
  const requirementIds = orderedRequirementIds(findings);

  const assessments: RequirementAssessment[] = requirementIds.map((requirementId) => {
    const supporting = findingsForRequirement(requirementId, findings);
    const status = deriveRequirementStatus(supporting);
    return {
      requirementId,
      supportingFindingIds: supporting.map((f) => f.findingId),
      status,
      summary: buildSummary(supporting, status),
      recommendation: buildRecommendation(supporting),
    };
  });

  return {
    state: { ...state, requirementAssessments: assessments },
    findings,
  };
}

function orderedRequirementIds(findings: Finding[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const f of findings) {
    if (!f.requirementId || seen.has(f.requirementId)) continue;
    seen.add(f.requirementId);
    ordered.push(f.requirementId);
  }
  return ordered;
}

function buildSummary(
  supporting: Finding[],
  status: RequirementAssessment["status"]
): string {
  const covered = supporting.find((f) => f.status === "present");
  const gap = supporting.find(
    (f) => f.status === "absent_expected" && (f.gap || f.claim)
  );
  switch (status) {
    case "covered":
      return covered?.claim ?? "All required elements are supported.";
    case "missing":
      return gap?.gap ?? gap?.claim ?? "The required element is absent.";
    case "partial":
      return [covered?.claim, gap?.gap ?? gap?.claim]
        .filter(Boolean)
        .join(" However, ");
    case "not_applicable":
      return supporting[0]?.claim ?? "Outside the authored scope for this analysis.";
    case "cannot_determine":
    default:
      return (
        supporting[0]?.claim ??
        "The available evidence is insufficient to reach a conclusion."
      );
  }
}

function buildRecommendation(supporting: Finding[]): string | undefined {
  const gap = supporting.find((f) => f.status === "absent_expected");
  if (!gap) return undefined;
  return gap.gap ? `Address the gap: ${gap.gap}` : undefined;
}
