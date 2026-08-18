/**
 * EvidencePackage — an authored, versioned grouping of related regime
 * capabilities (rule / matrix-row / risk-category ids) that ACT evaluates
 * together in a single grouped LLM call.
 *
 * Packages are authored in `skill.config.ts` beside `regimeRules` and are
 * NEVER assembled at runtime from semantic similarity. Runtime-specific
 * sources (playbook comparison, web-derived) are represented with a non-authored
 * `sourceMode` and built from live inputs, but still flow through the same
 * package contract so ACT has one execution shape.
 */
export type EvidencePackageSourceMode =
  | "authored"
  | "playbook_runtime"
  | "web_runtime";

/**
 * One piece of shared evidence extracted for a package. Reuses the existing
 * clause/locator model (no parallel evidence store) so the same span can be
 * referenced by multiple requirement evaluations.
 */
export interface SharedEvidenceItem {
  /** Stable reference key used by the grouped evaluation (e.g. "E1"). */
  ref: string;
  clauseType: string;
  quotedText: string;
  structuralPath: string;
  charRange: [number, number];
}

export interface SharedEvidenceBundle {
  packageId: string;
  docId: string;
  items: SharedEvidenceItem[];
}

export interface EvidencePackage {
  /** Stable package id, e.g. "gdpr.art28.particulars". */
  id: string;
  /** Semantic requirement ids this package can establish (PLAN vocabulary). */
  requirementIds: string[];
  /**
   * Authored capability ids grouped by this package. Each id must resolve to a
   * real `regimeRules[].ruleId`, `rightsMatrixRows[].rowId`, or
   * `riskCategories[].category` in an active skill (enforced by parity lint).
   */
  capabilityIds: string[];
  /** Clause types the shared-evidence pass should extract for this package. */
  clauseTypes: string[];
  /** Named evidence targets the grouped evaluation expects to reason over. */
  extractionTargets: string[];
  /** Provenance of the package definition — controls tier separation. */
  sourceMode: EvidencePackageSourceMode;
  /** Optional authored version for audit reproducibility. */
  packageVersion?: string;
}
