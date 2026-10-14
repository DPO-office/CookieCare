import type { ComplianceCheck, VerificationContext } from "./check.js";
import type { VerificationBundle, VerifiedCitation } from "./evidence.js";
export type ElementState = "supported" | "contradicted" | "not_located" | "ambiguous" | "unresolved_dependency" | "not_applicable";
export interface ApplicabilityDecision {
  state: "applicable" | "not_applicable" | "unknown";
  basis: string;
  evidenceIds: string[];
  contextFactIds: string[];
}
export interface ElementDecision {
  elementId: string;
  state: ElementState;
  applicability: ApplicabilityDecision;
  citations: VerifiedCitation[];
  establishedFact: string;
  missingProof: string;
  roleReassessment: string;
  actorScope: { relationshipScope: string; basis: string; evidenceIds: string[] };
  limitations: Array<{ description: string; evidenceIds: string[]; materiality: "material" | "immaterial" | "unknown" }>;
  conflicts: Array<{ description: string; evidenceIds: string[]; materiality: "material" | "immaterial" | "unknown" }>;
}
export interface VerificationDecision {
  checkId: string;
  ruleHash: string;
  bundleHash: string;
  applicability: ApplicabilityDecision;
  elements: ElementDecision[];
  dependencies: Array<{
    id: string;
    elementIds: string[];
    materiality: "material" | "immaterial" | "unknown";
    reason: string;
  }>;
  answers: Array<{
    questionId: string;
    answer: string;
    elementIds: string[];
    evidenceIds: string[];
  }>;
  reviewRequired: string[];
  warnings?: string[];
}
export interface VerificationRequest {
  check: ComplianceCheck;
  bundle: VerificationBundle;
  context: VerificationContext;
}
export interface AdditionalEvidenceRequest {
  checkId: string;
  elementIds: string[];
  reason: string;
  queries: string[];
  dependencyIds?: string[];
  targetNodeIds?: string[];
}
export type VerificationResult = {
  kind: "verified";
  decision: VerificationDecision;
  attempts: number;
  additionalEvidence?: AdditionalEvidenceRequest;
} | {
  kind: "incomplete";
  reason: string;
  errors: string[];
  attempts: number;
  validatedFacts?: string[];
  validatedEvidence?: VerifiedCitation[];
  validatedElements?: ElementDecision[];
};
export type CompletionClient = (prompt: string, schema: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>;
