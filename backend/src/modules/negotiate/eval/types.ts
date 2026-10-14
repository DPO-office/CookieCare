/**
 * Negotiate Evaluation — Stage 0 benchmark types.
 * Measurement infrastructure only. No evaluator behavior.
 */

export type GoldKind = "issue" | "absence" | "trap";

/**
 * Importance semantics depend on `kind`:
 *  - issue/absence : must_catch | should_catch | nice  (v2 SHOULD surface it)
 *  - trap          : must_not_flag | should_not_flag   (v2 should NOT surface it)
 *  - severity_check: a present clause whose expected severity BAND is asserted
 *                    (used to detect over/under-classification like free-plan
 *                    deletion rated RED when it should be YELLOW).
 */
export type GoldImportance =
  | "must_catch"
  | "should_catch"
  | "nice"
  | "must_not_flag"
  | "should_not_flag"
  | "severity_check";

export type SeverityBand = "RED" | "YELLOW" | "GREEN" | "NONE";

export interface GoldAnchor {
  /** Human-readable section/heading path, e.g. "§7.4" or "Appendix 2 / Data Breach Response". */
  headingPath: string;
  /** Optional verbatim snippet from the document used for text-tolerant matching. */
  quote?: string;
}

export interface GoldFinding {
  id: string;
  docId: string;
  kind: GoldKind;
  anchor: GoldAnchor;
  /** Canonical, controlled-vocabulary issue identifier. */
  issueTag: string;
  /** Optional rubric rule id this maps to (v2 concept; informational at Stage 0). */
  ruleId?: string;
  expectedSeverityBand: SeverityBand;
  importance: GoldImportance;
  /**
   * Same issue expressed in MULTIPLE locations — v2 MUST collapse them to
   * exactly ONE finding (dedup metric).
   */
  dupGroup?: string;
  /**
   * DISTINCT but related gold findings on the SAME clause that a single
   * correctly-merged finding may satisfy together (e.g. a2 "objection has no
   * teeth" + g3 "5-day window" both live at §7.4). Scoring rewards one finding
   * covering all members of a mergeGroup; it does NOT require separate findings.
   */
  mergeGroup?: string;
  /**
   * issueTag proxy for matching against a free-text v1 finding: at least
   * `keywordMinHits` of these (normalized substring) must appear in the v1
   * finding's original+reasoning for the issue to be considered the same.
   */
  matchKeywords: string[];
  /** Minimum matchKeywords that must be present (default 1). */
  keywordMinHits?: number;
  notes: string;
}

export type GoldDocStatus = "available" | "pending";

export interface GoldDocMeta {
  docFixtureId: string; // e.g. "G-DPA-01"
  title: string;
  status: GoldDocStatus;
  /** DB document id for an available real doc (overridable via env). Null for pending/synthetic. */
  dbDocId: string | null;
  dbDocIdEnv?: string; // env var that overrides dbDocId
  /** For a controlled/synthetic fixture: the document text is read from this
   *  file (relative to the gold dir) instead of the database. */
  inlineTextFile?: string;
  /** True for a hand-authored controlled fixture (content + labels consistent by construction). */
  synthetic?: boolean;
  purpose: string;
  goldFile?: string; // relative path to the labels file when available
}

export interface GoldManifest {
  goldVersion: string;
  createdUtc: string;
  documents: GoldDocMeta[];
}

/**
 * Normalized shape the harness maps `evaluateFullDocument` output into.
 * v1 has no clauseRef/issueTag/tier concept — those fields are intentionally
 * absent so the baseline reflects exactly what v1 emits.
 */
export interface V1Finding {
  clauseId: string;
  original: string;
  reasoning: string;
  replacement: string;
  riskLevel: SeverityBand; // v1 emits RED|YELLOW|GREEN
  clauseType: string;
  charOffset: number;
  /**
   * Optional: set true by V2 evaluators that explicitly model an ABSENCE finding
   * (V1 never sets it). When true, an absence gold is satisfied without needing
   * the reasoning text to contain an absence-assertion phrase.
   */
  isAbsence?: boolean;
}

export interface GoldMatch {
  goldId: string;
  caught: boolean;
  matchedFindingClauseIds: string[];
  reason: string;
}
