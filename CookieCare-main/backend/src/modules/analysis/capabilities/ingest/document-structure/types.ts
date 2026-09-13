export const DOCUMENT_GRAPH_SCHEMA_VERSION = "1.2.0";

export type StructureStatus = "queued" | "processing" | "ready" | "needs_review" | "failed";

export type StructuralNodeKind =
  | "document" | "title" | "part" | "article" | "section" | "clause" | "subclause"
  | "paragraph" | "list" | "list_item" | "definition" | "table" | "picture"
  | "appendix" | "schedule" | "annex" | "exhibit" | "signature" | "unknown";

export interface SourceBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  coordOrigin?: string;
}

export interface SourceProvenance {
  itemRef: string;
  page?: number;
  bbox?: SourceBox;
  charSpan?: [number, number];
}

export interface CanonicalTableCell {
  text: string;
  rowStart: number;
  rowEnd: number;
  columnStart: number;
  columnEnd: number;
  rowSpan: number;
  columnSpan: number;
  columnHeader: boolean;
  rowHeader: boolean;
}

export interface CanonicalTable {
  rows: number;
  columns: number;
  cells: CanonicalTableCell[];
}

export interface StructuralNode {
  nodeId: string;
  kind: StructuralNodeKind;
  parentId?: string;
  childIds: string[];
  order: number;
  namespace: string;
  ordinalPath: string;
  displayLabel?: string;
  numberingPath?: string[];
  title?: string;
  text: string;
  sourceRange: [number, number];
  sourceItemRefs: string[];
  provenance: SourceProvenance[];
  pageStart?: number;
  pageEnd?: number;
  confidence: number;
  signals: string[];
  definedTerm?: string;
  table?: CanonicalTable;
}

export interface StructuralEdge {
  edgeType: "parent_of" | "next_sibling";
  sourceNodeId: string;
  targetNodeId: string;
}

export type RelationSemanticEffect =
  | "refers_to" | "defined_by" | "details_provided_by" | "procedure_provided_by"
  | "implements" | "subject_to" | "exception_to" | "modifies" | "overrides"
  | "exception_provided_by" | "incorporates" | "applies_to" | "prevails_over"
  | "forms_part_of" | "scope_derived_from" | "limits" | "requires" | "supplements"
  | "external_reference" | "survives" | "unknown";

export type RelationResolutionStatus = "resolved" | "ambiguous" | "unresolved_internal" | "external";

export interface RelationEdge {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId?: string;
  unresolvedTargetId?: string;
  candidateTargetIds: string[];
  targetMention: string;
  edgeType: "references";
  semanticEffect: RelationSemanticEffect;
  evidenceText: string;
  evidenceRange: [number, number];
  explicit: boolean;
  status: RelationResolutionStatus;
  reason: string;
  detectedBy: Array<"deterministic_rule" | "llm_discovery">;
  verifiedBy: Array<"target_resolver" | "graph_validator" | "llm_adjudicator">;
}

export interface ScopedDefinition {
  term: string;
  termNormalized: string;
  definitionNodeId: string;
  scopeNodeId: string;
  evidenceRange: [number, number];
  sourceKind: "local_definition" | "imported_external";
  externalSourceMention?: string;
}

export interface UnresolvedTarget {
  unresolvedTargetId: string;
  canonicalKey: string;
  kind: "clause" | "section" | "article" | "appendix" | "schedule" | "annex" | "exhibit" | "instrument" | "unknown";
  label: string;
  status: "unresolved";
  reason: "not_present_in_supplied_artifact";
}

export interface DocumentIdentity {
  suppliedFileName: string;
  suppliedMimeType: string;
  contentSha256: string;
  pageCount?: number;
  detectedTitle?: string;
  detectedEntities: string[];
  expectedIdentity?: string;
  status: "verified" | "unverified" | "mismatch";
  reasons: string[];
}

export type StructureWarningSeverity = "info" | "warning" | "critical";

export interface StructureWarning {
  code: string;
  severity: StructureWarningSeverity;
  message: string;
  nodeId?: string;
  sourceItemRef?: string;
}

export interface StructureQuality {
  status: StructureStatus;
  analysisMode: "full" | "degraded" | "blocked";
  analysisLimitations: string[];
  automatedReview: {
    enabled: boolean;
    attemptedRelations: number;
    resolvedRelations: number;
    remainingRelations: number;
  };
  textCoverage: number;
  sourceBlockCount: number;
  mappedBlockCount: number;
  orphanCount: number;
  unresolvedRequiredParents: number;
  relationDiscoveryComplete: boolean;
  resolvedRelations: number;
  ambiguousRelations: number;
  unresolvedRelations: number;
  criticalIssues: string[];
}

export interface ParserIdentity {
  name: "docling.rs" | "text-native" | "legacy-fallback";
  version: string;
  format: string;
  status: string;
}

export interface ParsedBlock {
  sourceItemRef: string;
  label: string;
  level?: number;
  text: string;
  sourceRange: [number, number];
  provenance: SourceProvenance[];
  table?: CanonicalTable;
}

export interface ParsedDocument {
  parser: ParserIdentity;
  canonicalText: string;
  blocks: ParsedBlock[];
  warnings: StructureWarning[];
  pageCount?: number;
}

export interface CanonicalDocumentGraph {
  artifactId: string;
  fileId: string;
  documentVersionId: string;
  sourceSha256: string;
  schemaVersion: string;
  createdAt: string;
  parser: ParserIdentity;
  canonicalText: string;
  nodes: StructuralNode[];
  structuralEdges: StructuralEdge[];
  relationEdges: RelationEdge[];
  definitions: ScopedDefinition[];
  unresolvedTargets: UnresolvedTarget[];
  identity: DocumentIdentity;
  quality: StructureQuality;
  warnings: StructureWarning[];
}

export interface LlmRelationProposal {
  sourceNodeId: string;
  targetMention: string;
  semanticEffect: RelationSemanticEffect;
  evidenceText: string;
  explicit: boolean;
}

export interface LlmRelationAdjudication {
  edgeId: string;
  outcome: "select_candidate" | "keep_ambiguous";
  targetNodeId?: string;
  semanticEffect: RelationSemanticEffect;
  evidenceText: string;
  confidence: "high" | "medium" | "low";
}

export interface BuildDocumentGraphInput {
  artifactId: string;
  fileId: string;
  documentVersionId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  enableLlmRelations?: boolean;
  enableLlmAdjudication?: boolean;
  expectedIdentity?: string;
}
