import type { AnalysisState } from "../../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import type { CritiqueTarget } from "../../../models/critique-report.js";
import type { Finding } from "../../../models/finding.js";
import {
  addTarget,
  normalize,
  packageIdForUnit,
} from "./shared.js";

const RIGOR_PATTERN =
  /\b(rigorous|exhaustive|clause[- ]by[- ]clause|complete verification|deep verification|strict verification)\b/i;

function targetForFinding(
  finding: Finding,
  workUnits: AnalysisWorkUnit[],
  reason: CritiqueTarget["reason"],
  requirementId = finding.requirementId
): CritiqueTarget {
  return {
    requirementId,
    findingId: finding.findingId,
    workUnitId: finding.workUnitId ?? "",
    evidencePackageId: packageIdForUnit(finding.workUnitId, workUnits),
    reason,
  };
}

export function collectMaterialityAndRigorTargets(
  state: AnalysisState,
  findings: Finding[],
  workUnits: AnalysisWorkUnit[],
  targets: CritiqueTarget[]
): void {
  for (const finding of findings) {
    if (
      finding.visibility === "internal" ||
      finding.unverified ||
      !finding.workUnitId
    ) {
      continue;
    }
    if (
      finding.severity === "high" &&
      (finding.kind === "risk" || finding.kind === "compliance")
    ) {
      addTarget(targets, targetForFinding(finding, workUnits, "high_materiality"));
    }
    if (
      finding.status === "present" &&
      finding.evidence.length > 0 &&
      finding.evidence.every((evidence) => normalize(evidence.quotedText).length < 16)
    ) {
      addTarget(targets, targetForFinding(finding, workUnits, "weak_evidence"));
    }
  }

  if (!RIGOR_PATTERN.test(state.request.instruction)) return;
  const assessments = state.requirementAssessments ?? [];
  for (const assessment of assessments) {
    const supporting = findings.filter((finding) =>
      assessment.supportingFindingIds.includes(finding.findingId)
    );
    const finding = supporting.find(
      (candidate) =>
        candidate.status === "present" && candidate.visibility !== "internal"
    );
    if (!finding?.workUnitId) continue;
    addTarget(
      targets,
      targetForFinding(
        finding,
        workUnits,
        "explicit_rigor_request",
        assessment.requirementId
      )
    );
  }
}

export function hasCriticalUnanswerableFact(state: AnalysisState): boolean {
  const critical = state.plan?.missingClarifications.some(
    (item) => item.severity === "critical"
  );
  if (!critical) return false;
  const canReportUnknown = (state.requirementAssessments ?? []).some(
    (assessment) =>
      assessment.status === "cannot_determine" ||
      assessment.status === "not_applicable"
  );
  return !canReportUnknown;
}
