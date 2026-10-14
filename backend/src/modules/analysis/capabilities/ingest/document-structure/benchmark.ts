import type { CanonicalDocumentGraph, RelationSemanticEffect, RelationResolutionStatus, StructuralNodeKind } from "./types.js";

export interface GoldNode {
  key: string;
  kind: StructuralNodeKind;
  namespace: string;
  displayLabel?: string;
  titleIncludes?: string;
  parentKey?: string;
}

export interface GoldDefinition {
  term: string;
  scopeNodeKey: string;
  sourceKind: "local_definition" | "imported_external";
}

export interface GoldRelation {
  sourceNodeKey: string;
  targetNodeKey?: string;
  unresolvedCanonicalKey?: string;
  semanticEffect: RelationSemanticEffect;
  status: RelationResolutionStatus;
}

export interface GoldTraversal {
  sourceNodeKey: string;
  targetNodeKey: string;
  maxHops: number;
}

export interface GoldDocumentGraph {
  documentName: string;
  nodes: GoldNode[];
  definitions: GoldDefinition[];
  relations: GoldRelation[];
  traversals: GoldTraversal[];
  forbiddenDefinitionTerms?: string[];
  forbiddenNodeLabels?: string[];
}

export interface BenchmarkMetric {
  correct: number;
  total: number;
  value: number;
}

export interface DocumentGraphBenchmark {
  documentName: string;
  metrics: {
    nodeRecall: BenchmarkMetric;
    nodePrecision: BenchmarkMetric;
    parentAccuracy: BenchmarkMetric;
    namespaceAccuracy: BenchmarkMetric;
    definitionPrecision: BenchmarkMetric;
    definitionRecall: BenchmarkMetric;
    referencePrecision: BenchmarkMetric;
    referenceRecall: BenchmarkMetric;
    targetResolutionAccuracy: BenchmarkMetric;
    relationTypeAccuracy: BenchmarkMetric;
    unresolvedAccuracy: BenchmarkMetric;
    ambiguityPrecision: BenchmarkMetric;
    traversalCompleteness: BenchmarkMetric;
  };
  violations: string[];
  pass: boolean;
}

function metric(correct: number, total: number): BenchmarkMetric {
  return { correct, total, value: total === 0 ? 1 : correct / total };
}

function nodeMatches(node: CanonicalDocumentGraph["nodes"][number], gold: GoldNode, ignoreNamespace = false): boolean {
  return node.kind === gold.kind && (ignoreNamespace || node.namespace === gold.namespace) &&
    (gold.displayLabel === undefined || node.displayLabel?.toLowerCase() === gold.displayLabel.toLowerCase()) &&
    (gold.titleIncludes === undefined || `${node.title ?? ""} ${node.text}`.toLowerCase().includes(gold.titleIncludes.toLowerCase()));
}

export function benchmarkDocumentGraph(graph: CanonicalDocumentGraph, gold: GoldDocumentGraph): DocumentGraphBenchmark {
  const goldByKey = new Map(gold.nodes.map((node) => [node.key, node]));
  const actualByGoldKey = new Map<string, CanonicalDocumentGraph["nodes"][number]>();
  for (const expected of gold.nodes) {
    const actual = graph.nodes.find((node) => nodeMatches(node, expected));
    if (actual) actualByGoldKey.set(expected.key, actual);
  }
  const matchedNodeIds = new Set([...actualByGoldKey.values()].map((node) => node.nodeId));
  const actualComparableNodes = graph.nodes.filter((node) => node.kind !== "document");
  const nodeRecall = metric(actualByGoldKey.size, gold.nodes.length);
  const nodePrecision = metric(actualComparableNodes.filter((node) => matchedNodeIds.has(node.nodeId)).length, actualComparableNodes.length);

  let correctParents = 0;
  let parentTotal = 0;
  for (const expected of gold.nodes) {
    if (!expected.parentKey) continue;
    parentTotal++;
    const actual = actualByGoldKey.get(expected.key);
    const expectedParent = actualByGoldKey.get(expected.parentKey);
    if (actual && expectedParent && actual.parentId === expectedParent.nodeId) correctParents++;
  }
  const namespaceAccuracy = metric(
    gold.nodes.filter((expected) => graph.nodes.some((node) => nodeMatches(node, expected, true) && node.namespace === expected.namespace)).length,
    gold.nodes.length
  );

  const definitionKeys = new Set(graph.definitions.map((definition) => {
    const scope = graph.nodes.find((node) => node.nodeId === definition.scopeNodeId);
    return `${definition.term.toLowerCase()}|${scope?.namespace ?? "missing"}|${definition.sourceKind}`;
  }));
  const goldDefinitionKeys = new Set(gold.definitions.map((definition) => {
    const scope = actualByGoldKey.get(definition.scopeNodeKey);
    return `${definition.term.toLowerCase()}|${scope?.namespace ?? goldByKey.get(definition.scopeNodeKey)?.namespace ?? "missing"}|${definition.sourceKind}`;
  }));
  const correctDefinitions = [...definitionKeys].filter((key) => goldDefinitionKeys.has(key)).length;

  const relationIdentity = (sourceId: string, targetId: string | undefined, unresolvedKey: string | undefined) =>
    `${sourceId}|${targetId ?? ""}|${unresolvedKey ?? ""}`;
  const goldRelationRows = gold.relations.map((relation) => ({
    relation,
    source: actualByGoldKey.get(relation.sourceNodeKey),
    target: relation.targetNodeKey ? actualByGoldKey.get(relation.targetNodeKey) : undefined,
  }));
  let exactRelations = 0;
  let correctTargets = 0;
  let correctTypes = 0;
  let correctUnresolved = 0;
  for (const expected of goldRelationRows) {
    if (!expected.source) continue;
    const identity = relationIdentity(expected.source.nodeId, expected.target?.nodeId, expected.relation.unresolvedCanonicalKey);
    const candidates = graph.relationEdges.filter((edge) => relationIdentity(
      edge.sourceNodeId,
      edge.targetNodeId,
      edge.unresolvedTargetId ? graph.unresolvedTargets.find((target) => target.unresolvedTargetId === edge.unresolvedTargetId)?.canonicalKey : undefined
    ) === identity);
    if (candidates.length) correctTargets++;
    if (candidates.some((edge) => edge.semanticEffect === expected.relation.semanticEffect)) correctTypes++;
    if (candidates.some((edge) => edge.semanticEffect === expected.relation.semanticEffect && edge.status === expected.relation.status)) exactRelations++;
    if (expected.relation.status === "unresolved_internal" && candidates.some((edge) => edge.status === "unresolved_internal" && edge.unresolvedTargetId)) correctUnresolved++;
  }
  const expectedIdentitySet = new Set(goldRelationRows.filter((row) => row.source).map((row) => relationIdentity(
    row.source!.nodeId, row.target?.nodeId, row.relation.unresolvedCanonicalKey
  )));
  const comparableEdges = graph.relationEdges.filter((edge) => expectedIdentitySet.has(relationIdentity(
    edge.sourceNodeId, edge.targetNodeId,
    edge.unresolvedTargetId ? graph.unresolvedTargets.find((target) => target.unresolvedTargetId === edge.unresolvedTargetId)?.canonicalKey : undefined
  )));
  const exactActualEdges = comparableEdges.filter((edge) => goldRelationRows.some((row) => row.source &&
    relationIdentity(row.source.nodeId, row.target?.nodeId, row.relation.unresolvedCanonicalKey) === relationIdentity(
      edge.sourceNodeId, edge.targetNodeId,
      edge.unresolvedTargetId ? graph.unresolvedTargets.find((target) => target.unresolvedTargetId === edge.unresolvedTargetId)?.canonicalKey : undefined
    ) && row.relation.semanticEffect === edge.semanticEffect && row.relation.status === edge.status));
  const ambiguous = graph.relationEdges.filter((edge) => edge.status === "ambiguous");
  const goldAmbiguous = goldRelationRows.filter((row) => row.relation.status === "ambiguous" && row.source);
  const correctAmbiguous = ambiguous.filter((edge) => goldAmbiguous.some((row) =>
    relationIdentity(row.source!.nodeId, row.target?.nodeId, row.relation.unresolvedCanonicalKey) === relationIdentity(
      edge.sourceNodeId, edge.targetNodeId,
      edge.unresolvedTargetId ? graph.unresolvedTargets.find((target) => target.unresolvedTargetId === edge.unresolvedTargetId)?.canonicalKey : undefined
    ) && row.relation.semanticEffect === edge.semanticEffect));

  const adjacency = new Map<string, Set<string>>();
  const connect = (from: string, to: string) => {
    const targets = adjacency.get(from) ?? new Set<string>();
    targets.add(to);
    adjacency.set(from, targets);
  };
  for (const edge of graph.structuralEdges) connect(edge.sourceNodeId, edge.targetNodeId);
  for (const edge of graph.relationEdges) if (edge.targetNodeId) connect(edge.sourceNodeId, edge.targetNodeId);
  let traversalsPassed = 0;
  for (const traversal of gold.traversals) {
    const source = actualByGoldKey.get(traversal.sourceNodeKey)?.nodeId;
    const target = actualByGoldKey.get(traversal.targetNodeKey)?.nodeId;
    if (!source || !target) continue;
    let frontier = new Set([source]);
    const seen = new Set([source]);
    for (let hop = 0; hop < traversal.maxHops && !seen.has(target); hop++) {
      const next = new Set<string>();
      for (const id of frontier) for (const neighbor of adjacency.get(id) ?? []) if (!seen.has(neighbor)) { seen.add(neighbor); next.add(neighbor); }
      frontier = next;
    }
    if (seen.has(target)) traversalsPassed++;
  }

  const violations: string[] = [];
  const forbiddenTerms = new Set((gold.forbiddenDefinitionTerms ?? []).map((term) => term.toLowerCase()));
  for (const definition of graph.definitions) if (forbiddenTerms.has(definition.term.toLowerCase())) violations.push(`forbidden_definition:${definition.term}`);
  const forbiddenLabels = new Set((gold.forbiddenNodeLabels ?? []).map((label) => label.toLowerCase()));
  for (const node of graph.nodes) if (node.displayLabel && forbiddenLabels.has(node.displayLabel.toLowerCase())) violations.push(`forbidden_node:${node.displayLabel}`);

  const unresolvedGoldCount = gold.relations.filter((relation) => relation.status === "unresolved_internal").length;
  const metrics = {
    nodeRecall, nodePrecision, parentAccuracy: metric(correctParents, parentTotal), namespaceAccuracy,
    definitionPrecision: metric(correctDefinitions, definitionKeys.size), definitionRecall: metric(correctDefinitions, goldDefinitionKeys.size),
    referencePrecision: metric(exactActualEdges.length, graph.relationEdges.length), referenceRecall: metric(exactRelations, gold.relations.length),
    targetResolutionAccuracy: metric(correctTargets, gold.relations.length), relationTypeAccuracy: metric(correctTypes, gold.relations.length),
    unresolvedAccuracy: metric(correctUnresolved, unresolvedGoldCount), ambiguityPrecision: metric(correctAmbiguous.length, ambiguous.length),
    traversalCompleteness: metric(traversalsPassed, gold.traversals.length),
  };
  return { documentName: gold.documentName, metrics, violations, pass: violations.length === 0 && Object.values(metrics).every((item) => item.value === 1) };
}
