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

export type RegimeCheckType = "mechanical" | "judgment" | "pattern_then_llm_judgment";

export interface SkillRegimeRule {
  ruleId: string;
  ruleText: string;
  checkType: RegimeCheckType;
  /** Clause types this rule applies to; empty = any data_protection clause. */
  appliesToClauseTypes?: string[];
  label?: string;
  /** Authored citation for the renderer — never LLM-invented. */
  legalHook?: string;
}

export interface ComparativeCheckConfig {
  checkId: string;
  clauseTypesToCompare: string[];
  guidance: string;
}

export interface RightsMatrixRow {
  rowId: string;
  article: string;
  label: string;
}

export interface InstructionFocusMapEntry {
  triggerPhrases: string[];
  focus: {
    ruleIds?: string[];
    matrixRowIds?: string[];
    riskCategoryIds?: string[];
  };
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
  instructionFocusMap?: InstructionFocusMapEntry[];
  rightsMatrixRows?: RightsMatrixRow[];
}

export interface SkillSelectionResult {
  skills: AnalysisSkillConfig[];
  selectionPath: "library" | "free_text" | "fallback";
  ambiguous?: boolean;
  candidateSkillIds?: string[];
}
