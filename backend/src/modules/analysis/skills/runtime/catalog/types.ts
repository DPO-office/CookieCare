/** Structured analysis skill contract — deterministic; never LLM-invented at runtime. */

import type { EvidencePackage, EvidenceScopeConstraint } from "../../../models/evidence-package.js";
import type { IntentRequirement, IntentRequirementType } from "../../../models/intent.js";

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

/** Authored search terms for deterministic clause location. */
export interface ClauseRetrievalDict {
  headings: string[];
  aliases: string[];
  anchorTerms: string[];
}

export interface SkillRiskSilencePattern {
  /** Clause is a candidate when its type is listed. */
  triggerClauseTypes?: string[];
  /** Additional candidate detector; matched against clause text. */
  triggerRegex?: string;
  /** Finding fires only when NONE of the candidate clauses match this. */
  satisfyRegex: string;
  claim: string;
  severity: "low" | "medium" | "high";
}

export interface SkillRiskHeuristic {
  clauseType?: string;
  regex: string;
  /** If this matches, the heuristic does not fire. */
  excludeRegex?: string;
  claim: string;
  severity: "low" | "medium" | "high";
  quoteLen?: number;
}

export interface SkillRiskCategory {
  category: string;
  /** Human-readable label for all user-facing output; never render category directly. */
  displayLabel: string;
  guidance: string;
  /** Deterministic "duty present, required term silent" detector. */
  silencePattern?: SkillRiskSilencePattern;
  /** LLM-fallback detectors; the handler iterates these, never category names. */
  heuristic?: SkillRiskHeuristic[];
}

export type RegimeCheckType = "mechanical" | "judgment" | "pattern_then_llm_judgment";

export interface SkillRegimeMechanicalScan {
  kind: "numeric_pattern_expected";
  /** Authored regex source; compiled by the generic handler. */
  pattern: string;
  vaguePattern?: string;
  /** Use `{match}` for the captured snippet. */
  presentClaim: string;
  vagueClaim: string;
  absentClaim: string;
  vagueGap?: string;
  absentGap?: string;
  severityPresent?: "low" | "medium" | "high";
  severityVague?: "low" | "medium" | "high";
  severityAbsent?: "low" | "medium" | "high";
}

/** Renderer-only hooks — consumed by `render-output`, never by ACT handlers. */
export interface RendererHooks {
  /** Emit SLA contrast paragraph when this rule's finding is present. */
  slaContrast?: boolean;
  /** Label used in SLA contrast copy (e.g. "Article 12(3)"). */
  slaContrastLabel?: string;
  /** Clause types excluded when scanning for numeric SLA examples. */
  excludeClauseTypesFromSlaContrast?: string[];
  /** Prefer this rule's finding in the architecture summary paragraph. */
  particularsChecklist?: boolean;
  /** Section heading for the response-timeframe block driven by this rule. */
  responseTimeframeSection?: boolean;
  /** Fallback architecture copy when no summary/assistance finding exists. */
  architectureFallback?: string;
}

/** Structured legal citation — the authoritative source of a rule's identity. */
export interface SkillRegimeRuleAuthority {
  instrument: string;
  citation: string;
  provisionPath: string[];
  /** Position within the instrument's provision ordering — enables article-range expansion. */
  order?: number;
  citationAliases?: string[];
}

/** Selection vocabulary used by the rule-first resolver's exact/BM25/dense matching. */
export interface SkillRegimeRuleSelection {
  aliases: string[];
  concepts: string[];
  actors?: string[];
  beneficiaries?: string[];
  actions?: string[];
  objects?: string[];
}

/** Applicability boundary — when a rule is a candidate at all. */
export interface SkillRegimeRuleApplicability {
  documentTypes?: string[];
  jurisdictions?: string[];
  relationshipScopes?: string[];
  partyPerspectives?: string[];
}

export interface SkillRegimeRuleProofElement {
  id: string;
  description: string;
  kind?: "mandatory" | "conditional" | "alternative" | "optional";
  weight?: number;
  applicabilityGuidance?: string;
  proofGuidance?: string;
  nonProofTraps?: string[];
  remediationGuidance?: string;
  /** @deprecated Compatibility projection; kind is authoritative. */
  required?: boolean;
}

export type ComplianceAggregation = { elementId: string } | {
  operator: "all" | "any";
  children: ComplianceAggregation[];
};

export interface SkillRuleVerification {
  version: string;
  reviewStatus: "authored" | "legal_reviewed";
  aggregation?: ComplianceAggregation;
  applicabilityGuidance?: string;
  /** Preserved legal interpretation, never a separately executed checklist. */
  guidance?: string[];
}

/**
 * Atomic investigation profile — the rule-first replacement for
 * `EvidencePackage.requirementEvidence[ruleId]`. A rule is only selectable by
 * the rule-first resolver when this is populated; otherwise it is routed
 * through the legacy package-first path unchanged.
 */
export interface SkillRegimeRuleInvestigation {
  hypothesis: string;
  evidenceHints: string[];
  proofStandard: string;
  proofElements: SkillRegimeRuleProofElement[];
  evidenceScope?: EvidenceScopeConstraint;
  /**
   * Extension beyond the base rule-first spec: `InvestigationRequirement`
   * needs clause/extraction targeting to drive retrieval. Defaults to the
   * owning skill's full `clauseTypes`/no extraction narrowing when omitted.
   */
  clauseTypeHints?: string[];
  extractionTargets?: string[];
}

export interface SkillRegimeRuleRelationships {
  requires?: string[];
  supports?: string[];
  relatedTo?: string[];
}

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
  /**
   * Optional deterministic pre-scan. When present, the generic handler runs it
   * instead of branching on `ruleId`.
   */
  mechanicalScan?: SkillRegimeMechanicalScan;
  /** Optional renderer hooks — legal copy stays in skill config, not ACT. */
  rendererHooks?: RendererHooks;
  /** Matrix rows this rule is linked to (for related-check resolution). */
  matrixLinkage?: { matrixRowIds: string[] };
  /** Rule-first contract (Phase: rule-first compliance requirement resolution). */
  authority?: SkillRegimeRuleAuthority;
  selection?: SkillRegimeRuleSelection;
  applicability?: SkillRegimeRuleApplicability;
  investigation?: SkillRegimeRuleInvestigation;
  verification?: SkillRuleVerification;
  relationships?: SkillRegimeRuleRelationships;
  /**
   * Compatibility identity used only by the unchanged Phase 4 verifier when
   * an atomic rule id differs from an existing authored schema/package-native
   * id. Investigation continues to use `ruleId` and never reads the schema.
   */
  legacyRequirementId?: string;
}

/** Named shortcut to a set of rule ids — never owns hypotheses/evidence/applicability. */
export interface ComplianceComposition {
  id: string;
  label: string;
  aliases: string[];
  description: string;
  ruleIds: string[];
}

/** Regex → clauseType fallback when LLM extraction misses a type. */
export interface SkillClauseHeuristic {
  clauseType: string;
  /** Regex source strings; compiled by the generic extract handler. */
  patterns: string[];
  priority?: number;
}

/** Doc-type detection patterns for the generic classify handler. */
export interface DocTypeClassifier {
  docTypeId: string;
  patterns: string[];
  priority: number;
}

export interface ComparativeCheckConfig {
  checkId: string;
  clauseTypesToCompare: string[];
  guidance: string;
}

export interface MatrixApplicabilityGate {
  /** Must match `doc.fullText` or the row is treated as not applicable. */
  contextRegex: string;
  absentClaim: string;
  absentGap: string;
  absentSeverity?: "low" | "medium" | "high";
  /** Extra judge instruction appended when this gate is authored. */
  llmGuidance?: string;
}

export interface RightsMatrixRow {
  rowId: string;
  article: string;
  label: string;
  /** Authored finding category — runtime must not infer it from the row id. */
  findingCategory: string;
  preferredClauseTypes?: string[];
  applicabilityGate?: MatrixApplicabilityGate;
  /** Shown in the judge prompt (e.g. regime short name). */
  regimeLabel?: string;
  /** Plain-English summary for brief/memo renderers. */
  plainDescription?: string;
  /** Skill used to load `matrix:{rowId}` SKILL.md sections. */
  skillId?: string;
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
  /** When instruction focus includes any of these matrix row ids, treat as a primary hit. */
  matrixLinkageIds?: string[];
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
  /**
   * Optional retrieval dictionary used by the ACT evidence locator.
   * Headings / aliases / anchor terms let extraction find candidate sections
   * without sending the whole document to an LLM.
   */
  clauseRetrieval?: Record<string, ClauseRetrievalDict>;
  /** Fallback regex → clauseType map for heuristic extraction. */
  clauseHeuristics?: SkillClauseHeuristic[];
  /** Doc-type regex classifiers (doc-type axis skills; multiple allowed on one skill). */
  docTypeClassifiers?: DocTypeClassifier[];
  /** Renderer defaults for rights-matrix memo output. */
  rendererDefaults?: {
    rightsReviewSubtitle?: string;
  };
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
   * Authored analysis packages (evaluation, inventory, …). Evaluation packages
   * group related capability ids for one grouped LLM call. Inventory packages
   * declare `kind: "inventory"` and may omit capabilityIds. Capability ids on
   * evaluation packages must resolve to an authored rule/matrix-row/risk id on
   * some registered skill (enforced by parity lint).
   */
  evidencePackages?: EvidencePackage[];
  /**
   * Named shortcuts to atomic `regimeRules[].ruleId` sets, used only by the
   * rule-first compliance resolver. A composition never owns hypotheses,
   * proof standards, evidence hints, applicability, or execution behaviour —
   * it is purely an alias for a group of rule ids, and PLAN may combine rules
   * across compositions freely.
   */
  compositions?: ComplianceComposition[];
  /**
   * Maps classifier/PLAN requirement ids or types onto authored capabilities
   * (matrix rows, rules, or risk categories) without hardcoding regime tables
   * in the graph resolver.
   */
  metaRequirementBindings?: MetaRequirementBinding[];
  /**
   * Per-topic requirements this skill exposes when the user asks a broad
   * document review (no explicit focus/requirements). Injected into
   * intent.requirements at PLAN time and answered by the skill's
   * structural_review evidencePackage.
   */
  authoredRequirements?: IntentRequirement[];
  /**
   * S2 proposition-generation patterns (PLAN's generate-propositions.ts).
   * Generated only when the document's own inventory shows a matching
   * clause type — never for a clause type absent from the document.
   */
  propositionPatterns?: PropositionPattern[];
}

/**
 * One S2 (doc-type/topic skill) proposition pattern. `hypothesis` and
 * `proofStandard` may contain the literal token `{{party}}`, substituted at
 * generation time with the resolved party perspective (§5.2) so the standard
 * reads "adequate for the customer", not a generic "adequate".
 */
export interface PropositionPattern {
  id: string;
  /** Inventory clause type(s) that must be present for this pattern to fire. */
  clauseTypes: string[];
  hypothesis: string;
  /** Written the way you'd brief a first-year associate — specific and checkable. */
  proofStandard: string;
  /** Higher = investigated first / kept under Lite-mode trimming. */
  priority: number;
}

export interface MetaRequirementBinding {
  match: {
    idIncludes?: string[];
    types?: IntentRequirementType[];
  };
  capabilityIds: string[];
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
