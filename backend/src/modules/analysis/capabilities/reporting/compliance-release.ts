import { createHash } from "node:crypto";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { CritiqueReport, RequirementCoverageSummary } from "../../models/critique-report.js";

export function complianceOutputHash(markdown: string): string {
  return createHash("sha256").update(markdown).digest("hex");
}

/** Mixed risk/comparison workflows retain their existing branch orchestration. */
export function usesCanonicalComplianceReport(state: AnalysisState): boolean {
  if (state.plan?.branches?.some(b => b.intent.operation !== "compliance_check")) return false;
  if (state.intent?.operation === "compliance_check") return true;
  return (state.priorAnalysis?.intent?.operation === "compliance_check" ||
    Boolean(state.priorAnalysis?.complianceReportSnapshot)) &&
    Boolean(state.plan?.workUnits.length) && state.plan!.workUnits.every(u =>
      u.tool === "render_output" &&
      ["presentation_change", "conversational_qa"].includes(String(u.input.followUpKind)));
}

export function hasValidatedComplianceReport(state: AnalysisState): boolean {
  return usesCanonicalComplianceReport(state) &&
    state.complianceReportValidation?.passed === true &&
    Boolean(state.renderedOutput?.trim()) &&
    state.complianceReportValidation.outputHash === complianceOutputHash(state.renderedOutput!);
}

/** The renderer has already checked prose against canonical results. The final
 * gate binds the released text to that check and accounts for outstanding work;
 * it must never re-evaluate locks against the superseded live Finding store. */
export function runComplianceReportGate(state: AnalysisState): AnalysisState {
  const snapshot = state.complianceReportSnapshot;
  const renderUnits = (state.plan?.workUnits ?? []).filter(u => u.tool === "render_output");
  const executionComplete = renderUnits.length > 0 && renderUnits.every(u => u.status === "done");
  const valid = executionComplete && hasValidatedComplianceReport(state);
  const rows = snapshot?.rows ?? [];
  const outstanding = snapshot?.outstandingChecks ?? [];
  const coverage: RequirementCoverageSummary = {
    total: rows.length + outstanding.length,
    covered: rows.length,
    entries: [
      ...rows.map(r => ({ requirementId: r.requirementId, state: "covered" as const })),
      ...outstanding.map(r => ({ requirementId: r.requirementId, state: "not_covered" as const, reason: r.reason })),
    ],
    notCovered: outstanding.map(r => r.requirementId), needsReplan: [],
  };
  const limited = !snapshot || rows.length === 0 || outstanding.length > 0 ||
    snapshot.limitations.length > 0 || rows.some(r =>
      ["cannot_determine", "verification_incomplete", "judgment_required", "conflicting"].includes(r.status));
  const results = valid ? [] : [{
    itemId: "compliance-report-conformance", status: "fail" as const, evidenceVerified: false,
    detail: "The report did not finish validation or changed after validation.",
  }];
  const report: CritiqueReport = {
    isGreen: valid, iteration: (state.critique?.iteration ?? 0) + 1,
    results, executionComplete, structurallyValid: valid, structuralIssues: results,
    deepCritiqueRequired: false, deepCritiqueTargets: [], deepCritiqueResults: [],
    fixPlan: [], skeletonMismatch: false, criticalFactSurfaced: false, outcomes: [],
    allUnitsTerminal: executionComplete,
    metrics: { critiqueLiteMs: 0, deepCritiqueMs: 0, deepCritiqueTriggered: false,
      deepCritiqueTargets: 0, targetedRedoCount: 0, replanCount: 0, askCount: 0, critiqueLLMCalls: 0 },
    release: {
      verdict: !valid ? "withhold" : limited ? "release_with_limitations" : "release",
      reasons: !valid ? ["unsupported_finding"] : limited ? ["coverage_gap"] : [],
      requirementCoverage: coverage, alignment: { issues: [] }, placeholderReport: { detected: false },
    },
  };
  return { ...state, critique: report, repairContext: null,
    // Invalid content must not be emitted later by the normal persistence path.
    renderedOutput: valid ? state.renderedOutput : "The compliance report could not pass its final validation. Run a fresh compliance check before relying on a conclusion." };
}
