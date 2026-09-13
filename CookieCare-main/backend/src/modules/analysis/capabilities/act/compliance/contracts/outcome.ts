import type { ComplianceCheck } from "./check.js";
import type { VerifiedCitation, VerificationBundle } from "./evidence.js";
import type { ElementDecision, VerificationDecision } from "./verification.js";
export type RequirementStatus = "present" | "partial" | "gap" | "cannot_determine" | "not_applicable" | "conflicting" | "judgment_required" | "verification_incomplete";
export interface OutcomeExplanation {
  whatTheDocumentProvides: string;
  whatIsMissingOrUnclear: string;
  whyItMatters: string;
  conclusion: string;
  recommendedAction: string;
}
interface OutcomeBase {
  outcomeId: string;
  check: ComplianceCheck;
  reasonCodes: string[];
  bundle: VerificationBundle;
  evidence: VerifiedCitation[];
  explanation: OutcomeExplanation;
}
export type ComplianceCheckOutcome = OutcomeBase & ({
  kind: "assessment";
  status: Exclude<RequirementStatus, "verification_incomplete">;
  lockedAssessmentId: string;
  verification: VerificationDecision;
} | {
  kind: "incomplete";
  status: "verification_incomplete";
  lockedAssessmentId?: never;
  verification?: never;
  validatedElements?: ElementDecision[];
});
