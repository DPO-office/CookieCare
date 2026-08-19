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
 * Findings (ACT refactor doc §9). The assessment status is DERIVED
 * deterministically from the supporting findings — it never stores a competing
 * verdict. Requirement ids come from the package evaluations that tagged
 * findings with `requirementId`.
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

  const structuralFindings = findings.filter(
    (finding) =>
      !finding.requirementId &&
      (finding.skillId?.startsWith("doc-types/") ||
        finding.workUnitId?.includes("check-expected") ||
        finding.workUnitId?.includes("extract"))
  );
  const canReuseStructural = structuralFindings.length > 0;

  const extraFindings: Finding[] = [];
  for (const path of unsupported) {
    if (findings.some((f) => f.requirementId === path.requirementId)) continue;
    if (canReuseStructural && isBroadDocTypeRequirement(path.requirementId)) continue;
    extraFindings.push({
      findingId: `f_unresolved_${path.requirementId}_${crypto.randomUUID().slice(0, 6)}`,
      kind: "compliance",
      category: "other_known_risk",
      status: "not_covered",
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
  const requirementIds = orderedRequirementIds(allFindings);

  const assessments: RequirementAssessment[] = requirementIds.map((requirementId) => {
    const supporting = findingsForRequirement(requirementId, allFindings);
    const status = deriveRequirementStatus(supporting);
    return {
      requirementId,
      supportingFindingIds: supporting.map((f) => f.findingId),
      status,
      summary: buildSummary(supporting, status),
      recommendation: buildRecommendation(supporting),
    };
  });

  for (const req of state.intent?.requirements ?? []) {
    if (assessments.some((assessment) => assessment.requirementId === req.id)) continue;
    if (!canReuseStructural || !isBroadDocTypeRequirement(req.id)) continue;
    const status = deriveRequirementStatus(structuralFindings);
    assessments.push({
      requirementId: req.id,
      supportingFindingIds: structuralFindings.map((finding) => finding.findingId),
      status,
      summary: buildSummary(structuralFindings, status),
      recommendation: buildRecommendation(structuralFindings),
    });
  }

  return {
    state: { ...state, requirementAssessments: assessments },
    findings: allFindings,
  };
}

function isBroadDocTypeRequirement(requirementId: string): boolean {
  const id = requirementId.toLowerCase();
  return (
    id.startsWith("dpa.") ||
    id.includes("overall_analysis") ||
    id.includes("comprehensive_review") ||
    id.includes("key_pointers") ||
    id.includes("key_elements")
  );
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
