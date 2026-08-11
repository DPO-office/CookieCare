/** Shared locator schema — do not fork from this shape when Drafting adopts it. */

export interface Locator {
  docId: string;
  /** e.g. "clause-12.3" or "schedule-2.table-1.row-4" */
  structuralPath: string;
  pageNumber?: number;
  /** Offsets into the deterministically segmented document text. */
  charRange: [number, number];
}

export interface EvidenceSpan {
  locator: Locator;
  /** Verbatim source text used for entailment verification. */
  quotedText: string;
}
