import type { CompletionClient, VerificationRequest, VerificationResult } from "../contracts/index.js";
import { verifyRequirement } from "./verify-requirement.js";
import { reviewDecision } from "./review-decisions.js";
import type { VerificationTrace } from "../diagnostics/index.js";
export async function runVerification(r: VerificationRequest, complete: CompletionClient, signal: AbortSignal, trace?: VerificationTrace): Promise<VerificationResult> {
  return reviewDecision(r, await verifyRequirement(r, complete, signal, 120000, trace), complete, signal, trace);
}
