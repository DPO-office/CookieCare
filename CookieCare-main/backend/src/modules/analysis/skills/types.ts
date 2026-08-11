/** Structured analysis skill contract — deterministic; never LLM-invented at runtime. */

export type AnalysisSkillOperation =
  | "risk_flag"
  | "compliance_check"
  | "explain_qa"
  | "compare";

export interface ExpectedClauseCheck {
  clauseType: string;
  severityIfMissing: "low" | "medium" | "high";
  findingCategory: string;
  ruleId?: string;
  /** Optional full-text synonyms to detect likely-present clauses missed by extraction. */
  textSynonyms?: string[];
}

export interface SkillRiskCategory {
  category: string;
  guidance: string;
}

export interface SkillRegimeRule {
  ruleId: string;
  ruleText: string;
  checkType: "mechanical" | "judgment";
  /** Clause types this rule applies to; empty = any data_protection clause. */
  appliesToClauseTypes?: string[];
}

export interface ComparativeCheckConfig {
  checkId: string;
  clauseTypesToCompare: string[];
  guidance: string;
}

export interface AnalysisSkillConfig {
  skillId: string;
  label: string;
  version: string;

  appliesToDocTypes: string[];
  triggerPhrases: string[];
  promptLibraryIds: string[];

  clauseTypes: string[];
  expectedClauses: ExpectedClauseCheck[];
  riskCategories: SkillRiskCategory[];
  regimeRules: SkillRegimeRule[];

  defaultOperation: AnalysisSkillOperation;
  comparativeChecks?: ComparativeCheckConfig[];
}

export interface SkillSelectionResult {
  skills: AnalysisSkillConfig[];
  selectionPath: "library" | "free_text" | "fallback";
  ambiguous?: boolean;
  candidateSkillIds?: string[];
}
