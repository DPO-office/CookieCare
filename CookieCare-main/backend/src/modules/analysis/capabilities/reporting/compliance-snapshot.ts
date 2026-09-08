import { createHash } from "node:crypto";
import type { AnalysisState } from "../../models/analysis-state.js";
import type {
  ComplianceEvidence,
  ComplianceOutstandingCheck,
  ComplianceReportSnapshot,
} from "../../models/compliance-report.js";
import type { StructuralNode } from "../../segmentation/structural-nodes.js";
import type { RenderedEvidence, RenderedReport } from "../act/phase7-render.js";

type Range = [number, number];
interface SourceDocument {
  documentId: string;
  title: string;
  text: string;
  nodes: StructuralNode[];
}

function validRange(range: Range, length: number): boolean {
  return Array.isArray(range) && range.length === 2 &&
    Number.isInteger(range[0]) && Number.isInteger(range[1]) &&
    range[0] >= 0 && range[0] < range[1] && range[1] <= length;
}

function contains(outer: Range, inner: Range): boolean {
  return outer[0] <= inner[0] && inner[1] <= outer[1];
}

function narrowest(nodes: StructuralNode[]): StructuralNode | undefined {
  return [...nodes].sort((a, b) =>
    (a.sourceOffsets[1] - a.sourceOffsets[0]) -
    (b.sourceOffsets[1] - b.sourceOffsets[0]) || a.order - b.order
  )[0];
}

/** Recover only inside an identified source node, never by searching all documents. */
function canonicalNode(evidence: RenderedEvidence, doc: SourceDocument): StructuralNode | undefined {
  const byId = doc.nodes.filter((node) => node.spanId === evidence.spanId);
  if (byId.length) return byId.length === 1 ? byId[0] : undefined;

  // Phase 3 seed IDs encode the original retrieval range, not a clause number.
  const prefix = `${doc.documentId}::section::`;
  if (evidence.spanId.startsWith(prefix)) {
    const match = /^(\d+)-(\d+)$/.exec(evidence.spanId.slice(prefix.length));
    if (match) {
      const range: Range = [Number(match[1]), Number(match[2])];
      if (!validRange(range, doc.text.length)) return undefined;
      return narrowest(doc.nodes.filter((node) => contains(node.sourceOffsets, range)));
    }
  }

  const byPath = doc.nodes.filter((node) => node.kind !== "document" &&
    node.structuralPath === evidence.structuralPath);
  return byPath.length === 1 ? byPath[0] : undefined;
}

function verifiedRange(evidence: RenderedEvidence, doc: SourceDocument): Range | undefined {
  if (typeof evidence.quote !== "string" || !evidence.quote.trim()) return undefined;
  if (validRange(evidence.charRange, doc.text.length) &&
      doc.text.slice(...evidence.charRange) === evidence.quote) {
    return [...evidence.charRange];
  }
  if (validRange(evidence.charRange, doc.text.length)) {
    const source = doc.text.slice(...evidence.charRange);
    if (normalizedSource(source).text === normalizedSource(evidence.quote).text) {
      const local = locateQuote(evidence.quote, source);
      if (local) return [evidence.charRange[0] + local[0], evidence.charRange[0] + local[1]];
    }
  }

  const node = canonicalNode(evidence, doc);
  if (!node) return undefined;
  // Phase 4b emits bundle-item ranges, often wider than the quote. When that
  // range is still inside the canonical node it is the most specific scope.
  const scope = validRange(evidence.charRange, doc.text.length) &&
    contains(node.sourceOffsets, evidence.charRange) ? evidence.charRange : node.sourceOffsets;
  const scoped = locateQuote(evidence.quote, doc.text.slice(...scope));
  if (scoped) return [scope[0] + scoped[0], scope[0] + scoped[1]];
  if (scope === node.sourceOffsets) return undefined;
  const recovered = locateQuote(evidence.quote, node.rawText);
  return recovered ? [node.sourceOffsets[0] + recovered[0], node.sourceOffsets[0] + recovered[1]] : undefined;
}

/** Phase 4b's normalization, with every normalized UTF-16 unit mapped to source. */
function normalizedSource(raw: string): { text: string; starts: number[]; ends: number[] } {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;
  for (const character of raw) {
    const end = offset + character.length;
    if (/\s/.test(character)) {
      if (text.endsWith(" ")) ends[ends.length - 1] = end;
      else if (text) {
        text += " ";
        starts.push(offset);
        ends.push(end);
      }
    } else {
      const normalized = character
        .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
        .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
        .replace(/[\u2013\u2014]/g, "-")
        .replace(/\u2026/g, "...");
      text += normalized;
      // Lowercasing can expand a code point (for example U+0130).
      for (let i = 0; i < normalized.toLowerCase().length; i++) {
        starts.push(offset);
        ends.push(end);
      }
    }
    offset = end;
  }
  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    starts.pop();
    ends.pop();
  }
  // Whole-string lowercase preserves context-sensitive casing (Greek sigma).
  return { text: text.toLowerCase(), starts, ends };
}

function locateQuote(quote: string, source: string): Range | undefined {
  const exact = source.indexOf(quote);
  if (exact >= 0) {
    return source.indexOf(quote, exact + 1) < 0 ? [exact, exact + quote.length] : undefined;
  }
  const wanted = normalizedSource(quote).text;
  const mapped = normalizedSource(source);
  if (!wanted || mapped.text.length !== mapped.starts.length) return undefined;
  const first = mapped.text.indexOf(wanted);
  if (first < 0 || mapped.text.indexOf(wanted, first + 1) >= 0) return undefined;
  const last = first + wanted.length - 1;
  // A partial match inside a normalized expansion (e.g. '.' inside '…')
  // cannot identify a source substring with the same normalized contents.
  if ((first > 0 && mapped.starts[first] === mapped.starts[first - 1]) ||
      (last + 1 < mapped.ends.length && mapped.ends[last] === mapped.ends[last + 1])) return undefined;
  const range: Range = [mapped.starts[first], mapped.ends[last]];
  return normalizedSource(source.slice(...range)).text === wanted ? range : undefined;
}

interface SourceLabel {
  text: string;
  kind: "number" | "subpart" | "container" | "heading";
}

/** Inspect a source line's start only: later headings/references are quote content. */
function sourceLabel(raw: string, kind: StructuralNode["kind"]): SourceLabel | undefined {
  const line = raw.split(/\r?\n/, 1)[0].trim();
  const text = line.replace(/^#{1,6}\s+/, "");
  const explicit = /^(Section|Clause|Article|Paragraph)\s+(\d+(?:\.\d+)*(?:\([a-z0-9ivx]+\))*)(?=$|[\s.:;–—-])/i.exec(text);
  if (explicit) {
    const word = explicit[1][0].toUpperCase() + explicit[1].slice(1).toLowerCase();
    return { text: `${word} ${explicit[2]}`, kind: "number" };
  }
  const container = /^(Schedule|Appendix|Annex(?:ure)?|Exhibit)\s+([A-Z0-9]+(?:[.-][A-Z0-9]+)*)(?=$|[\s:.)–—-])/i.exec(text);
  if (container) {
    const word = container[1][0].toUpperCase() + container[1].slice(1).toLowerCase();
    return { text: `${word} ${container[2]}`, kind: "container" };
  }
  const number = /^(\d+(?:\.\d+)*(?:\([a-z0-9ivx]+\))*)(?:[.)])?(?=$|\s)\s*/i.exec(text);
  if (number && !["table", "table_row", "table_cell", "list", "document"].includes(kind)) {
    return { text: `${kind === "section" ? "Section" : "Clause"} ${number[1]}`, kind: "number" };
  }
  const subpart = /^(\([a-z0-9ivx]+\))(?:\s|$)|^([a-z])\)(?:\s|$)/i.exec(text);
  if (subpart && kind !== "list") {
    return { text: subpart[1] ?? `(${subpart[2]})`, kind: "subpart" };
  }
  if (text && (kind === "heading" || kind === "section" || /^#{1,6}\s+/.test(line))) {
    return { text: `Heading “${text}”`, kind: "heading" };
  }
  return undefined;
}

function pointerFor(doc: SourceDocument, range: Range, node?: StructuralNode): string {
  const chain: StructuralNode[] = [];
  const seen = new Set<string>();
  let current = node;
  while (current && !seen.has(current.spanId)) {
    seen.add(current.spanId);
    if (current.kind !== "document") chain.unshift(current);
    const child = current;
    const parents = doc.nodes.filter((candidate) => candidate.spanId === child.parentSpanId &&
      contains(candidate.sourceOffsets, child.sourceOffsets));
    current = parents.length === 1 ? parents[0] : undefined;
  }
  const labels: SourceLabel[] = [];
  for (const ancestor of chain) {
    if (["list", "table", "table_row", "table_cell"].includes(ancestor.kind)) continue;
    const label = sourceLabel(ancestor.rawText, ancestor.kind);
    if (label) labels.push(label);
  }

  // A quote can begin deep inside a container. Only its actual starting line
  // may refine the pointer; scanning the entire quote could cite a later clause.
  const lineStart = doc.text.lastIndexOf("\n", range[0] - 1) + 1;
  if (!node || lineStart > node.sourceOffsets[0] || node.kind === "document") {
    const label = sourceLabel(doc.text.slice(lineStart), "paragraph");
    if (label) labels.push(label);
  }
  const hasNumber = labels.some((label) => label.kind === "number");
  const closestHeading = [...labels].reverse().find((label) => label.kind === "heading");
  const parts: SourceLabel[] = [];
  for (const label of labels) {
    // Numbered locations stand on their own except for authored containers.
    // For unnumbered text, only the nearest actual heading is useful context.
    if (label.kind === "heading" && (hasNumber || label !== closestHeading)) continue;
    const previous = parts[parts.length - 1];
    if (previous?.text === label.text) continue;
    if (label.kind === "subpart" && previous?.kind === "number") {
      previous.text += label.text;
    } else if (label.kind === "subpart") {
      parts.push({ text: `Item ${label.text}`, kind: "subpart" });
    } else {
      parts.push({ ...label });
    }
  }
  if (parts.length) return parts.map((part) => part.text).join(" / ");
  // Use only the opening source line so a later heading inside the quote
  // cannot become its location. Offsets remain in charRange for navigation.
  const openingLine = doc.text.slice(...range).trim().split(/\r?\n/, 1)[0];
  const characters = Array.from(openingLine.replace(/\s+/g, " "));
  const excerpt = characters.slice(0, 96).join("");
  return `Unnumbered passage: “${excerpt}${characters.length > 96 ? "…" : ""}”`;
}

/** A deterministic, detached reporting projection; assessment decisions stay locked. */
export function buildComplianceSnapshot(
  state: AnalysisState,
  report: RenderedReport,
  nodesByDoc: Map<string, StructuralNode[]>,
  outstanding: ComplianceOutstandingCheck[],
  dependencies: Array<{ requirementId: string; reference: string; reason: string }>,
): ComplianceReportSnapshot {
  const titles = state.workspace.documents.map((doc, index) =>
    [doc.title, state.request.documentTitles?.[doc.docId]]
      .map((title) => title?.trim())
      .find((title) => title && title !== doc.docId) || `Reviewed document ${index + 1}`);
  const documents = state.workspace.documents.map((doc, index) => ({
    documentId: doc.docId,
    title: titles.filter((title) => title.toLowerCase() === titles[index].toLowerCase()).length > 1
      ? `${titles[index]} (document ${index + 1})` : titles[index],
    contentHash: createHash("sha256").update(doc.fullText).digest("hex"),
    // PLAN resolves explicit request roles into the workspace; keep the same
    // precedence if a caller supplies a workspace with an older role.
    role: state.request.documentRoles?.[doc.docId] ?? doc.role,
  }));
  const sources: SourceDocument[] = state.workspace.documents.map((doc, index) => ({
    documentId: doc.docId,
    title: documents[index].title,
    text: doc.fullText,
    nodes: (nodesByDoc.get(doc.docId) ?? []).filter((node) =>
      node.documentId === doc.docId && validRange(node.sourceOffsets, doc.fullText.length) &&
      doc.fullText.slice(...node.sourceOffsets) === node.rawText),
  }));
  const limitations: ComplianceReportSnapshot["limitations"] = [];
  const addLimitation = (requirementId: string, message: string) => {
    const existing = limitations.find((item) => item.message === message);
    if (existing) {
      if (!existing.requirementIds.includes(requirementId)) existing.requirementIds.push(requirementId);
    } else {
      limitations.push({ id: `L${limitations.length + 1}`, requirementIds: [requirementId], message });
    }
  };
  const citations = new Map<string, string>();
  const rows = report.rows.map((row) => {
    const evidence: ComplianceEvidence[] = [];
    for (const original of row.evidence) {
      const spanDocs = sources.filter((doc) =>
        original.spanId.startsWith(`${doc.documentId}::`) ||
        doc.nodes.some((node) => node.spanId === original.spanId));
      const candidates = original.documentId !== undefined
        ? sources.filter((doc) => doc.documentId === original.documentId)
        : spanDocs;
      const doc = candidates.length === 1 ? candidates[0] : undefined;
      if (!doc || spanDocs.some((source) => source.documentId !== doc.documentId) ||
          (original.spanId.includes("::") && !original.spanId.startsWith(`${doc.documentId}::`))) {
        addLimitation(row.requirementId,
          `Evidence excluded for ${row.title}: its source document is missing, ambiguous, or inconsistent with its locator.`);
        continue;
      }
      const range = verifiedRange(original, doc);
      if (!range) {
        addLimitation(row.requirementId,
          `Evidence excluded for ${row.title}: the quote could not be verified at a unique source location. The original assessment status is retained.`);
        continue;
      }
      const node = narrowest(doc.nodes.filter((candidate) => contains(candidate.sourceOffsets, range)));
      const key = JSON.stringify([doc.documentId, ...range]);
      let citationId = citations.get(key);
      if (!citationId) {
        citationId = `E${citations.size + 1}`;
        citations.set(key, citationId);
      }
      evidence.push({
        spanId: original.spanId,
        quote: doc.text.slice(...range),
        structuralPath: node?.structuralPath ?? "document",
        charRange: range,
        citationId,
        documentId: doc.documentId,
        documentTitle: doc.title,
        pointer: pointerFor(doc, range, node),
      });
    }
    // Preserve caller-provided reviewedDocumentIds, including empty arrays
    // and absence findings. Evidence alone cannot establish review coverage.
    return { ...structuredClone(row), evidence };
  });
  for (const dependency of dependencies) {
    addLimitation(dependency.requirementId,
      `Unresolved dependency: ${dependency.reference}. ${dependency.reason}`);
  }
  const standard = state.intent?.standardConcept?.trim() || state.intent?.standard;
  const scope = `${standard && standard !== "none" ? `${standard}; ` : ""}Reviewed documents: ${documents.map((doc) => doc.title).join("; ") || "none"}.`;
  return {
    version: 1,
    instruction: state.request.instruction,
    scope,
    documents,
    rows,
    outstandingChecks: structuredClone(outstanding),
    limitations,
  };
}
