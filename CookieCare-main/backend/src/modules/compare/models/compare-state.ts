/**
 * CompareState — the central mutable context object that flows through every
 * stage of the comparison pipeline.
 *
 * Design rules:
 * - Each pipeline step receives a CompareState and returns an enriched
 *   CompareState. Steps never mutate; they spread and extend.
 * - Fields added in later phases (alignment, diff, risk, summary) are typed as
 *   optional so Phase 1 state literals remain valid without modification.
 * - Mirrors the DraftState pattern from src/modules/drafting/models/draft-state.ts
 */

// ─── Document metadata ────────────────────────────────────────────────────────

export interface DocumentMeta {
  /** Original uploaded filename */
  fileName: string;
  mimeType: string;
  /** Approximate word count derived from extracted text */
  wordCount: number;
  /** Character count of the clean extracted text */
  charCount: number;
  /** Detected natural language, e.g. "en" */
  detectedLanguage: string;
}

// ─── Clause — the unit of structure produced by Stage 2 ──────────────────────

export interface ExtractedClause {
  /** Stable identifier: "doc-{a|b}-clause-{index}" */
  id: string;
  /**
   * Human-readable clause title.
   * Sourced from the heading text when available; falls back to a positional
   * label such as "Clause 3" when no heading can be detected.
   */
  title: string;
  /** Full text of the clause body, whitespace-normalised */
  text: string;
  /** Zero-based character offset of the clause start in the extracted text */
  position: number;
  /**
   * Ordered list of ancestor heading labels that lead to this clause.
   * Example: ["3", "3.2", "3.2.1"] — empty for top-level unnumbered clauses.
   * Used by Phase 2 (ClauseAlignment) to prefer structurally adjacent matches.
   */
  sectionPath: string[];
}

// ─── Phase 2: Clause Alignment ───────────────────────────────────────────────

export type AlignmentType = "exact" | "semantic" | "unmatched";
export type AlignmentStatus = "matched" | "added" | "removed" | "restructured";

export interface AlignedPair {
  /** Stable pair identifier: "pair-{index}" */
  id: string;
  /** ID of the clause from Agreement A; null when status is "added" */
  clauseAId: string | null;
  /** ID of the clause from Agreement B; null when status is "removed" */
  clauseBId: string | null;
  /**
   * How the match was produced:
   * - "exact"     — deterministic match (same heading/number/text); no LLM used
   * - "semantic"  — LLM matched two differently-titled clauses as equivalent
   * - "unmatched" — no counterpart found in the other document
   */
  alignmentType: AlignmentType;
  /** Confidence score 0.0–1.0 */
  matchConfidence: number;
  /**
   * Human-readable explanation of why this pairing was made (or why the
   * clause is unmatched).  Always populated — never an empty string.
   */
  alignmentReason: string;
  /** Overall alignment disposition */
  status: AlignmentStatus;
}

// ─── Phase 3: Difference Detection ──────────────────────────────────────────

/**
 * Semantic classification of how a clause changed between the two agreements.
 *
 * Deliberately free of legal-risk language — that belongs to Phase 4.
 * Each value describes the *semantic shape* of the change only.
 */
export type DiffClassification =
  | "UNCHANGED"          // Clause text is identical or trivially rephrased
  | "ADDED"              // Clause exists only in Agreement B (no counterpart in A)
  | "REMOVED"            // Clause exists only in Agreement A (no counterpart in B)
  | "MODIFIED_BROADER"   // Obligation or scope was expanded in B relative to A
  | "MODIFIED_NARROWER"  // Obligation or scope was narrowed in B relative to A
  | "NEUTRAL_REPHRASE";  // Wording changed but meaning is substantively the same

export interface ClauseDifference {
  /** References the AlignedPair.id that produced this pair */
  pairId: string;
  clauseAId: string | null;
  clauseBId: string | null;
  classification: DiffClassification;
  /**
   * One-to-three sentence factual description of what changed.
   * No risk language. No legal opinion. Only semantic observation.
   * Empty string when classification is UNCHANGED, ADDED, or REMOVED.
   */
  semanticSummary: string;
  /** Confidence in the classification — 0.0 to 1.0 */
  confidence: number;
  /**
   * How the classification was produced:
   * - "identical"   — exact text match, no LLM used
   * - "similarity"  — character similarity check, no LLM used
   * - "llm"         — Gemini semantic reasoning
   * - "fallback"    — LLM failed; deterministic fallback applied
   */
  detectionMethod: "identical" | "similarity" | "llm" | "fallback";
}

// ─── Phase 4: Risk Analysis ───────────────────────────────────────────────────

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

/**
 * Legal/commercial risk category.
 * Designed as a union so future domain-specific agents each own one value.
 * Phase 4 MVP: a single agent covers all categories.
 */
export type RiskCategory =
  | "liability"
  | "indemnity"
  | "ip"
  | "termination"
  | "data_protection"
  | "payment"
  | "confidentiality"
  | "governing_law"
  | "audit_rights"
  | "other";

export interface RiskFinding {
  /** Stable identifier: "risk-{index}" */
  id: string;
  /** References the AlignedPair.id (and thus the ClauseDifference.pairId) */
  pairId: string;
  level: RiskLevel;
  category: RiskCategory;
  /**
   * Concise explanation of the commercial and legal exposure.
   * Written for a business audience — no legal jargon without explanation.
   */
  rationale: string;
  /** Confidence in the risk classification — 0.0 to 1.0 */
  confidence: number;
  /**
   * Populated only when a deterministic rule triggered the finding.
   * Undefined for LLM-produced findings.
   */
  triggeredRule?: string;
  /** How the finding was produced */
  source: "deterministic" | "llm";
}

// ─── CompareState ─────────────────────────────────────────────────────────────

export interface CompareState {
  /**
   * Optional progress callback — injected by the job handler so each pipeline
   * step can broadcast live status without importing the job queue directly.
   * Mirrors the onProgress pattern in DraftState.
   */
  onProgress?: (percent: number, message: string) => Promise<void>;

  // ── Phase 1: upload inputs ────────────────────────────────────────────────

  /** Raw file buffers held only during pipeline execution; never persisted. */
  files: {
    original: {
      buffer: Buffer;
      mimeType: string;
      fileName: string;
    };
    revised: {
      buffer: Buffer;
      mimeType: string;
      fileName: string;
    };
  };

  // ── Phase 1: parse outputs ────────────────────────────────────────────────

  parsed: {
    textA: string;
    textB: string;
    metaA: DocumentMeta;
    metaB: DocumentMeta;
  } | null;

  // ── Phase 1: structure extraction outputs ─────────────────────────────────

  structure: {
    clausesA: ExtractedClause[];
    clausesB: ExtractedClause[];
  } | null;

  // ── Phase 2+: future stages (populated by later phases) ───────────────────

  alignment?: AlignedPair[];
  differences?: ClauseDifference[];
  risks?: RiskFinding[];
  /**
   * Structured executive summary produced by Phase 5.
   * Typed as the ExecutiveSummary interface rather than a raw string so that
   * downstream consumers (job handler, future report assembler) can access
   * individual fields without re-parsing.
   *
   * Imported lazily to avoid circular reference — type-only import.
   */
  executiveSummary?: import("../schemas/executive-summary-schema.js").ExecutiveSummary;

  // ── Pipeline metadata ─────────────────────────────────────────────────────

  metadata: {
    timestamp: string;
    /** Accumulated step timings — mirrors DraftState.metadata.stepTimings */
    stepTimings?: Array<{ label: string; ms: number }>;
    [key: string]: unknown;
  };
}
