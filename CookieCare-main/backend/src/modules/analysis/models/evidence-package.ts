import type { EvidenceStatus } from "./clause-object.js";
import type { IntentRequirementType } from "./intent.js";

/**
 * AnalysisPackage (exported as EvidencePackage for skill-config compatibility) —
 * an authored, versioned unit of analysis work. Evaluation packages group related
 * regime capabilities for one grouped LLM call. Inventory / comparison / matrix
 * packages declare a different `kind` and are executed by the same ACT runtime.
 *
 * Packages are authored in `skill.config.ts` and are NEVER assembled at runtime
 * from semantic similarity. Runtime-specific sources (playbook comparison,
 * web-derived) use a non-authored `sourceMode` but the same contract.
 */
export type EvidencePackageSourceMode =
  | "authored"
  | "playbook_runtime"
  | "web_runtime";

export type AnalysisPackageKind =
  | "inventory"
  | "evidence_extraction"
  | "evaluation"
  | "comparison"
  | "matrix"
  | "risk"
  | "synthesis";

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
  evidenceStatus?: EvidenceStatus;
  matchReason?: string;
  referencedDocuments?: string[];
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
   * `riskCategories[].category` on an active skill (enforced by parity lint).
   * Inventory packages may leave this empty.
   */
  capabilityIds: string[];
  /** Clause types the shared-evidence / inventory pass should retrieve. */
  clauseTypes: string[];
  /** Named evidence targets the grouped evaluation expects to reason over. */
  extractionTargets: string[];
  /** Provenance of the package definition — controls tier separation. */
  sourceMode: EvidencePackageSourceMode;
  /** Optional authored version for audit reproducibility. */
  packageVersion?: string;
  /**
   * Execution kind. Defaults to "evaluation" when omitted so existing GDPR/CCPA
   * packages keep their current grouped-eval behavior.
   */
  kind?: AnalysisPackageKind;
  label?: string;
  description?: string;
  /** PLAN IntentRequirementType values this package can satisfy. */
  requirementKinds?: IntentRequirementType[];
  /**
   * Semantic topics this package covers (e.g. scc, bcr, schrems). Used by
   * resolvePackages to match PLAN requirement ids/descriptions without a
   * growing alias table.
   */
  semanticTopics?: string[];
  /** Package ids that must run first; the graph wires dependsOn from these. */
  requiresPackages?: string[];
  optionalPackages?: string[];
  /** Artifact type written to AnalysisState.analysisArtifacts. */
  outputArtifactType?: string;
  /** Domain data (record schema, mechanism aliases) — never executable functions. */
  config?: Record<string, unknown>;
}

/** Canonical name for the kinded package contract. */
export type AnalysisPackage = EvidencePackage;

export function analysisPackageKind(pkg: EvidencePackage): AnalysisPackageKind {
  return pkg.kind ?? "evaluation";
}

/**
 * Structured package output. Findings remain the source of truth for legal
 * verdicts; artifacts carry inventory / comparison records between work units.
 */
export interface AnalysisArtifact<T = unknown> {
  id: string;
  type: string;
  packageId: string;
  version?: string;
  requirementIds?: string[];
  sourceFindingIds?: string[];
  data: T;
  provenance?: {
    documentIds?: string[];
    sourceTier?: "authored" | "playbook" | "web";
  };
}
