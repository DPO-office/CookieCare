import type { FailureReason } from "../../models/work-unit-outcome.js";
import type { AttemptRecord } from "../../models/work-unit-outcome.js";

export function formatFeedback(
  reason: FailureReason,
  lastAttempt?: AttemptRecord
): string {
  switch (reason.kind) {
    case "verification_rejected":
      return `Previous attempt was rejected: ${reason.critiqueReason}. Address this specific issue — do not repeat the same reasoning.`;
    case "tool_execution_error":
      return `Previous attempt failed with: ${reason.error}. Retry the same evaluation.`;
    case "not_authored":
      return lastAttempt?.rejectionReason
        ? `Previous attempt: ${lastAttempt.rejectionReason}`
        : "";
    case "intent_mismatch":
      return reason.details
        ? `Previous pattern: ${reason.details}. Re-evaluate with tighter alignment to the instruction focus.`
        : "";
    default:
      return "";
  }
}
