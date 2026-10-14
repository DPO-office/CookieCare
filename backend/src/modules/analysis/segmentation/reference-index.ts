/**
 * PHASE 1C — definition and internal-reference indexes.
 *
 * Runs over the canonical structural nodes (§Phase 1B) and produces:
 *   - a definition index keyed by defined term → definition span id
 *   - a reference index keyed by source span id → { referenceText, resolution }
 *
 * The index is diagnostic in Phase 1C: it lets later phases resolve
 * "Appendix 1", "clause 6.4", or "Term" to canonical spans without guessing.
 * Nothing here changes retrieval, verification, status, or rendering.
 */

import type { StructuralNode } from "./structural-nodes.js";

export interface DefinitionIndexEntry {
  term: string;
  definitionSpanId: string;
  documentId: string;
}

export type ReferenceResolutionState =
  | "resolved_internal"
  | "unresolved_external"
  | "ambiguous"
  | "unresolved";

export interface ReferenceRecord {
  sourceSpanId: string;
  documentId: string;
  referenceText: string;
  referenceKind:
    | "clause"
    | "section"
    | "article"
    | "annex"
    | "appendix"
    | "schedule"
    | "table"
    | "exhibit"
    | "defined_term";
  targetSpanIds: string[];
  state: ReferenceResolutionState;
  /** Full context of the referring passage — for reviewer diagnostics. */
  sampleText: string;
}

const REF_PATTERNS: Array<{
  kind: ReferenceRecord["referenceKind"];
  regex: RegExp;
  labelGroup: number;
}> = [
  { kind: "clause", regex: /\bclause\s+(\d+(?:\.\d+)*)\b/gi, labelGroup: 1 },
  { kind: "section", regex: /\bsection\s+(\d+(?:\.\d+)*)\b/gi, labelGroup: 1 },
  { kind: "article", regex: /\barticle\s+(\d+(?:\.\d+)*)\b/gi, labelGroup: 1 },
  { kind: "appendix", regex: /\bappendix\s+([A-Z0-9]+)\b/gi, labelGroup: 1 },
  { kind: "schedule", regex: /\bschedule\s+([A-Z0-9]+)\b/gi, labelGroup: 1 },
  { kind: "annex", regex: /\bannex(?:ure)?\s+([A-Z0-9]+)\b/gi, labelGroup: 1 },
  { kind: "table", regex: /\btable\s+([A-Z0-9]+)\b/gi, labelGroup: 1 },
  { kind: "exhibit", regex: /\bexhibit\s+([A-Z0-9]+)\b/gi, labelGroup: 1 },
];

export interface BuildIndexResult {
  definitions: DefinitionIndexEntry[];
  references: ReferenceRecord[];
}

export function buildReferenceIndex(
  nodes: StructuralNode[]
): BuildIndexResult {
  const definitions: DefinitionIndexEntry[] = nodes
    .filter((n) => n.kind === "definition" && n.definedTerm)
    .map((n) => ({
      term: n.definedTerm!,
      definitionSpanId: n.spanId,
      documentId: n.documentId,
    }));
  const definitionByTerm = new Map<string, DefinitionIndexEntry[]>();
  for (const d of definitions) {
    const key = d.term.toLowerCase();
    const list = definitionByTerm.get(key) ?? [];
    list.push(d);
    definitionByTerm.set(key, list);
  }

  // Build per-kind label → node[] lookups from container nodes.
  const containerIndex = new Map<string, StructuralNode[]>();
  for (const n of nodes) {
    if (
      n.kind === "appendix" ||
      n.kind === "schedule" ||
      n.kind === "section" ||
      n.kind === "clause" ||
      n.kind === "table"
    ) {
      const label = extractContainerLabel(n);
      if (!label) continue;
      const key = `${n.kind}:${label.toLowerCase()}`;
      const list = containerIndex.get(key) ?? [];
      list.push(n);
      containerIndex.set(key, list);
    }
  }

  const references: ReferenceRecord[] = [];
  for (const node of nodes) {
    if (node.kind === "document" || node.kind === "table") continue;
    const text = node.rawText;
    if (!text) continue;
    for (const pattern of REF_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.regex.exec(text)) !== null) {
        const label = m[pattern.labelGroup];
        if (!label) continue;
        const referenceText = m[0];
        // Skip self-references — a clause node referring to its own number.
        if (
          (pattern.kind === "clause" || pattern.kind === "section") &&
          node.structuralPath.endsWith(`/${pattern.kind}-${label}`)
        ) {
          continue;
        }
        const lookupKind =
          pattern.kind === "article" ? "clause" : pattern.kind;
        const targets = containerIndex.get(`${lookupKind}:${label.toLowerCase()}`) ?? [];
        const record = classify(node, referenceText, pattern.kind, targets);
        references.push(record);
      }
    }
    // Defined-term references: look for capitalized quoted or bare uses of
    // known terms inside body text.
    for (const [termKey, entries] of definitionByTerm) {
      if (entries.length === 0) continue;
      // Case-sensitive presence: definitions typically capitalize the term.
      const useRegex = new RegExp(
        `\\b${escapeRegex(entries[0].term)}\\b`,
        "g"
      );
      let dm: RegExpExecArray | null;
      while ((dm = useRegex.exec(text)) !== null) {
        // Skip the definition node's own text so a term does not reference
        // its own definition.
        if (node.kind === "definition" && node.definedTerm?.toLowerCase() === termKey) continue;
        const targetIds = entries.map((e) => e.definitionSpanId);
        references.push(classify(node, dm[0], "defined_term", entries.map((e) => ({
          spanId: e.definitionSpanId,
          kind: "definition" as const,
          documentId: e.documentId,
        } as unknown as StructuralNode))));
        // Only emit one reference per use.
        void targetIds;
      }
    }
  }
  return { definitions, references };
}

function classify(
  source: StructuralNode,
  referenceText: string,
  kind: ReferenceRecord["referenceKind"],
  targets: StructuralNode[]
): ReferenceRecord {
  const uniqueTargets = Array.from(new Set(targets.map((t) => t.spanId)));
  let state: ReferenceResolutionState;
  if (uniqueTargets.length === 1) state = "resolved_internal";
  else if (uniqueTargets.length > 1) state = "ambiguous";
  else state = "unresolved";
  return {
    sourceSpanId: source.spanId,
    documentId: source.documentId,
    referenceText,
    referenceKind: kind,
    targetSpanIds: uniqueTargets,
    state,
    sampleText: source.normalizedText.slice(0, 160),
  };
}

function extractContainerLabel(n: StructuralNode): string | null {
  const path = n.structuralPath;
  if (n.kind === "appendix" || n.kind === "schedule") {
    // path segment looks like ".../appendix-1" or ".../schedule-a"; the label
    // is the last hyphenated token.
    const seg = path.split("/").pop() ?? "";
    const parts = seg.split("-");
    return parts.slice(1).join("-") || null;
  }
  if (n.kind === "clause") {
    const seg = path.split("/").pop() ?? "";
    return seg.replace(/^clause-/, "") || null;
  }
  if (n.kind === "section") {
    const seg = path.split("/").pop() ?? "";
    return seg || null;
  }
  if (n.kind === "table") {
    const seg = path.split("/").pop() ?? "";
    const m = /table@(\d+)/.exec(seg);
    return m ? m[1] : null;
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
