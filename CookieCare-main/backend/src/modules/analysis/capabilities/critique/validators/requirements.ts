import type { AnalysisState } from "../../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import type {
  CritiqueIssue,
  CritiqueTarget,
  FixItem,
} from "../../../models/critique-report.js";
import type { Finding } from "../../../models/finding.js";
import { deriveRequirementStatus } from "../../act/requirement-status-policy.js";
import {
  canonicalRequirementStatus,
  isConditionalLike,
  isCoveredLike,
  isGapLike,
  type RequirementStatus,
} from "../../../models/requirement-assessment.js";
import {
  addTarget,
  packageIdForUnit,
  packageUnitForRequirement,
} from "./shared.js";

function statusesAlign(
  assessmentStatus: RequirementStatus,
  derivedStatus: RequirementStatus
): boolean {
  const assessment = canonicalRequirementStatus(assessmentStatus);
  const derived = canonicalRequirementStatus(derivedStatus);
  if (assessment === derived) return true;
  if (isCoveredLike(assessment) && isCoveredLike(derived)) return true;
  if (isConditionalLike(assessment) && isConditionalLike(derived)) return true;
  if (isGapLike(assessment) && isGapLike(derived)) return true;
  return false;
}

export function validateRequirements(
  state: AnalysisState,
  findings: Finding[],
  workUnits: AnalysisWorkUnit[],
  results: CritiqueIssue[],
  fixes: FixItem[],
  targets: CritiqueTarget[]
): void {
  const assessments = state.requirementAssessments ?? [];
  const assessmentById = new Map(
    assessments.map((assessment) => [assessment.requirementId, assessment])
  );
  const findingById = new Map(findings.map((finding) => [finding.findingId, finding]));
  const requiredIds = new Set(
    (state.plan?.intent.requirements ?? [])
      .filter((requirement) => requirement.priority === "required")
      .map((requirement) => requirement.id)
  );
  for (const required of state.plan?.focus?.requirements ?? []) {
    requiredIds.add(required.id);
  }

  for (const requirementId of requiredIds) {
    const assessment = assessmentById.get(requirementId);
    const validTerminalWithoutEvidence =
      assessment?.status === "not_applicable" ||
      assessment?.status === "cannot_determine";
    const covered =
      Boolean(assessment) &&
      (assessment!.supportingFindingIds.length > 0 ||
        validTerminalWithoutEvidence);
    const issueId = `requirement-coverage:${requirementId}`;
    results.push({
      itemId: issueId,
      status: covered ? "pass" : "missing",
      evidenceVerified: covered,
      workUnitId: packageUnitForRequirement(requirementId, findings, workUnits),
      detail: covered
        ? undefined
        : `Required requirement ${requirementId} lacks a valid assessment/finding`,
    });
    if (!covered) {
      const workUnitId = packageUnitForRequirement(
        requirementId,
        findings,
        workUnits
      );
      if (workUnitId) {
        fixes.push({
          workUnitId,
          instruction: `Evaluate required requirement ${requirementId}`,
          sourceItemId: issueId,
        });
      }
    }
  }

  for (const assessment of assessments) {
    const linked = assessment.supportingFindingIds
      .map((id) => findingById.get(id))
      .filter((finding): finding is Finding => Boolean(finding));
    const referencesValid =
      new Set(assessment.supportingFindingIds).size ===
        assessment.supportingFindingIds.length &&
      linked.length === assessment.supportingFindingIds.length &&
      linked.every(
        (finding) =>
          !finding.requirementId ||
          finding.requirementId === assessment.requirementId
      );
    const referenceId = `requirement-refs:${assessment.requirementId}`;
    results.push({
      itemId: referenceId,
      status: referencesValid ? "pass" : "fail",
      evidenceVerified: referencesValid,
      workUnitId: packageUnitForRequirement(
        assessment.requirementId,
        linked,
        workUnits
      ),
      detail: referencesValid
        ? undefined
        : "RequirementAssessment contains missing, duplicate, or cross-requirement Finding references",
    });

    const derived = deriveRequirementStatus(linked);
    const statusConsistent = statusesAlign(assessment.status, derived);
    const consistencyId = `requirement-consistency:${assessment.requirementId}`;
    results.push({
      itemId: consistencyId,
      status: statusConsistent ? "pass" : "ambiguous",
      evidenceVerified: statusConsistent,
      findingId: linked[0]?.findingId,
      workUnitId: packageUnitForRequirement(
        assessment.requirementId,
        linked,
        workUnits
      ),
      detail: statusConsistent
        ? undefined
        : `Assessment status ${assessment.status} conflicts with derived status ${derived}`,
    });
    if (!statusConsistent) {
      addTarget(targets, {
        requirementId: assessment.requirementId,
        findingId: linked[0]?.findingId,
        workUnitId:
          packageUnitForRequirement(
            assessment.requirementId,
            linked,
            workUnits
          ) ?? "",
        evidencePackageId: packageIdForUnit(
          packageUnitForRequirement(
            assessment.requirementId,
            linked,
            workUnits
          ),
          workUnits
        ),
        reason: "internal_inconsistency",
        instruction: `Resolve assessment/Finding status conflict for ${assessment.requirementId}`,
      });
    }

    const statuses = new Set(linked.map((finding) => finding.status));
    if (statuses.has("present") && statuses.has("absent_expected")) {
      addTarget(targets, {
        requirementId: assessment.requirementId,
        findingId: linked.find((finding) => finding.status === "present")?.findingId,
        workUnitId:
          packageUnitForRequirement(
            assessment.requirementId,
            linked,
            workUnits
          ) ?? "",
        evidencePackageId: packageIdForUnit(
          packageUnitForRequirement(
            assessment.requirementId,
            linked,
            workUnits
          ),
          workUnits
        ),
        reason: "conflicting_evidence",
        instruction: `Verify conflicting evidence for ${assessment.requirementId}`,
      });
    }
  }
}

export function validateRequirementMappings(
  state: AnalysisState,
  results: CritiqueIssue[]
): void {
  const mappings = state.plan?.focus?.requirementMappings ?? [];
  const byRequirement = new Map<string, Set<string>>();
  for (const mapping of mappings) {
    const current = byRequirement.get(mapping.requirementId) ?? new Set<string>();
    const duplicate =
      mapping.capabilityIds.some((id) => current.has(id)) ||
      new Set(mapping.capabilityIds).size !== mapping.capabilityIds.length;
    results.push({
      itemId: `requirement-mapping:${mapping.requirementId}`,
      status: duplicate ? "fail" : "pass",
      evidenceVerified: !duplicate,
      detail: duplicate
        ? `Duplicate capability mapping for requirement ${mapping.requirementId}`
        : undefined,
    });
    for (const id of mapping.capabilityIds) current.add(id);
    byRequirement.set(mapping.requirementId, current);
  }
}
