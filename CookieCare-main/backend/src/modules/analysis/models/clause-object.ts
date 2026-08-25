import type { Locator } from "./locator.js";

/**
 * How extraction located this span. Distinct from the grouped-evaluation
 * verdict (`covered` / `missing`): extraction produces evidence, not conclusions.
 */
export type EvidenceStatus =
  | "found"
  | "multiple_candidates"
  | "referenced_elsewhere"
  | "not_found"
  | "insufficient_evidence";

export interface ClauseObject {
  clauseId: string;
  /** Must be a member of the versioned clause taxonomy. */
  clauseType: string;
  locator: Locator;
  text: string;
  extractedEntities?: Record<string, string>;
  taxonomyVersion: string;
  /** How the locator classified this span. Absent on legacy extracts. */
  evidenceStatus?: EvidenceStatus;
  /** Deterministic or fallback reason this span was selected. */
  matchReason?: string;
  /** Named annexes / schedules / SOWs when status is referenced_elsewhere. */
  referencedDocuments?: string[];
  /** True when `text` is a bounded prefix of the logical section. */
  truncated?: boolean;
  /** End offset of the complete logical section before any evidence cap. */
  logicalEndOffset?: number;
}
