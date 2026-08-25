import crypto from "crypto";
import type { AnalysisState } from "../../models/analysis-state.js";
import type {
  AnalysisWorkUnit,
  RequirementExecutionPath,
} from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import type { RequirementAssessment } from "../../models/requirement-assessment.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import {
  deriveRequirementStatus,
  findingsForRequirement,
} from "./requirement-status-policy.js";

/**
 * Build the RequirementAssessment reporting view from the authoritative
 * Findings. The link from requirement to finding is now the single field
 * `Finding.requirementId`, stamped at PLAN time onto the work unit
 * (`AnalysisWorkUnit.requirementIds`) and propagated into every finding by
 * the requirement-aware ACT handlers. Aggregation no longer bridges via
 * capability mappings, id prefix, or "same skill" heuristics — an
 * unmatched requirement stays honestly unmatched.
 */
export function aggregateRequirements(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): { state: AnalysisState; findings: Finding[] } {
  const unsupported = (
    (unit.input?.unsupportedRequirements as RequirementExecutionPath[] | undefined) ??
    state.plan?.requirementExecutionPaths?.filter((path) => path.status === "not_supported") ??
    []
  ).filter((path) => path.requirementId && !path.requirementId.startsWith("_dep:"));

  const extraFindings: Finding[] = [];
  for (const path of unsupported) {
    if (findings.some((f) => f.requirementId === path.requirementId)) continue;
    extraFindings.push({
      findingId: `f_unresolved_${path.requirementId}_${crypto.randomUUID().slice(0, 6)}`,
      kind: "compliance",
      category: "other_known_risk",
      status: "insufficient_evidence",
      claim:
        path.reason ??
        `No authored analysis package covers "${path.requirementId}".`,
      evidence: [],
      taxonomyVersion: RISK_TAXONOMY_VERSION,
      workUnitId: unit.workUnitId,
      visibility: "user_facing",
      requirementId: path.requirementId,
    });
  }

  const allFindings = [...findings, ...extraFindings];
  const requirementIds = orderedRequirementIds(allFindings, state);

  const assessments: RequirementAssessment[] = requirementIds.map((requirementId) => {
    const supporting = findingsForRequirement(requirementId, allFindings, state);
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
    findings: allFindings,
  };
}

function orderedRequirementIds(
  findings: Finding[],
  state: AnalysisState
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const req of state.intent?.requirements ?? []) {
    if (seen.has(req.id)) continue;
    seen.add(req.id);
    ordered.push(req.id);
  }
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
  const covered = supporting.find((f) => f.status === "present" && !f.gap);
  const namedWithGap = supporting.find(
    (f) => f.status === "present" && Boolean(f.gap)
  );
  const gap = supporting.find(
    (f) =>
      (f.status === "absent_expected" || f.kind === "risk") && (f.gap || f.claim)
  );
  switch (status) {
    case "covered":
      return covered?.claim ?? namedWithGap?.claim ?? "All required elements are supported.";
    case "missing":
      return gap?.gap ?? gap?.claim ?? "The required element is absent.";
    case "partial":
      return [covered?.claim ?? namedWithGap?.claim, gap?.gap ?? gap?.claim ?? namedWithGap?.gap]
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
  const hasAbsent = supporting.some((f) => f.status === "absent_expected");
  const hasInsufficient = supporting.some(
    (f) => f.status === "insufficient_evidence"
  );
  if (hasInsufficient && !hasAbsent) {
    return "Obtain or confirm the referenced materials or unread remainder of the clause. Do not amend the agreement from incomplete evidence.";
  }
  const gap = supporting.find(
    (f) =>
      f.status === "absent_expected" ||
      Boolean(f.gap) ||
      (f.kind === "risk" && (f.severity === "medium" || f.severity === "high"))
  );
  if (!gap) return undefined;
  return gap.gap ? `Address the gap: ${gap.gap}` : undefined;
}
