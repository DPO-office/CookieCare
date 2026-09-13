import { executeJsonCompletion, LLMProvider, LLMTask } from "../../../../../llm/index.js";
import type { CanonicalDocumentGraph, LlmRelationProposal, RelationSemanticEffect, StructuralNode } from "./types.js";

const EFFECTS: RelationSemanticEffect[] = [
  "refers_to", "defined_by", "details_provided_by", "procedure_provided_by", "implements",
  "subject_to", "exception_to", "exception_provided_by", "modifies", "overrides", "prevails_over",
  "incorporates", "applies_to", "forms_part_of", "scope_derived_from", "limits", "requires",
  "supplements", "external_reference", "survives", "unknown",
];
const MAX_BATCH_CHARS = Math.max(8_000, Number(process.env.DOCUMENT_GRAPH_RELATION_BATCH_CHARS || 18_000));
const MAX_CONCURRENCY = Math.max(1, Math.min(2, Number(process.env.DOCUMENT_GRAPH_RELATION_CONCURRENCY || 2)));

const DISCOVERY_SCHEMA = {
  type: "object",
  properties: {
    relations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sourceNodeId: { type: "string" },
          targetMention: { type: "string" },
          semanticEffect: { type: "string", enum: EFFECTS },
          evidenceText: { type: "string" },
          explicit: { type: "boolean" },
        },
        required: ["sourceNodeId", "targetMention", "semanticEffect", "evidenceText", "explicit"],
      },
    },
  },
  required: ["relations"],
};

function substantive(nodes: StructuralNode[]): StructuralNode[] {
  return nodes.filter((node) => ["clause", "subclause", "paragraph", "list_item", "definition", "section"].includes(node.kind) && node.text.trim().length >= 12);
}

function batches(nodes: StructuralNode[]): StructuralNode[][] {
  const output: StructuralNode[][] = [];
  let batch: StructuralNode[] = [];
  let chars = 0;
  for (const node of nodes) {
    const size = node.text.length + 180;
    if (batch.length && chars + size > MAX_BATCH_CHARS) {
      output.push(batch);
      batch = [];
      chars = 0;
    }
    batch.push(node);
    chars += size;
  }
  if (batch.length) output.push(batch);
  return output;
}

async function mapConcurrent<T, R>(values: T[], fn: (value: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await fn(values[index]);
    }
  });
  await Promise.all(workers);
  return output;
}

export async function discoverRelationsWithLlm(graph: CanonicalDocumentGraph): Promise<LlmRelationProposal[]> {
  const work = batches(substantive(graph.nodes));
  const results = await mapConcurrent(work, async (batch) => {
    const input = batch.map((node) => ({
      nodeId: node.nodeId,
      namespace: node.namespace,
      label: node.displayLabel,
      title: node.title,
      text: node.text,
    }));
    return executeJsonCompletion<{ relations: LlmRelationProposal[] }>(
      [
        "Extract every legally meaningful relationship expressed by these provisions.",
        "Find both explicit citations and implicit dependencies, qualifications, exceptions, precedence, survival, definitions, procedures, and incorporated details.",
        "targetMention must be the exact words identifying the target. evidenceText must be one exact, contiguous substring of the source node text.",
        "Use only supplied sourceNodeId values. Do not invent document text or node IDs. Return no relation when none is supported.",
        JSON.stringify(input),
      ].join("\n"),
      "You perform evidence-grounded legal document relation discovery. Return only schema-valid JSON.",
      DISCOVERY_SCHEMA,
      LLMTask.STRUCTURAL_JSON_LITE,
      LLMProvider.GEMINI,
      { maxOutputTokens: 4096, thinkingLevel: "minimal" }
    );
  });
  return results.flatMap((result) => Array.isArray(result.relations) ? result.relations : []);
}
