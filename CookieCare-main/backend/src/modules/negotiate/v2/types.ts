/**
 * Negotiate V2 (shadow) — shared types.
 *
 * V2 is a self-contained, shadow-only evaluator. It never mutates V1 state and
 * its output is mapped into the existing NegotiateMarkup shape for comparison
 * (see adapt.ts). Nothing here is user-visible yet.
 */

export type SeverityBand = "RED" | "YELLOW" | "GREEN";
export type Negotiability = "high" | "medium" | "low";
export type FindingTier = "primary" | "minor";
export type ConfidenceBand = "strong" | "moderate" | "tentative";
export type StructuralVerdict = "present_adequate" | "present_inadequate" | "absent";

export const SEGMENTER_VERSION = "seg-1.0.0";
export const V2_PIPELINE_VERSION = "v2-shadow-0.1.0";

export interface ClauseSegment {
  clauseRef: string;      // stable, content-anchored id (no LLM identity)
  headingPath: string;
  text: string;
  charStart: number;
  charEnd: number;
  ordinal: number;
}

export interface SegmentationResult {
  contentHash: string;
  segmenterVersion: string;
  segments: ClauseSegment[];
}

/** Structured severity inputs — the model fills these; the critic confirms them; code maps them to L. */
export interface SeverityFactors {
  regulatoryMandatedTerm: boolean;
  uncappedOrBroadExposure: boolean;
  unilateralOrOneSidedRight: boolean;
  internationalTransferRisk: boolean;
  specialCategoryData: boolean;
  absenceOfRequiredTerm: boolean;
  irreversibleOrHardToRemedy: boolean;
  marketStandardLanguage: boolean;
  outOfScopeForDocType: boolean;
  purelyCosmetic: boolean;
}

export function emptyFactors(): SeverityFactors {
  return {
    regulatoryMandatedTerm: false, uncappedOrBroadExposure: false, unilateralOrOneSidedRight: false,
    internationalTransferRisk: false, specialCategoryData: false, absenceOfRequiredTerm: false,
    irreversibleOrHardToRemedy: false, marketStandardLanguage: false, outOfScopeForDocType: false,
    purelyCosmetic: false,
  };
}

export interface EvidenceSpan {
  clauseRef: string;
  quote: string;      // verbatim from the document
  charOffset: number; // -1 when not locatable
}

/** A candidate emitted by the structural or spotting pass, pre-merge/critic. */
export interface Candidate {
  source: "structural" | "spotting";
  issueTag: string;
  ruleId?: string;             // rubric rule id when known
  topic?: string;              // normalized clause topic (structural) for cross-location merge
  isAbsence: boolean;
  clauseRefs: string[];        // clause(s) this candidate anchors to
  evidence: EvidenceSpan[];    // >=1 for present issues; may be [] for absence
  reasoning: string;
  factors: SeverityFactors;
  // spotting self-consistency bookkeeping
  votes?: number;
  ofRuns?: number;
  provisional?: boolean;       // retained on a single vote (must-catch / high-severity)
  mustCatchRule?: boolean;
}

/** Result of the critic gate for one candidate. */
export interface CriticVerdict {
  verdict: "keep" | "minor" | "drop";
  marketStandard: boolean;
  inScope: boolean;
  negotiable: boolean;
  canonicalRuleId?: string;
  factors?: Partial<SeverityFactors>;
  reason: string;
}

export interface V2Finding {
  clauseRef: string;
  ruleId?: string;
  issueTag: string;
  isAbsence: boolean;
  riskLevel: SeverityBand;          // L (legal/privacy severity) — deterministic
  negotiability: Negotiability;     // N — separate axis
  priorityScore: number;            // P — 0..100, ranking
  tier: FindingTier;
  confidence: ConfidenceBand;       // qualitative — NOT a probability
  confidenceSignals: string[];
  factors: SeverityFactors;
  reasoning: string;
  replacement: string;              // drafted for primary findings; "" otherwise
  original: string;                 // evidence quote for issues; "" for absence
  charOffset: number;
  evidence: EvidenceSpan[];
  duplicateOfRefs: string[];
  verified: boolean;                // critic-confirmed
  clauseType: string;
}

export type EvaluationMode =
  | "full"
  | "degraded_no_critic"
  | "degraded_no_embedding"
  | "degraded_generic_rubric"
  | "degraded_uncertain_doctype"
  | "failed_fallback_v1";

export interface V2Result {
  pipelineVersion: string;
  segmenterVersion: string;
  contentHash: string;
  docType: string;
  docTypeConfident: boolean;
  evaluationMode: EvaluationMode;
  warnings: string[];
  findings: V2Finding[];
  stageTimingsMs: Record<string, number>;
  llmCalls: number;
  embedCalls: number;
}
