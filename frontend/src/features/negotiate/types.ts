/**
 * Assembled negotiation context for a selected clause.
 * All fields except clauseId/original are optional — missing sources must
 * never break the flow.
 */
export interface NegotiationContext {
  clauseId: string;
  original: string;
  /** ±500 chars of document text surrounding the clause */
  surroundingContext: string;
  /** User's free-text negotiation instruction (empty string when not provided) */
  userInstruction: string;
  /** Matching analysis finding, if a prior analysis job exists for this document */
  analysisFinding?: {
    severity: string;
    issue: string;
    recommendation: string;
    fallbackPosition?: string;
  };
  /** Matching compare finding, if a prior compare job references this clause */
  compareFinding?: {
    classification: string;
    semanticSummary: string;
    riskRationale: string;
  };
  /** Matching playbook rule, if one exists for this clause type */
  playbookRule?: {
    topic: string;
    standardPosition: string;
    fallbackPositions: string[];
    walkAwayCondition: string;
  };
  /** Prior human redlines on this exact clause text, if any */
  priorRedlines?: Array<{
    proposedText: string;
    comment: string;
    status: string;
  }>;
}

/**
 * A single negotiation position within the concession ladder.
 */
export interface StrategyPosition {
  /** The position statement — NOT full legal clause language */
  position: string;
  /** "playbook" when backed by a company playbook rule; "ai" when AI-suggested */
  source: "playbook" | "ai";
  rationale: string;
}

/**
 * Structured negotiation strategy produced by Phase 3.
 * Preferred → Balanced → Fallback form a logical concession ladder.
 */
/**
 * Structured result returned when drafting from a strategy position (Phase 4).
 */
export interface StrategyDraftResult {
  /** The drafted legal revision */
  result: string;
  draftMeta: {
    tier: "preferred" | "balanced" | "fallback";
    position: string;
    source: "playbook" | "ai";
    rationale: string;
    confidence?: number;
  };
}

export interface NegotiationStrategy {
  clauseId: string;
  preferred: StrategyPosition;
  balanced: StrategyPosition;
  fallback: StrategyPosition;
  /** Short overall rationale for the strategy */
  strategyRationale: string;
  /** 0–1 confidence score */
  confidence: number;
  /** "playbook" if a company playbook was the primary basis; "ai" otherwise */
  basisSource: "playbook" | "ai";
}

export interface AgentMarkup {
  clauseId: string;
  original: string;
  replacement: string;
  reasoning: string;
  riskLevel: "RED" | "YELLOW" | "GREEN";
  /**
   * Zero-based character offset of `original` in the plain document text.
   * Populated by the backend evaluate endpoint (Phase 1).
   * Used by the highlight renderer as a reliable fallback when regex matching
   * fails due to Markdown→HTML transformation altering whitespace.
   */
  charOffset?: number;
  /**
   * Normalised clause category from the contract taxonomy
   * (e.g. "indemnity", "limitation_of_liability", "governing_law").
   * Populated by the backend evaluate endpoint (Phase 1).
   */
  clauseType?: string;
  /**
   * Topic of the playbook rule that grounded this finding, or null when the
   * finding came from generic legal-risk analysis only. Present on the wire
   * since Phase 1 but not previously typed here.
   */
  matchedPlaybookTopic?: string | null;
}

// ─── Phase 2: Negotiation session persistence ────────────────────────────────

export type FindingStatus = "pending" | "accepted" | "rejected";

/** A finding as returned by the backend session model — a superset of
 *  AgentMarkup that also carries durable status and cached per-clause
 *  context/strategy/draft state. */
export interface NegotiationFindingDTO {
  id: string;
  sessionId: string;
  clauseId: string;
  orderIndex: number;
  original: string;
  replacement: string;
  reasoning: string;
  riskLevel: "RED" | "YELLOW" | "GREEN";
  clauseType: string;
  charOffset: number | null;
  matchedPlaybookTopic: string | null;
  status: FindingStatus;
  contextJson: NegotiationContext | null;
  strategyJson: NegotiationStrategy | null;
  selectedTier: "preferred" | "balanced" | "fallback" | null;
  draftResultJson: StrategyDraftResult | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NegotiationSessionDTO {
  id: string;
  userId: string;
  documentId: string;
  documentVersionId: string | null;
  documentVersionCount: number;
  playbookId: string | null;
  status: "active" | "superseded";
  createdAt: string;
  updatedAt: string;
}

export interface SessionResolveResponse {
  session: NegotiationSessionDTO;
  findings: NegotiationFindingDTO[];
  resumed: boolean;
  stale?: boolean;
  racedExisting?: boolean;
}
