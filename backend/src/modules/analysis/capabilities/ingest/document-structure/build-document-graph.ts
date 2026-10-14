import { createHash } from "node:crypto";
import { parseDocument } from "./parser.js";
import { buildPhysicalHierarchy } from "./hierarchy.js";
import { buildRelations } from "./relations.js";
import { discoverRelationsWithLlm } from "./llm-relations.js";
import { validateDocumentGraph } from "./validator.js";
import { buildDocumentIdentity } from "./identity.js";
import { adjudicateRelationsWithLlm, applyRelationAdjudications } from "./adjudication.js";
import { DOCUMENT_GRAPH_SCHEMA_VERSION, type BuildDocumentGraphInput, type CanonicalDocumentGraph, type LlmRelationAdjudication, type LlmRelationProposal, type StructureWarning } from "./types.js";

export async function buildDocumentGraph(
  input: BuildDocumentGraphInput,
  dependencies: {
    discoverRelations?: (graph: CanonicalDocumentGraph) => Promise<LlmRelationProposal[]>;
    adjudicateRelations?: (graph: CanonicalDocumentGraph) => Promise<LlmRelationAdjudication[]>;
  } = {}
): Promise<CanonicalDocumentGraph> {
  const parsed = await parseDocument(input.buffer, input.mimeType, input.fileName);
  const hierarchy = buildPhysicalHierarchy(parsed, input.documentVersionId);
  const baseWarnings = [...parsed.warnings, ...hierarchy.warnings];
  const sourceSha256 = createHash("sha256").update(input.buffer).digest("hex");
  const identity = buildDocumentIdentity(input, parsed, sourceSha256);
  const skeleton: CanonicalDocumentGraph = {
    artifactId: input.artifactId,
    fileId: input.fileId,
    documentVersionId: input.documentVersionId,
    sourceSha256,
    schemaVersion: DOCUMENT_GRAPH_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    parser: parsed.parser,
    canonicalText: parsed.canonicalText,
    nodes: hierarchy.nodes,
    structuralEdges: hierarchy.structuralEdges,
    relationEdges: [],
    definitions: hierarchy.definitions,
    unresolvedTargets: [],
    identity,
    quality: {
      status: "processing", analysisMode: "blocked", analysisLimitations: [],
      automatedReview: { enabled: false, attemptedRelations: 0, resolvedRelations: 0, remainingRelations: 0 },
      textCoverage: 0, sourceBlockCount: parsed.blocks.length,
      mappedBlockCount: 0, orphanCount: 0, unresolvedRequiredParents: 0,
      relationDiscoveryComplete: false, resolvedRelations: 0, ambiguousRelations: 0,
      unresolvedRelations: 0, criticalIssues: [],
    },
    warnings: baseWarnings,
  };

  // Contract excerpts leave the process when semantic discovery is enabled.
  // Require an explicit deployment opt-in; deterministic references remain local.
  const enableLlm = input.enableLlmRelations ?? process.env.DOCUMENT_GRAPH_LLM_RELATIONS === "1";
  let proposals: LlmRelationProposal[] = [];
  let relationDiscoveryComplete = !enableLlm;
  const discoveryWarnings: StructureWarning[] = [];
  if (enableLlm) {
    try {
      proposals = await (dependencies.discoverRelations ?? discoverRelationsWithLlm)(skeleton);
      relationDiscoveryComplete = true;
    } catch (error) {
      discoveryWarnings.push({
        code: "relation_discovery_failed", severity: "critical",
        message: `Semantic relation discovery failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const relations = buildRelations(skeleton, proposals);
  let relationEdges = relations.edges;
  const adjudicationWarnings: StructureWarning[] = [];
  const enableAdjudication = input.enableLlmAdjudication ?? process.env.DOCUMENT_GRAPH_LLM_ADJUDICATION === "1";
  const reviewCandidates = relationEdges.filter((edge) => edge.status === "ambiguous" && edge.candidateTargetIds.length >= 2).length;
  let adjudicationResolved = 0;
  if (enableAdjudication && reviewCandidates > 0) {
    const reviewGraph: CanonicalDocumentGraph = {
      ...skeleton,
      relationEdges,
      unresolvedTargets: relations.unresolvedTargets,
      warnings: [...baseWarnings, ...discoveryWarnings, ...relations.warnings],
    };
    try {
      const decisions = await (dependencies.adjudicateRelations ?? adjudicateRelationsWithLlm)(reviewGraph);
      const applied = applyRelationAdjudications(reviewGraph, decisions);
      relationEdges = applied.edges;
      adjudicationResolved = applied.resolved;
      adjudicationWarnings.push(...applied.warnings);
    } catch (error) {
      adjudicationWarnings.push({
        code: "automatic_adjudication_failed",
        severity: "warning",
        message: `Automated relation review failed; ambiguity was preserved (${error instanceof Error ? error.message : String(error)}).`,
      });
    }
  }
  const withoutQuality: Omit<CanonicalDocumentGraph, "quality"> = {
    ...skeleton,
    relationEdges,
    unresolvedTargets: relations.unresolvedTargets,
    warnings: [...baseWarnings, ...discoveryWarnings, ...relations.warnings, ...adjudicationWarnings],
  };
  const validated = validateDocumentGraph(withoutQuality, relationDiscoveryComplete, {
    enabled: enableAdjudication,
    attemptedRelations: enableAdjudication ? reviewCandidates : 0,
    resolvedRelations: adjudicationResolved,
    remainingRelations: relationEdges.filter((edge) => edge.status === "ambiguous").length,
  });
  return { ...withoutQuality, quality: validated.quality, warnings: [...withoutQuality.warnings, ...validated.warnings] };
}
