import type { EvidenceStatus } from "./clause-object.js";
import type {
  IntentRequirementType,
  ReportDepth,
  ReportSectionId,
  ReportType,
} from "./intent.js";

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
  /** True when quotedText is a bounded prefix of the logical section. */
  truncated?: boolean;
  /** End offset of the complete logical section before any evidence cap. */
  logicalEndOffset?: number;
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
   * PLAN ids that should select this package without being evaluated as extra
   * rows (legacy lumped ids that expand to `requirementIds`).
   */
  requirementAliases?: string[];
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
  /**
   * Per-requirement hypothesis and evidence hints for isolated evaluation.
   * Authored on the skill package; generic handlers never hard-code ids.
   */
  requirementEvidence?: Record<
    string,
    { hypothesis?: string; evidenceHints?: string[] }
  >;
  /**
   * Optional requirementId → capabilityIds map. When omitted and both arrays
   * are the same length, requirementIds are zipped to capabilityIds.
   */
  requirementBindings?: Record<string, string[]>;
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
  /**
   * Domain data (record schema, mechanism aliases, artifactShape) — never
   * executable functions. Inventory packages with a non-default
   * `outputArtifactType` must declare `artifactShape`.
   */
  config?: Record<string, unknown> & {
    artifactShape?: InventoryArtifactShape;
    mechanismAliases?: Record<string, string>;
  };
  /** Authored report structure for renderer / synthesis (P8). */
  report?: PackageReportSpec;
  /**
   * Generic orchestration hints for PLAN/ACT. Regime-specific ids stay out of
   * graph handlers — skills author role / suppress / defer lists here.
   */
  orchestration?: PackageOrchestration;
}

export type PackageOrchestrationRole = "structural_review" | "matrix_owner" | "default";

export interface PackageOrchestration {
  role?: PackageOrchestrationRole;
  /** Skip this package when instruction focus has matrix rows and the ask is not structural. */
  suppressWhenMatrixFocus?: boolean;
  /**
   * Skip this structural package when another non-structural evaluation
   * package is already selected (avoids duplicate DPA+regime rows).
   */
  suppressWhenPeerEvaluation?: boolean;
  /** Non-matrix capability ids treated as leftover-covered when deferring to the matrix subgraph. */
  matrixDeferCapabilities?: string[];
}

export interface PackageOutlineExtra {
  heading: string;
  requirementTags?: string[];
  /** Closed registry id this extra renders as a top-level section. */
  sectionId?: ReportSectionId;
  /** Structured artifacts this extra should consume when present. */
  artifactTypes?: string[];
}

export interface PackageReportSpec {
  reportType?: ReportType;
  sections?: ReportSectionId[];
  sectionsByDepth?: Partial<Record<ReportDepth, ReportSectionId[]>>;
  outlineExtras?: PackageOutlineExtra[];
}

/**
 * How the generic inventory handler materializes `AnalysisArtifact.data`.
 * Adding a new inventory shape means authoring this config — not a new `if` in
 * the handler body.
 */
export interface InventoryFieldSpec {
  name: string;
  /** Key on the raw LLM/heuristic record. */
  source: string;
  /** When true, normalize string values via `mechanismAliases` on the shape. */
  normalizeAliases?: boolean;
  defaultValue?: unknown;
}

export interface InventoryDerivedAggregate {
  name: string;
  /** Field on each built record to collect. */
  from?: string;
  /** Multiple fields to collect (e.g. source + destination jurisdiction). */
  fromFields?: string[];
  unique?: boolean;
  exclude?: string[];
  /** When true, flatten array-valued fields across records. */
  flatMap?: boolean;
  /** Fixed value when no derivation is needed. */
  constant?: unknown;
}

export type InventoryArtifactShape =
  | {
      kind: "records";
      maxRecords?: number;
      emptyClaim?: string;
      presentClaim?: string;
    }
  | {
      kind: "typed_records";
      recordType: string;
      /** Key for the records array in artifact data (default `records`). */
      recordsKey?: string;
      maxRecords?: number;
      mechanismAliases?: Record<string, string>;
      fieldSpec?: InventoryFieldSpec[];
      derivedAggregates?: InventoryDerivedAggregate[];
      /** Aggregate name interpolated as `{mechanisms}` in presentClaim. */
      claimMechanismAggregate?: string;
      emptyClaim?: string;
      presentClaim?: string;
    };

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
