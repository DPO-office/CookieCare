import type { EvidenceScopeConstraint } from "../../../../models/evidence-package.js";
import type { SkillRegimeRuleProofElement } from "../../../../skills/runtime/catalog/types.js";
import type { RequirementEvidenceProfile } from "../../shared/requirement-evidence.js";
import type {
  CanonicalDocumentGraph,
  RelationSemanticEffect,
  StructuralNodeKind,
} from "../../../ingest/document-structure/types.js";

export type InvestigationMode = "off" | "shadow" | "canonical";

export function complianceInvestigationMode(): InvestigationMode {
  return "canonical";
}
export type RetrievalChannel = "exact" | "sparse" | "dense";
export type EvidenceRole =
  | "primary"
  | "supporting"
  | "dependency"
  | "definition"
  | "limitation"
  | "contradictory"
  | "context"
  | "irrelevant";

export interface InvestigationRequirement {
  requestRequirementId: string;
  requirementId: string;
  packageId: string;
  documentId: string;
  profile: RequirementEvidenceProfile;
  evidenceScope?: EvidenceScopeConstraint;
  clauseTypes: string[];
  extractionTargets: string[];
  elementIds: string[];
  proofElements?: SkillRegimeRuleProofElement[];
}

export interface InvestigationResolutionIssue {
  documentId: string;
  requirementId: string;
  packageId?: string;
  reason:
    | "binding_missing"
    | "package_missing"
    | "package_ambiguous"
    | "profile_missing"
    | "facet_unresolved"
    | "graph_missing";
  detail: string;
}

export interface EvidenceUnit {
  unitId: string;
  nodeId: string;
  documentId: string;
  documentVersionId: string;
  graphSchemaVersion: string;
  contentHash: string;
  nodeKind: StructuralNodeKind;
  namespace: string;
  structuralPath: string;
  title?: string;
  parentHeading?: string;
  rawText: string;
  searchText: string;
  sourceRange: [number, number];
  pageStart?: number;
  pageEnd?: number;
  confidence: number;
  graphQuality: {
    status: CanonicalDocumentGraph["quality"]["status"];
    analysisMode: CanonicalDocumentGraph["quality"]["analysisMode"];
  };
  referenceResolution: {
    resolved: number;
    ambiguous: number;
    unresolvedInternal: number;
    external: number;
  };
  relationshipScope: string;
  sourceGraph: CanonicalDocumentGraph;
}

export interface RequirementSearchPlan {
  requirementId: string;
  exactQueries: string[];
  sparseQueries: string[];
  denseQueries: string[];
}

export interface RetrievalHit {
  unitId: string;
  channel: RetrievalChannel;
  query: string;
  rank: number;
  score: number;
}

export interface RankedEvidenceCandidate {
  unit: EvidenceUnit;
  fusedScore: number;
  rerankScore: number;
  channelRanks: Partial<Record<RetrievalChannel, number>>;
  channelScores: Partial<Record<RetrievalChannel, number>>;
  matchedQueries: string[];
  signals: string[];
  expansion?: {
    seedNodeId: string;
    reason: "internal_reference" | "definition" | "parent";
  };
}

export interface EvidenceDecision {
  nodeId: string;
  role: EvidenceRole;
  contributesToElementIds: string[];
  confidence: number;
  reason: string;
}

export interface EvidencePassage {
  unitId: string;
  nodeId: string;
  documentId: string;
  relationshipScope?: string;
  role: Exclude<EvidenceRole, "irrelevant">;
  rawText: string;
  structuralPath: string;
  sourceRange: [number, number];
  contributesToElementIds: string[];
  confidence: number;
  reason: string;
  retrievalChannels: RetrievalChannel[];
  matchedQueries: string[];
}

export interface InvestigationDependency {
  edgeId?: string;
  referenceText?: string;
  referenceRange?: [number, number];
  targetMention?: string;
  sourceNodeId: string;
  targetNodeIds: string[];
  semanticEffect: RelationSemanticEffect;
  state: "resolved_internal" | "ambiguous" | "unresolved_internal" | "external";
}

export interface InvestigationExclusion {
  nodeId?: string;
  reason: string;
}

/** Compact, text-free trace of why a graph node reached semantic review. */
export interface InvestigationCandidateProvenance {
  unitId: string;
  nodeId: string;
  fusedScore: number;
  rerankScore: number;
  channelRanks: Partial<Record<RetrievalChannel, number>>;
  channelScores: Partial<Record<RetrievalChannel, number>>;
  matchedQueries: string[];
  signals: string[];
  reviewDisposition:
    | "accepted"
    | "semantic_rejection"
    | "role_budget"
    | "total_budget"
    | "validation_rejection"
    | "not_classified";
  reviewDecision?: EvidenceDecision;
  exclusionReason?: string;
  expansion?: RankedEvidenceCandidate["expansion"];
}

export interface RequirementEvidenceBundle {
  bundleId: string;
  requirementId: string;
  packageId: string;
  documentId: string;
  passages: EvidencePassage[];
  coveredElementIds: string[];
  unresolvedElementIds: string[];
  dependencies: InvestigationDependency[];
  exclusions: InvestigationExclusion[];
  investigationComplete: boolean;
  executionStatus?: "complete" | "incomplete" | "unknown";
  coverageReasons?: string[];
  coverageIssues?: Array<{ reason: string; elementIds: string[]; evidenceIds: string[]; materiality: "material" | "immaterial" | "unknown" }>;
  incompleteReasons: string[];
  candidateCount: number;
  retrievalChannelCounts: Record<RetrievalChannel, number>;
  candidateProvenance: InvestigationCandidateProvenance[];
}

export interface InvestigationLogger {
  (event: string, payload: Record<string, unknown>): void;
}

export interface InvestigationRunResult {
  bundlesByRequirement: Map<string, RequirementEvidenceBundle>;
  resolutionIssues: InvestigationResolutionIssue[];
  timings: {
    indexMs: number;
    retrievalMs: number;
    reviewMs: number;
    expansionMs: number;
    totalMs: number;
  };
}

export interface EmbeddingCacheKey {
  userId: string;
  fileId: string;
  documentVersionId: string;
  graphSchemaVersion: string;
  embeddingModel: string;
}

export interface EvidenceEmbeddingCache {
  load(key: EmbeddingCacheKey): Promise<Map<string, { contentHash: string; vector: number[] }>>;
  upsert(
    key: EmbeddingCacheKey,
    rows: Array<{ nodeId: string; contentHash: string; vector: number[] }>
  ): Promise<void>;
}
