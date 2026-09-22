import { executeJsonCompletion, LLMProvider, LLMTask } from "../../../../../llm/index.js";
import type {
  CanonicalDocumentGraph,
  LlmRelationAdjudication,
  RelationEdge,
  RelationSemanticEffect,
  StructureWarning,
} from "./types.js";

const EFFECTS: RelationSemanticEffect[] = [
  "refers_to", "defined_by", "details_provided_by", "procedure_provided_by", "implements",
  "subject_to", "exception_to", "exception_provided_by", "modifies", "overrides", "prevails_over",
  "incorporates", "applies_to", "forms_part_of", "scope_derived_from", "limits", "requires",
  "supplements", "external_reference", "survives", "unknown",
];
const MAX_RELATIONS = Math.max(1, Math.min(100, Number(process.env.DOCUMENT_GRAPH_ADJUDICATION_LIMIT || 40)));

const ADJUDICATION_SCHEMA = {
  type: "object",
  properties: {
    decisions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          edgeId: { type: "string" },
          outcome: { type: "string", enum: ["select_candidate", "keep_ambiguous"] },
          targetNodeId: { type: "string" },
          semanticEffect: { type: "string", enum: EFFECTS },
          evidenceText: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["edgeId", "outcome", "semanticEffect", "evidenceText", "confidence"],
      },
    },
  },
  required: ["decisions"],
};

function reviewable(graph: CanonicalDocumentGraph): RelationEdge[] {
  return graph.relationEdges
    .filter((edge) => edge.status === "ambiguous" && edge.candidateTargetIds.length >= 2)
    .slice(0, MAX_RELATIONS);
}

export async function adjudicateRelationsWithLlm(graph: CanonicalDocumentGraph): Promise<LlmRelationAdjudication[]> {
  const byId = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  const edges = reviewable(graph);
  if (!edges.length) return [];
  const input = edges.map((edge) => ({
    edgeId: edge.edgeId,
    source: {
      nodeId: edge.sourceNodeId,
      namespace: byId.get(edge.sourceNodeId)?.namespace,
      evidenceText: edge.evidenceText,
      targetMention: edge.targetMention,
      proposedSemanticEffect: edge.semanticEffect,
    },
    candidates: edge.candidateTargetIds.map((nodeId) => {
      const node = byId.get(nodeId)!;
      return {
        nodeId,
        namespace: node.namespace,
        label: node.displayLabel,
        title: node.title,
        excerpt: node.text.slice(0, 600),
      };
    }),
  }));
  const result = await executeJsonCompletion<{ decisions: LlmRelationAdjudication[] }>(
    [
      "Resolve only the ambiguous reference edges below.",
      "Select a candidate only when the exact evidence and legal namespace uniquely establish it.",
      "Never invent a target. targetNodeId must be one of that edge's supplied candidates.",
      "Copy evidenceText exactly. Use high confidence only for an unambiguous, source-supported selection; otherwise keep_ambiguous.",
      JSON.stringify(input),
    ].join("\n"),
    "You are a bounded legal-reference adjudicator. You may choose only from supplied candidates and must preserve uncertainty.",
    ADJUDICATION_SCHEMA,
    LLMTask.STRUCTURAL_JSON_LITE,
    LLMProvider.GEMINI,
    { maxOutputTokens: 4096, thinkingLevel: "low" }
  );
  return Array.isArray(result.decisions) ? result.decisions : [];
}

export function applyRelationAdjudications(
  graph: CanonicalDocumentGraph,
  decisions: LlmRelationAdjudication[]
): { edges: RelationEdge[]; attempted: number; resolved: number; warnings: StructureWarning[] } {
  const byEdge = new Map(decisions.map((decision) => [decision.edgeId, decision]));
  const warnings: StructureWarning[] = [];
  let attempted = 0;
  let resolved = 0;
  const edges = graph.relationEdges.map((edge) => {
    const decision = byEdge.get(edge.edgeId);
    if (!decision || edge.status !== "ambiguous") return edge;
    attempted += 1;
    const reviewed = { ...edge, verifiedBy: [...edge.verifiedBy] };
    if (!reviewed.verifiedBy.includes("llm_adjudicator")) reviewed.verifiedBy.push("llm_adjudicator");
    if (decision.outcome !== "select_candidate") return reviewed;
    const valid = decision.confidence === "high" && decision.evidenceText === edge.evidenceText &&
      Boolean(decision.targetNodeId) && edge.candidateTargetIds.includes(decision.targetNodeId!);
    if (!valid) {
      warnings.push({
        code: "adjudication_rejected",
        severity: "warning",
        message: "An automated adjudication was rejected because it was not high-confidence, evidence-exact, and candidate-bounded.",
        nodeId: edge.sourceNodeId,
      });
      return reviewed;
    }
    resolved += 1;
    return {
      ...reviewed,
      targetNodeId: decision.targetNodeId,
      status: "resolved" as const,
      semanticEffect: decision.semanticEffect,
      reason: "llm_adjudicated_from_bounded_candidates",
    };
  });
  return { edges, attempted, resolved, warnings };
}
