import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type {
  CoverageState,
  RequirementCoverageEntry,
  RequirementCoverageSummary,
} from "../../models/critique-report.js";
import type { Finding } from "../../models/finding.js";

const PLACEHOLDER_CLAIM_PATTERNS = [
  /no analysis package available/i,
  /not supported/i,
  /cannot be analys/i,
];

function isTerminal(unit: AnalysisWorkUnit): boolean {
  return (
    unit.status === "done" ||
    unit.status === "failed" ||
    unit.status === "skipped"
  );
}

function isMeaningfulFinding(finding: Finding): boolean {
  if (finding.visibility === "internal") return false;
  if (PLACEHOLDER_CLAIM_PATTERNS.some((p) => p.test(finding.claim))) return false;
  return true;
}

function unitsForRequirement(
  requirementId: string,
  workUnits: AnalysisWorkUnit[]
): AnalysisWorkUnit[] {
  return workUnits.filter(
    (unit) =>
      unit.requirementIds?.includes(requirementId) ||
      (Array.isArray(unit.input.requirementIds) &&
        (unit.input.requirementIds as string[]).includes(requirementId))
  );
}

function coverageStateForRequirement(
  state: AnalysisState,
  requirementId: string,
  workUnits: AnalysisWorkUnit[],
  findings: Finding[]
): { state: CoverageState; reason?: string } {
  const paths = state.plan?.requirementExecutionPaths ?? [];
  const candidates = paths.filter((p) => p.requirementId === requirementId);
  const hasAnySupported = candidates.some(
    (p) =>
      p.status === "supported" ||
      p.status === "supported_via_dependency" ||
      p.status === "direct_rule"
  );
  if (!hasAnySupported) {
    const notSupported = candidates.find((p) => p.status === "not_supported");
    if (notSupported) {
      return {
        state: "needs_replan",
        reason: notSupported.reason ?? "No execution path",
      };
    }
    const needsReplan = candidates.find((p) => p.status === "needs_replan");
    if (needsReplan) {
      return { state: "needs_replan", reason: needsReplan.reason ?? "Needs replan" };
    }
  }

  const mappedUnits = unitsForRequirement(requirementId, workUnits);
  const supportedCandidate = candidates.find(
    (p) =>
      p.status === "supported" ||
      p.status === "supported_via_dependency" ||
      p.status === "direct_rule"
  );
  const pathPackageId =
    supportedCandidate?.packageId ?? candidates[0]?.packageId;
  const pathRuleIds = supportedCandidate?.ruleIds ?? [];
  if (mappedUnits.length === 0 && !pathPackageId && pathRuleIds.length === 0) {
    return { state: "needs_replan", reason: "No work unit mapped to requirement" };
  }

  const ruleLinkedUnits =
    pathRuleIds.length === 0
      ? []
      : workUnits.filter((unit) => {
          const ruleId = String(unit.input.ruleId ?? "");
          const rowId = String(unit.input.rowId ?? "");
          if (pathRuleIds.includes(ruleId) || pathRuleIds.includes(rowId)) return true;
          if (unit.tool === "flag_risk") {
            const cats = (unit.input.riskCategoryIds as string[] | undefined) ?? [];
            return pathRuleIds.some((id) => cats.includes(id));
          }
          return false;
        });

  const executedUnits = mappedUnits.length > 0 ? mappedUnits : ruleLinkedUnits;
  const executed = executedUnits.some(
    (unit) => isTerminal(unit) && unit.status !== "failed"
  );
  if (!executed && executedUnits.length > 0) {
    return { state: "not_covered", reason: "Mapped work did not complete" };
  }
  // Rule/matrix-supported paths with no stamped requirementIds still count when
  // the leftover units for those capabilities finished (common for DSR meta reqs).
  if (!executed && mappedUnits.length === 0 && pathRuleIds.length > 0) {
    const anyRelatedDone = workUnits.some(
      (unit) =>
        (unit.tool === "evaluate_matrix_row" ||
          unit.tool === "check_against_rule" ||
          unit.tool === "flag_risk") &&
        isTerminal(unit) &&
        unit.status !== "failed"
    );
    if (!anyRelatedDone) {
      return { state: "needs_replan", reason: "No work unit mapped to requirement" };
    }
  } else if (!executed && mappedUnits.length === 0 && !pathPackageId) {
    return { state: "needs_replan", reason: "No work unit mapped to requirement" };
  }

  const assessment = (state.requirementAssessments ?? []).find(
    (a) => a.requirementId === requirementId
  );
  if (!assessment) {
    return { state: "not_covered", reason: "No requirement assessment" };
  }

  if (
    assessment.status === "cannot_determine" ||
    assessment.status === "not_applicable"
  ) {
    return {
      state: "cannot_determine",
      reason: `Assessment status: ${assessment.status}`,
    };
  }

  const supporting = assessment.supportingFindingIds
    .map((id) => findings.find((f) => f.findingId === id))
    .filter((f): f is Finding => Boolean(f));
  const hasMeaningful = supporting.some(isMeaningfulFinding);

  if (
    assessment.status === "covered" ||
    assessment.status === "partial" ||
    hasMeaningful
  ) {
    return { state: "covered" };
  }

  if (assessment.status === "missing") {
    return { state: "not_covered", reason: "Assessment marked missing" };
  }

  return { state: "not_covered", reason: "No meaningful finding for requirement" };
}

/**
 * Deterministic requirement coverage check (P7 §4).
 * Uses PLAN requirements, work units, and assessments — no user-prompt reparsing.
 */
export function validateRequirementCoverage(
  state: AnalysisState
): RequirementCoverageSummary {
  const requirements = state.intent?.requirements ?? state.plan?.intent.requirements ?? [];
  const workUnits = state.plan?.workUnits ?? [];
  const findings = state.findings;

  const entries: RequirementCoverageEntry[] = requirements.map((req) => {
    const result = coverageStateForRequirement(state, req.id, workUnits, findings);
    return { requirementId: req.id, state: result.state, reason: result.reason };
  });

  const notCovered = entries
    .filter((e) => e.state === "not_covered")
    .map((e) => e.requirementId);
  const needsReplan = entries
    .filter((e) => e.state === "needs_replan")
    .map((e) => e.requirementId);
  const covered = entries.filter((e) => e.state === "covered").length;

  return {
    total: entries.length,
    covered,
    entries,
    notCovered,
    needsReplan,
  };
}
