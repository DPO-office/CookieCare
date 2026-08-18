/** Structured analysis skill contract — deterministic; never LLM-invented at runtime. */

import type { EvidencePackage } from "../models/evidence-package.js";

export type SkillAxis = "global" | "doc-type" | "regime" | "jurisdiction" | "topic";
export type SkillStatus = "draft" | "reviewed" | "published";

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

/** @deprecated Alias — prefer ExpectedClauseCheck. */
export type ExpectedClause = ExpectedClauseCheck;

export interface SkillRiskCategory {
  category: string;
  /** Human-readable label for all user-facing output; never render category directly. */
  displayLabel: string;
  guidance: string;
}

/** @deprecated Alias — prefer SkillRiskCategory. */
export type RiskCategoryDef = SkillRiskCategory;

export type RegimeCheckType = "mechanical" | "judgment" | "pattern_then_llm_judgment";

export interface SkillRegimeRule {
  ruleId: string;
  ruleText: string;
  checkType: RegimeCheckType;
  /** Required authored output category; runtime must never substitute a generic bucket. */
  findingCategory: string;
  /** Per-document principles run once over all relevant clauses; per-clause rules inspect one clause at a time. */
  ruleScope: "per_clause" | "per_document";
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

/** @deprecated Alias — prefer ComparativeCheckConfig. */
export type ComparativeCheck = ComparativeCheckConfig;

export interface RightsMatrixRow {
  rowId: string;
  article: string;
  label: string;
  /** Regime family id when built via family template helpers. */
  family?: string;
  regimeId?: string;
}

export interface InstructionFocusMapEntry {
  triggerPhrases: string[];
  focus: {
    ruleIds?: string[];
    matrixRowIds?: string[];
    riskCategoryIds?: string[];
  };
}

/** Authored adjacent checks — never LLM-invented at runtime. */
export interface RelatedCheckRule {
  /** clauseType or riskCategory the user's focus resolves to. */
  primary: string;
  /** clauseTypes / riskCategories a reviewer would also check. */
  related: string[];
  /** Shown under "Related, not requested". */
  note?: string;
}

export interface AnalysisSkillConfig {
  /** Full path-style id, e.g. "regimes/data-protection/gdpr". */
  skillId: string;
  axis: SkillAxis;
  label: string;
  version: string;

  /** Doc-type inheritance — only valid when axis === "doc-type". */
  extendsDocType?: string;
  /** Regime family grouping — only valid when axis === "regime". */
  family?: string;
  /**
   * Jurisdiction scoping for regime/doc-type skills that behave differently by
   * jurisdiction without a full jurisdictions/* skill.
   */
  appliesToJurisdictions?: string[];

  appliesToDocTypes: string[];
  triggerPhrases: string[];
  promptLibraryIds: string[];

  clauseTypes: string[];
  /** Optional authored definitions — cross-skill conflicts fail registry validation. */
  clauseTypeDefinitions?: Record<string, string>;
  expectedClauses: ExpectedClauseCheck[];
  riskCategories: SkillRiskCategory[];
  /** Full authored rules (ACT needs ruleText). Prefer this over bare ids. */
  regimeRules: SkillRegimeRule[];
  /** Convenience ids mirroring regimeRules — kept for manifest/docs parity. */
  regimeRuleIds?: string[];

  defaultOperation: AnalysisSkillOperation;
  comparativeChecks?: ComparativeCheckConfig[];
  instructionFocusMap?: InstructionFocusMapEntry[];
  rightsMatrixRows?: RightsMatrixRow[];
  relatedChecks?: RelatedCheckRule[];
  /**
   * Authored, versioned evidence/evaluation packages (ACT refactor doc §2).
   * Each package groups related capability ids (rule / matrix-row / risk-category)
   * that ACT evaluates together in one grouped LLM call. Every capabilityId must
   * resolve to a real authored id in this skill (enforced by parity lint).
   */
  evidencePackages?: EvidencePackage[];
}

export interface SkillManifestEntry {
  skillId: string;
  axis: SkillAxis;
  status: SkillStatus;
  version: string;
  owner: string;
  lastReviewedAt?: string;
  coverageNote?: string;
}

export interface SkillSelectionResult {
  skills: AnalysisSkillConfig[];
  selectionPath: "library" | "free_text" | "fallback";
  ambiguous?: boolean;
  candidateSkillIds?: string[];
  /** Draft-status skills selected for a real request — must surface in render. */
  partialCoverageWarning?: string[];
}
