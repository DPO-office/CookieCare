import type { CompiledComplianceRule } from "../../../../skills/runtime/catalog/compile-compliance-rule.js";
export interface ComplianceCheck {
  checkId: string;
  skillId: string;
  ruleId: string;
  reviewScopeId: string;
  documents: Array<{
    documentId: string;
    hash: string;
  }>;
  facetIds: string[];
  selectionReasons: string[];
  rule?: CompiledComplianceRule;
  baselineError?: string;
}
export interface VerificationContext {
  instruction: string;
  /** User supplied facts are identifiable and are not assertions extracted by the verifier. */
  facts: Array<{
    id: string;
    text: string;
  }>;
  questions: Array<{
    id: string;
    text: string;
  }>;
}
