import type { CanonicalDocumentGraph, StructureQuality, StructureWarning } from "./types.js";

export function validateDocumentGraph(
  graph: Omit<CanonicalDocumentGraph, "quality">,
  relationDiscoveryComplete: boolean,
  automatedReview: StructureQuality["automatedReview"] = {
    enabled: false, attemptedRelations: 0, resolvedRelations: 0, remainingRelations: 0,
  }
): { quality: StructureQuality; warnings: StructureWarning[] } {
  const warnings: StructureWarning[] = [];
  const nodeIds = new Set(graph.nodes.map((node) => node.nodeId));
  const unresolvedTargetIds = new Set(graph.unresolvedTargets.map((target) => target.unresolvedTargetId));
  if (nodeIds.size !== graph.nodes.length) warnings.push({ code: "duplicate_node_id", severity: "critical", message: "The graph contains duplicate structural node IDs." });
  const ordinalPaths = graph.nodes.map((node) => node.ordinalPath).filter(Boolean);
  if (new Set(ordinalPaths).size !== ordinalPaths.length) warnings.push({ code: "duplicate_ordinal_path", severity: "critical", message: "The graph contains duplicate canonical ordinal paths." });
  if (unresolvedTargetIds.size !== graph.unresolvedTargets.length) warnings.push({ code: "duplicate_unresolved_target", severity: "critical", message: "Canonical unresolved targets are not unique." });
  const sourceRefs = new Set(graph.nodes.flatMap((node) => node.sourceItemRefs).filter((ref) => ref !== "#/body"));
  const sourceBlockCount = sourceRefs.size;
  const mappedBlockCount = graph.nodes.filter((node) => node.kind !== "document" && node.sourceItemRefs.length > 0).length;
  const mappedChars = graph.nodes
    .filter((node) => node.kind !== "document")
    .reduce((total, node) => total + Math.max(0, node.sourceRange[1] - node.sourceRange[0]), 0);
  const nonWhitespaceChars = graph.canonicalText.replace(/\s/g, "").length;
  const mappedNonWhitespaceChars = graph.nodes
    .filter((node) => node.kind !== "document")
    .reduce((total, node) => total + node.text.replace(/\s/g, "").length, 0);
  const textCoverage = nonWhitespaceChars === 0 ? 1 : Math.min(1, mappedNonWhitespaceChars / nonWhitespaceChars);

  let orphanCount = 0;
  let unresolvedRequiredParents = 0;
  for (const node of graph.nodes) {
    if (node.kind !== "document" && (!node.parentId || !nodeIds.has(node.parentId))) orphanCount += 1;
    if (node.signals.includes("missing_numbered_parent")) unresolvedRequiredParents += 1;
    if (node.sourceRange[0] < 0 || node.sourceRange[1] > graph.canonicalText.length || node.sourceRange[0] > node.sourceRange[1]) {
      warnings.push({ code: "invalid_source_range", severity: "critical", message: "A node has an invalid canonical source range.", nodeId: node.nodeId });
    }
  }

  const roots = graph.nodes.filter((node) => node.kind === "document");
  if (roots.length !== 1) warnings.push({ code: "invalid_root_count", severity: "critical", message: `Expected one document root, found ${roots.length}.` });
  if (orphanCount) warnings.push({ code: "orphan_nodes", severity: "critical", message: `${orphanCount} structural nodes have no valid parent.` });
  if (textCoverage < 0.995) warnings.push({ code: "text_coverage_below_gate", severity: "critical", message: `Canonical text coverage ${(textCoverage * 100).toFixed(2)}% is below 99.5%.` });
  if (!relationDiscoveryComplete) warnings.push({ code: "relation_discovery_incomplete", severity: "critical", message: "Semantic relation discovery did not complete for every substantive node." });
  if (graph.identity.status === "mismatch") warnings.push({ code: "document_identity_mismatch", severity: "critical", message: graph.identity.reasons.join(" ") || "Document identity does not match the expected artifact." });

  const definitionStopwords = new Set(["and", "or", "the", "of", "to", "in", "for", "a", "an", "by", "with", "as"]);
  for (const definition of graph.definitions) {
    if (definitionStopwords.has(definition.termNormalized) || !nodeIds.has(definition.definitionNodeId) || !nodeIds.has(definition.scopeNodeId)) {
      warnings.push({ code: "invalid_definition", severity: "critical", message: `Invalid or ungrounded definition '${definition.term}'.`, nodeId: definition.definitionNodeId });
    }
  }

  const seen = new Set<string>();
  const visiting = new Set<string>();
  const byId = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  const cyclic = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (seen.has(id)) return false;
    visiting.add(id);
    for (const child of byId.get(id)?.childIds ?? []) if (cyclic(child)) return true;
    visiting.delete(id);
    seen.add(id);
    return false;
  };
  if (roots[0] && cyclic(roots[0].nodeId)) warnings.push({ code: "structural_cycle", severity: "critical", message: "The physical document tree contains a cycle." });

  for (const edge of graph.relationEdges) {
    const source = byId.get(edge.sourceNodeId);
    const evidenceInCanonical = graph.canonicalText.slice(edge.evidenceRange[0], edge.evidenceRange[1]);
    const evidenceInsideSource = Boolean(source) && edge.evidenceRange[0] >= source!.sourceRange[0] &&
      edge.evidenceRange[1] <= source!.sourceRange[1];
    if (!source || !source.text.includes(edge.evidenceText) || evidenceInCanonical !== edge.evidenceText || !evidenceInsideSource) {
      warnings.push({ code: "relation_evidence_not_grounded", severity: "critical", message: "A relation edge is not grounded in its source node.", nodeId: edge.sourceNodeId });
    }
    if (edge.status === "resolved" && (!edge.targetNodeId || !nodeIds.has(edge.targetNodeId))) {
      warnings.push({ code: "resolved_relation_target_missing", severity: "critical", message: "A resolved relation points to a missing node.", nodeId: edge.sourceNodeId });
    }
    if (edge.status === "unresolved_internal" && (!edge.unresolvedTargetId || !unresolvedTargetIds.has(edge.unresolvedTargetId))) {
      warnings.push({ code: "unresolved_target_missing", severity: "critical", message: "An unresolved reference has no canonical unresolved target.", nodeId: edge.sourceNodeId });
    }
    if (edge.status === "ambiguous" && edge.candidateTargetIds.length < 2 && edge.reason !== "relative_reference_requires_adjudication" && edge.reason !== "deterministic_and_llm_relation_disagreement") {
      warnings.push({ code: "invalid_ambiguous_relation", severity: "critical", message: "An ambiguous relation has no competing target candidates.", nodeId: edge.sourceNodeId });
    }
    if (!edge.verifiedBy.includes("graph_validator")) edge.verifiedBy.push("graph_validator");
  }

  const allWarnings = [...graph.warnings, ...warnings];
  const criticalIssues = [...new Set(allWarnings.filter((warning) => warning.severity === "critical").map((warning) => warning.code))];
  const hardBlockCodes = new Set([
    "duplicate_node_id", "duplicate_ordinal_path", "duplicate_unresolved_target",
    "invalid_source_range", "invalid_root_count", "orphan_nodes", "text_coverage_below_gate",
    "document_identity_mismatch", "invalid_definition", "structural_cycle",
    "relation_evidence_not_grounded", "resolved_relation_target_missing",
    "unresolved_target_missing", "invalid_ambiguous_relation",
  ]);
  const blocked = criticalIssues.some((code) => hardBlockCodes.has(code));
  const ambiguousRelations = graph.relationEdges.filter((edge) => edge.status === "ambiguous").length;
  const unresolvedRelations = graph.relationEdges.filter((edge) => edge.status === "unresolved_internal").length;
  const analysisLimitations: string[] = [];
  if (graph.parser.name === "legacy-fallback") {
    analysisLimitations.push("The rich-layout parser failed, so formatting and clause boundaries may be incomplete.");
  }
  if (ambiguousRelations) {
    analysisLimitations.push(`${ambiguousRelations} cross-reference${ambiguousRelations === 1 ? " remains" : "s remain"} ambiguous and will not be treated as verified.`);
  }
  if (unresolvedRelations) {
    analysisLimitations.push(`${unresolvedRelations} cross-reference${unresolvedRelations === 1 ? " points" : "s point"} to material not present in the supplied artifact.`);
  }
  if (!relationDiscoveryComplete) {
    analysisLimitations.push("Optional semantic relation discovery did not complete; deterministic relationships remain available.");
  }
  if (blocked) {
    analysisLimitations.push("Structural integrity validation failed, so automated legal analysis is blocked for this document.");
  } else if (criticalIssues.length) {
    analysisLimitations.push(`Structural review retained recoverable issue${criticalIssues.length === 1 ? "" : "s"}: ${criticalIssues.join(", ")}.`);
  }
  const analysisMode: StructureQuality["analysisMode"] = blocked
    ? "blocked"
    : analysisLimitations.length
      ? "degraded"
      : "full";
  const quality: StructureQuality = {
    status: analysisMode === "full" ? "ready" : "needs_review",
    analysisMode,
    analysisLimitations,
    automatedReview,
    textCoverage,
    sourceBlockCount,
    mappedBlockCount,
    orphanCount,
    unresolvedRequiredParents,
    relationDiscoveryComplete,
    resolvedRelations: graph.relationEdges.filter((edge) => edge.status === "resolved").length,
    ambiguousRelations,
    unresolvedRelations,
    criticalIssues,
  };
  void mappedChars;
  return { quality, warnings };
}
