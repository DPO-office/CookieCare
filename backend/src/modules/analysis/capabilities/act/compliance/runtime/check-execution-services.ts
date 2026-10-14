import type { AdditionalEvidenceRequest, ComplianceCheck, VerificationBundle } from "../contracts/index.js";

/** Evidence services used only by explicit archived multi-pass executions. */
export interface CheckExecutionServices {
  bundle: (check: ComplianceCheck) => VerificationBundle;
  investigate?: (check: ComplianceCheck, request: AdditionalEvidenceRequest, signal: AbortSignal) => Promise<VerificationBundle>;
}
