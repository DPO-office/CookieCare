import crypto from "node:crypto";
import { inferEvidenceRelationshipScope } from "../../shared/candidate-selection.js";
import type {
  CanonicalDocumentGraph,
  StructuralNode,
} from "../../../ingest/document-structure/types.js";
import type { EvidenceUnit } from "./types.js";

const OPERATIVE_KINDS = new Set(["clause", "subclause", "paragraph", "list_item"]);

function ancestorHeading(node: StructuralNode, byId: Map<string, StructuralNode>): string | undefined {
  let current = node.parentId ? byId.get(node.parentId) : undefined;
  while (current) {
    const heading = current.title?.trim() || current.displayLabel?.trim();
    if (heading) return heading;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return undefined;
}

function unitFromText(
  graph: CanonicalDocumentGraph,
  node: StructuralNode,
  unitId: string,
  rawText: string,
  sourceRange: [number, number],
  byId: Map<string, StructuralNode>
): EvidenceUnit {
  const parentHeading = ancestorHeading(node, byId);
  const title = node.title?.trim() || node.displayLabel?.trim();
  const searchText = [parentHeading, title, node.ordinalPath, rawText]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const outgoing = graph.relationEdges.filter((edge) => edge.sourceNodeId === node.nodeId);
  return {
    unitId,
    nodeId: node.nodeId,
    documentId: graph.fileId,
    documentVersionId: graph.documentVersionId,
    graphSchemaVersion: graph.schemaVersion,
    contentHash: crypto.createHash("sha256").update(searchText).digest("hex"),
    nodeKind: node.kind,
    namespace: node.namespace,
    structuralPath: node.ordinalPath || node.displayLabel || node.nodeId,
    title,
    parentHeading,
    rawText,
    searchText,
    sourceRange,
    pageStart: node.pageStart,
    pageEnd: node.pageEnd,
    confidence: node.confidence,
    graphQuality: {
      status: graph.quality.status,
      analysisMode: graph.quality.analysisMode,
    },
    referenceResolution: {
      resolved: outgoing.filter((edge) => edge.status === "resolved").length,
      ambiguous: outgoing.filter((edge) => edge.status === "ambiguous").length,
      unresolvedInternal: outgoing.filter((edge) => edge.status === "unresolved_internal").length,
      external: outgoing.filter((edge) => edge.status === "external").length,
    },
    relationshipScope: inferEvidenceRelationshipScope({
      contextHeading: parentHeading,
      title,
      structuralPath: node.ordinalPath,
      text: rawText,
    }),
    sourceGraph: graph,
  };
}

export function evidenceUnitFromNode(
  graph: CanonicalDocumentGraph,
  node: StructuralNode
): EvidenceUnit {
  const byId = new Map(graph.nodes.map((candidate) => [candidate.nodeId, candidate]));
  return unitFromText(graph, node, node.nodeId, node.text.trim(), node.sourceRange, byId);
}

function tableRows(node: StructuralNode): Array<{ id: string; text: string; range: [number, number] }> {
  if (!node.table || !node.text.trim()) return [];
  const rows: Array<{ id: string; text: string; range: [number, number] }> = [];
  for (let row = 0; row < node.table.rows; row += 1) {
    const cells = node.table.cells
      .filter((cell) => cell.rowStart === row)
      .sort((a, b) => a.columnStart - b.columnStart)
      .map((cell) => cell.text.trim())
      .filter(Boolean);
    let cursor = 0;
    let rowStart = -1;
    let rowEnd = -1;
    for (const cell of cells) {
      const at = node.text.indexOf(cell, cursor);
      if (at < 0) {
        rowStart = -1;
        break;
      }
      if (rowStart < 0) rowStart = at;
      rowEnd = at + cell.length;
      cursor = rowEnd;
    }
    // A searchable evidence unit must remain an exact source substring. If
    // this parser did not preserve cell text contiguously, skip the row.
    if (rowStart < 0 || rowEnd <= rowStart) continue;
    const text = node.text.slice(rowStart, rowEnd).trim();
    if (text.length < 20) continue;
    const trimmedStart = node.text.slice(rowStart, rowEnd).indexOf(text);
    const range: [number, number] = [
      node.sourceRange[0] + rowStart + trimmedStart,
      node.sourceRange[0] + rowStart + trimmedStart + text.length,
    ];
    rows.push({ id: `${node.nodeId}::row::${row}`, text, range });
  }
  return rows;
}

/** Build searchable evidence units directly from the upload-time graph. */
export function buildEvidenceUnits(graph: CanonicalDocumentGraph): EvidenceUnit[] {
  const byId = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  const units: EvidenceUnit[] = [];
  for (const node of graph.nodes) {
    const hasOperativeChild = node.childIds.some((childId) => {
      const child = byId.get(childId);
      return child ? OPERATIVE_KINDS.has(child.kind) || child.kind === "table" : false;
    });
    if (OPERATIVE_KINDS.has(node.kind) && !hasOperativeChild && node.text.trim().length >= 20) {
      units.push(unitFromText(graph, node, node.nodeId, node.text.trim(), node.sourceRange, byId));
      continue;
    }
    if (node.kind === "table") {
      for (const row of tableRows(node)) {
        units.push(unitFromText(graph, node, row.id, row.text, row.range, byId));
      }
    }
  }
  return units;
}

const TOKEN_RE = /[a-z0-9]+/g;
const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "with", "by"]);

export function sparseTokens(text: string): string[] {
  return (text.toLowerCase().match(TOKEN_RE) ?? []).filter(
    (token) => token.length > 1 && !STOP.has(token)
  );
}

/** Small in-memory BM25 implementation scoped to one canonical document. */
export function bm25Search(
  units: EvidenceUnit[],
  query: string,
  limit = 25
): Array<{ unit: EvidenceUnit; score: number }> {
  const queryTerms = [...new Set(sparseTokens(query))];
  if (queryTerms.length === 0 || units.length === 0) return [];
  const docs = units.map((unit) => sparseTokens(unit.searchText));
  const avgLength = docs.reduce((sum, tokens) => sum + tokens.length, 0) / docs.length || 1;
  const frequencies = new Map<string, number>();
  for (const tokens of docs) {
    for (const term of new Set(tokens)) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  }
  const k1 = 1.2;
  const b = 0.75;
  return units
    .map((unit, index) => {
      const tokens = docs[index];
      const counts = new Map<string, number>();
      for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
      let score = 0;
      for (const term of queryTerms) {
        const tf = counts.get(term) ?? 0;
        if (tf === 0) continue;
        const df = frequencies.get(term) ?? 0;
        const idf = Math.log(1 + (units.length - df + 0.5) / (df + 0.5));
        score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (tokens.length / avgLength))));
      }
      return { unit, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, bRow) => bRow.score - a.score)
    .slice(0, limit);
}
