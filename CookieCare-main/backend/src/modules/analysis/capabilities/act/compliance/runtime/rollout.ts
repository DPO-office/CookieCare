import type { AnalysisState } from "../../../../models/analysis-state.js";
import type { InvestigationRunResult } from "../investigation/index.js";
import type { ComplianceReportSnapshot } from "../../../../models/compliance-report.js";
import type { ComplianceRun } from "./create-run.js";
import type { CheckExecutionServices } from "./check-execution-services.js";
export type VerificationMode = "legacy" | "shadow" | "canonical";
export function verificationMode(env: Record<string, string | undefined> = process.env): VerificationMode {
  const value = env.COMPLIANCE_VERIFICATION_MODE ?? "legacy";
  if (!["legacy", "shadow", "canonical"].includes(value))
    throw new Error("Invalid COMPLIANCE_VERIFICATION_MODE");
  return value as VerificationMode;
}
/** Explicit experiment/replay only; default legacy mode never calls this loader. */
export async function runArchivedMultiPass(run: ComplianceRun, services: CheckExecutionServices): Promise<void> {
  const archived = await import("../legacy/multi-pass/execute-checks.js");
  return archived.executeChecks(run, services);
}
/** Previous verification is the default. Historical paths remain for compatibility. */
export async function runLegacyVerification(state: AnalysisState, investigation: InvestigationRunResult): Promise<ComplianceReportSnapshot | undefined> {
  const old = await import("../legacy/compliance-runtime.js");
  old.beginComplianceRun(state, true);
  old.recordStructuralNodes(state);
  old.recordReferenceIndex(state);
  old.recordRequirementRegistry(state);
  await old.recordGraphNativeInvestigation(state, investigation);
  old.recordElementRegistry(state);
  old.recordPhase4Verification(state);
  // A shadow comparison uses identical frozen evidence; it does not run separate legacy retrieval.
  await old.recordLlmBundleVerification(state);
  old.recordLlmVerifyCanonicalSwap(state);
  old.recordPhase5Assessment(state);
  old.recordLockValidation(state);
  old.recordPlannedRequirements(state, [...new Set([...investigation.bundlesByRequirement.values()].map(b => b.requirementId))]);
  old.recordPhase7Render(state);
  return state.complianceReportSnapshot;
}
