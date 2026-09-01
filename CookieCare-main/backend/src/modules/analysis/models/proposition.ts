/**
 * A Proposition is anything ACT can investigate: a thing to establish with an
 * explicit proof standard, regardless of where it came from. "Requirement" is
 * the historical name for one kind of proposition (source S1); PLAN's job is
 * to pick source(s) per ask and, for S4/S5, author the proposition itself.
 *
 * Sources:
 *   S1  — regime skill (authored compliance requirement)
 *   S2  — doc-type/topic skill (risk/structural pattern)
 *   S3  — uploaded reference document (e.g. a playbook)
 *   S4  — PLAN-authored ad hoc (novel question no skill covers)
 *   S5a — external primary source text (fetched, quotable)
 *   S5b — external interpretive/market knowledge (lower confidence)
 */
export type PropositionSource = "S1" | "S2" | "S3" | "S4" | "S5a" | "S5b";

export interface Proposition {
  /** What ACT is being asked to establish. */
  hypothesis: string;
  /** Written the way you'd brief a first-year associate — specific and checkable. */
  proofStandard: string;
  source: PropositionSource;
  /** Higher = investigated first / kept under Lite-mode trimming. */
  priority: number;
  /** Threaded into proofStandard content, not left unread (Gap 1). */
  partyPerspective?: string;
  /** Links sub-propositions that ACT must later pair for COMPARE (Phase 8). */
  compareGroup?: string;
  /** Which side of the comparison this sub-proposition represents. */
  compareRole?: string;
  /** Groups related propositions for compounding-risk check (Phase 12/SYNTHESIZE). */
  clusterId?: string;
}
