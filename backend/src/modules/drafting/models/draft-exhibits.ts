/**
 * First-class exhibit / schedule / annex specs for DPA drafting.
 * Distinct from section work units — these become Schedules A/B/C at assembly.
 */

export type ExhibitKind =
  | "schedule"
  | "annex"
  | "sccs"
  | "idta"
  | "baa"
  | "toms"
  | "generic";

export interface ExhibitSpec {
  /** Work unit id, e.g. exhibit-processing, exhibit-scc, exhibit-idta. */
  id: string;
  /** Assigned deterministically at assembly (A, B, C…). */
  letter?: string;
  title: string;
  kind: ExhibitKind;
  /** When true, insert bundled official body; LLM only fills header. */
  requiresFullText: boolean;
  /** When true, emit a reference clause only (no full annex body). */
  referenceOnly?: boolean;
  /** Parent section that cross-references this exhibit. */
  parentSectionId: string;
  /** Relative path under packs/exhibits/ for bundled full text. */
  sourceFile?: string;
  /** Inline body override (tests / runtime-loaded). */
  sourceText?: string;
}
