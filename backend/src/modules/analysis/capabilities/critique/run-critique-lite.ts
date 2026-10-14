import type { AnalysisState } from "../../models/analysis-state.js";
import type {
  CritiqueIssue,
  CritiqueTarget,
  FixItem,
} from "../../models/critique-report.js";
import { dedupeFixes } from "../../shared/dedupe.js";
import { validateRequirementCoverage } from "./coverage.js";
import { validateAlignment } from "./alignment.js";
import { detectPlaceholderOutput } from "./placeholder-report.js";
import type {
  AlignmentReport,
  PlaceholderReport,
  RequirementCoverageSummary,
} from "../../models/critique-report.js";
import {
  validateCapabilityCoverage,
  validateFindings,
  validateTaxonomyAndRules,
} from "./validators/findings.js";
import { collectMaterialityAndRigorTargets, hasCriticalUnanswerableFact } from "./validators/materiality.js";
import { validateRequirementMappings, validateRequirements } from "./validators/requirements.js";
import { validateReportSpec } from "./validators/report-spec.js";
import { dedupeTargets, isTerminal } from "./validators/shared.js";
import { validateWorkUnits } from "./validators/work-units.js";

export interface CritiqueLiteResult {
  executionComplete: boolean;
  structurallyValid: boolean;
  structuralIssues: CritiqueIssue[];
  results: CritiqueIssue[];
  fixPlan: FixItem[];
  deepCritiqueRequired: boolean;
  deepCritiqueTargets: CritiqueTarget[];
  skeletonMismatch: boolean;
  criticalFactSurfaced: boolean;
  requirementCoverage: RequirementCoverageSummary;
  alignment: AlignmentReport;
  placeholderReport: PlaceholderReport;
}

/**
 * Cheap invariant validation. This function is deliberately synchronous and
 * contains no LLM/provider dependency.
 */
export function runCritiqueLite(state: AnalysisState): CritiqueLiteResult {
  const results: CritiqueIssue[] = [];
  const fixes: FixItem[] = [];
  const targets: CritiqueTarget[] = [];
  const findings = state.findings;
  const workUnits = state.plan?.workUnits ?? [];

  validateWorkUnits(workUnits, results, fixes);
  validateFindings(state, findings, results, fixes);
  validateTaxonomyAndRules(state, findings, results, fixes);
  validateCapabilityCoverage(findings, workUnits, results, fixes);
  validateRequirements(state, findings, workUnits, results, fixes, targets);
  validateRequirementMappings(state, results);
  validateReportSpec(state, results, fixes);
  collectMaterialityAndRigorTargets(state, findings, workUnits, targets);

  const requirementCoverage = validateRequirementCoverage(state);
  const alignment = validateAlignment(state);
  const placeholderReport = detectPlaceholderOutput(state);

  for (const entry of requirementCoverage.entries) {
    if (entry.state === "not_covered" || entry.state === "needs_replan") {
      const issueId = `coverage:${entry.requirementId}`;
      results.push({
        itemId: issueId,
        status: entry.state === "needs_replan" ? "fail" : "missing",
        evidenceVerified: false,
        detail: entry.reason ?? `Requirement ${entry.requirementId} ${entry.state}`,
      });
    }
  }

  for (const issue of alignment.issues) {
    results.push({
      itemId: `alignment:${issue.kind}:${issue.requirementId ?? issue.packageId ?? "global"}`,
      status: "fail",
      evidenceVerified: false,
      detail: issue.detail,
    });
  }

  if (placeholderReport.detected) {
    results.push({
      itemId: "placeholder-output",
      status: "fail",
      evidenceVerified: false,
      workUnitId: "wu-render",
      detail: placeholderReport.detail ?? "Placeholder output detected",
    });
  }

  const executionComplete = workUnits.every(isTerminal);
  const structuralIssues = results.filter(
    (issue) => issue.status === "fail" || issue.status === "missing"
  );
  const incompleteUnits = results.filter(
    (issue) =>
      issue.itemId.startsWith("complete:") && issue.status === "missing"
  ).length;
  const skeletonMismatch =
    workUnits.length > 0 &&
    incompleteUnits > Math.max(1, Math.floor(workUnits.length / 2));
  const criticalFactSurfaced = hasCriticalUnanswerableFact(state);

  return {
    executionComplete,
    structurallyValid: structuralIssues.length === 0,
    structuralIssues,
    results,
    fixPlan: dedupeFixes(fixes),
    deepCritiqueRequired: targets.length > 0,
    deepCritiqueTargets: dedupeTargets(targets),
    skeletonMismatch,
    criticalFactSurfaced,
    requirementCoverage,
    alignment,
    placeholderReport,
  };
}
