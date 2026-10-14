import type { DocumentRole, DocumentSegment, SegmentedDocument } from "../../../models/document-workspace.js";
import type { CanonicalDocumentGraph, StructuralNode } from "./types.js";

function segmentKind(node: StructuralNode): DocumentSegment["kind"] {
  if (["appendix", "schedule", "annex", "exhibit"].includes(node.kind)) return "schedule";
  if (["clause", "subclause", "article", "list_item", "definition"].includes(node.kind)) return "clause";
  if (["title", "part", "section"].includes(node.kind)) return "heading";
  return "paragraph";
}

function pathFor(node: StructuralNode, byId: Map<string, StructuralNode>): string {
  if (node.ordinalPath) return node.ordinalPath;
  const parts: string[] = [];
  let current: StructuralNode | undefined = node;
  while (current && current.kind !== "document") {
    parts.unshift(current.displayLabel || current.title || current.kind);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return parts.map((part) => part.toLowerCase().replace(/[^a-z0-9()]+/g, "-").replace(/^-|-$/g, "")).join("/") || node.nodeId;
}

export function graphToSegments(graph: CanonicalDocumentGraph): DocumentSegment[] {
  const byId = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  return graph.nodes.filter((node) => node.kind !== "document" && node.text.trim()).map((node) => ({
    locator: { docId: graph.fileId, structuralPath: pathFor(node, byId), charRange: node.sourceRange },
    text: node.text,
    kind: segmentKind(node),
    structuralNodeId: node.nodeId,
  }));
}

export function graphToWorkspaceDocument(
  graph: CanonicalDocumentGraph,
  options: { title?: string; role: DocumentRole }
): SegmentedDocument {
  return {
    docId: graph.fileId,
    title: options.title,
    role: options.role,
    fullText: graph.canonicalText,
    segments: graphToSegments(graph),
    clauses: [],
    structureGraph: graph,
  };
}
