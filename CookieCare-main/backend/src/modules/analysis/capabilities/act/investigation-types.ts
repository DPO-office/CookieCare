/**
 * Generic LLM-assisted evidence investigation — shared types.
 *
 * These types are regime-agnostic by construction: nothing here mentions
 * GDPR, Article 28, or any specific legal citation. A `ComplianceRequirement`
 * is built once (see `investigation-requirements.ts`) from WHATEVER a skill
 * config authors — hand-authored `RequirementElementSchema` rows (Article 28
 * today) or a plain `RequirementEvidenceProfile` (hypothesis/proofStandard/
 * evidenceHints, which international-transfers, NDA, and any future skill
 * already author). The investigation pipeline never branches on regime.
 */

export interface ComplianceRequirementElement {
  elementId: string;
  proposition: string;
  /** Optional scope hint — e.g. "controller_to_processor" — advisory only. */
  scope?: string;
}

export interface ComplianceRequirement {
  requirementId: string;
  /** Version of the schema/profile this requirement was derived from — for
   * cache keys and traceability, never for behaviour branching. */
  requirementVersion: string;
  title: string;
  legalCitation?: string;
  legalText: string;
  explanation?: string;
  elements: ComplianceRequirementElement[];
  aggregationRule: string;
  /**
   * Optional retrieval hints (e.g. authored `evidenceHints`). These MAY widen
   * the search plan but must NEVER gate evidence inclusion — enforced by
   * construction: nothing downstream treats this field as a required-match
   * list. Kept only so the LLM planner has a head start.
   */
  retrievalHints?: string[];
  /** Which skill/package authored this requirement, for log traceability. */
  sourceSkillId?: string;
  sourcePackageId?: string;
}

export interface DocumentMetadata {
  documentId: string;
  documentType?: string;
  sectionHeadings: string[];
  definedTerms: string[];
  availableSchedules: string[];
  availableAppendices: string[];
}

export interface ElementSearchPlan {
  elementId: string;
  lexicalQueries: string[];
  semanticQueries: string[];
  likelyHeadings: string[];
  likelyDefinedTerms: string[];
  conceptsToFind: string[];
  exclusionsOrDistinctions: string[];
  exceptionQueries: string[];
  contradictionQueries: string[];
}

export interface InvestigationSearchPlan {
  requirementId: string;
  elementPlans: ElementSearchPlan[];
}

export type RetrievalMethod =
  | "lexical"
  | "semantic"
  | "heading"
  | "defined_term"
  | "cross_reference"
  | "table_schedule";

export interface EvidenceCandidateScope {
  relationship?: string;
  partyRoles?: string[];
  dataType?: string;
  timePeriod?: string;
  condition?: string;
}

export interface EvidenceCandidate {
  evidenceSpanId: string;
  documentId: string;
  locator: string;
  rawText: string;
  normalizedText: string;
  nodeType: string;
  parentId?: string;
  childIds?: string[];
  sectionPath?: string[];
  retrievalMethods: RetrievalMethod[];
  matchedQueries: string[];
  scope?: EvidenceCandidateScope;
  charRange?: [number, number];
}

export interface CandidateReviewSelection {
  evidenceSpanId: string;
  contributesToElementIds: string[];
  reasonIncluded: string;
  scopeAssessment: string;
}

export interface CandidateReviewRejection {
  evidenceSpanId: string;
  reasonRejected: string;
}

export interface CandidateReviewFollowUp {
  elementId: string;
  reason: string;
  followUpQueries: {
    lexicalQueries: string[];
    semanticQueries: string[];
    likelyHeadings: string[];
    definitionsOrReferencesToResolve: string[];
  };
}

export interface CandidateReview {
  requirementId: string;
  selectedCandidates: CandidateReviewSelection[];
  rejectedCandidates: CandidateReviewRejection[];
  unresolvedElements: CandidateReviewFollowUp[];
}

export interface BundlePassage {
  evidenceId: string;
  documentId: string;
  locator: string;
  rawText: string;
  normalizedText: string;
  reasonIncluded: string[];
  contributesToElementIds: string[];
  scope?: EvidenceCandidateScope;
}

export interface BundleDefinitionRef {
  term: string;
  evidenceId: string;
}

export interface BundleResolvedReference {
  sourceEvidenceId: string;
  targetEvidenceIds: string[];
}

export interface BundleUnresolvedReference {
  name: string;
  reason: string;
}

export interface RequirementEvidenceBundle {
  requirementId: string;
  elements: ComplianceRequirementElement[];
  passages: BundlePassage[];
  definitions: BundleDefinitionRef[];
  resolvedReferences: BundleResolvedReference[];
  unresolvedReferences: BundleUnresolvedReference[];
  investigationComplete: boolean;
  incompleteReasons: string[];
}

export interface InvestigationBudget {
  maxPlanningCalls: number;
  maxCandidateReviewCalls: number;
  maxFollowUpRounds: number;
  maxRepairCalls: number;
  /** Wall-clock ceiling for the WHOLE investigation stage, in ms. */
  totalBudgetMs: number;
}

export const DEFAULT_INVESTIGATION_BUDGET: InvestigationBudget = {
  maxPlanningCalls: 1,
  maxCandidateReviewCalls: 1,
  maxFollowUpRounds: 1,
  maxRepairCalls: 1,
  totalBudgetMs: Number(process.env.ANALYSIS_INVESTIGATION_BUDGET_MS || 40_000),
};

export function llmAssistedInvestigationEnabled(): boolean {
  const raw = process.env.LLM_ASSISTED_INVESTIGATION;
  if (raw === undefined || raw === "") return false;
  return raw === "1" || raw.toLowerCase() === "true";
}

/** Separate from the enable flag — governs whether the new bundle actually
 * feeds Phase 4, or only runs side-by-side for comparison logging. */
export function llmAssistedInvestigationCanonicalEnabled(): boolean {
  const raw = process.env.LLM_ASSISTED_INVESTIGATION_CANONICAL;
  if (raw === undefined || raw === "") return false;
  return raw === "1" || raw.toLowerCase() === "true";
}
