/**
 * PHASE 1B — canonical structural-node graph.
 *
 * Builds a side-channel node graph for each document without changing the
 * legacy `segments` array (retrieval/verification/status/rendering stay on
 * the old path per plan §Phase 1B "Do not change …").
 *
 * Every node carries the fields the plan requires:
 *   spanId, documentId, kind, structuralPath, parentSpanId, order,
 *   rawText, normalizedText, sourceOffsets ([start, end)), contentHash.
 *
 * Appendix / schedule bodies stay inside their structural parent until the
 * next true peer boundary (another appendix/schedule/top-level heading).
 */

import crypto from "crypto";
import type { SegmentedDocument } from "../models/document-workspace.js";

export type StructuralNodeKind =
  | "document"
  | "section"
  | "clause"
  | "paragraph"
  | "definition"
  | "table"
  | "table_row"
  | "table_cell"
  | "list"
  | "list_item"
  | "appendix"
  | "schedule"
  | "heading";

export interface StructuralNode {
  spanId: string;
  documentId: string;
  kind: StructuralNodeKind;
  structuralPath: string;
  parentSpanId: string | null;
  order: number;
  rawText: string;
  normalizedText: string;
  sourceOffsets: [number, number];
  contentHash: string;
  /** Present on `definition` nodes — the defined term the node introduces. */
  definedTerm?: string;
}

interface BuildOptions {
  documentId: string;
  fullText: string;
}

const APPENDIX_HEAD =
  /^(?<kind>appendix|schedule|annex(?:ure)?|exhibit)\s+(?<label>[A-Z0-9][A-Z0-9.\-]*)(?:\s*[-:—]?\s*(?<title>.{0,120}))?$/i;
const HEADING_LINE = /^(?:#{1,3}\s+.+|[A-Z][A-Z0-9 \-/]{6,}|Article\s+\d+[.:)].*)$/;
const NUMBERED_CLAUSE = /^(?<num>\d+(?:\.\d+)*)[.)]\s+(?<rest>.+)$/;
// Bullet glyphs seen in real DOCX-derived text: hyphen, asterisk, U+2022 BULLET,
// U+25CF BLACK CIRCLE, U+25E6 WHITE BULLET, U+2043 HYPHEN BULLET, U+00B7 MIDDLE
// DOT, U+2219 BULLET OPERATOR, U+25AA/U+25AB SMALL SQUARES. Missing any of
// these silently drops the bullet body into a paragraph node with the wrong
// parent, which is the exact defect that hid Bitrix Appendix 1's category list.
const LIST_ITEM =
  /^(?:[\-*•●◦⁃·∙▪▫]|\(?[a-zA-Z0-9]{1,3}[.)])\s+/;
const DEFINITION_INLINE =
  /(?:^|\n|\.\s+)["“]?(?<term>[A-Z][A-Za-z0-9 /\-]{1,60}?)["”]?\s+(?:means|shall mean|refers to)\b/g;

function shortHash(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 12);
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Reconstruct the DOCX-injected tables from the persisted plaintext. */
function detectTables(fullText: string): Array<{
  startOffset: number;
  endOffset: number;
  rows: Array<{ startOffset: number; endOffset: number; cells: Array<{ startOffset: number; endOffset: number; rawText: string }> }>;
}> {
  const lines = fullText.split(/\n/);
  const lineStarts: number[] = new Array(lines.length);
  let cursor = 0;
  for (let i = 0; i < lines.length; i++) {
    lineStarts[i] = cursor;
    cursor += lines[i].length + 1;
  }
  const tables: ReturnType<typeof detectTables> = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].includes("\t")) {
      i += 1;
      continue;
    }
    const width = lines[i].split("\t").length;
    let j = i + 1;
    while (
      j < lines.length &&
      lines[j].includes("\t") &&
      lines[j].split("\t").length === width
    ) {
      j += 1;
    }
    if (j - i >= 2) {
      const rows = [];
      for (let r = i; r < j; r++) {
        const rowStart = lineStarts[r];
        const rowEnd = rowStart + lines[r].length;
        const cellsRaw = lines[r].split("\t");
        let cellCursor = rowStart;
        const cells = cellsRaw.map((c) => {
          const start = cellCursor;
          const end = start + c.length;
          cellCursor = end + 1;
          return { startOffset: start, endOffset: end, rawText: c };
        });
        rows.push({ startOffset: rowStart, endOffset: rowEnd, cells });
      }
      tables.push({
        startOffset: rows[0].startOffset,
        endOffset: rows[rows.length - 1].endOffset,
        rows,
      });
    }
    i = j;
  }
  return tables;
}

/** Build the canonical structural-node graph for one document. */
export function buildStructuralNodes(opts: BuildOptions): StructuralNode[] {
  const { documentId, fullText } = opts;
  const nodes: StructuralNode[] = [];
  const tables = detectTables(fullText);
  const tableStarts = new Map<number, (typeof tables)[number]>();
  for (const t of tables) tableStarts.set(t.startOffset, t);
  const tableRanges = tables.map((t) => [t.startOffset, t.endOffset] as const);
  const insideTable = (offset: number): boolean =>
    tableRanges.some(([a, b]) => offset >= a && offset < b);

  let orderCounter = 0;
  const nextOrder = () => orderCounter++;
  const rootPath = "document";
  const rootRaw = fullText;
  const rootId = `${documentId}::document::${shortHash(rootRaw.slice(0, 4000))}`;
  nodes.push({
    spanId: rootId,
    documentId,
    kind: "document",
    structuralPath: rootPath,
    parentSpanId: null,
    order: nextOrder(),
    rawText: rootRaw,
    normalizedText: normalize(rootRaw).slice(0, 2000),
    sourceOffsets: [0, fullText.length],
    contentHash: shortHash(rootRaw),
  });

  const lines = fullText.split(/\n/);
  const lineStarts: number[] = new Array(lines.length);
  let cursor = 0;
  for (let i = 0; i < lines.length; i++) {
    lineStarts[i] = cursor;
    cursor += lines[i].length + 1;
  }

  // Two-pass: (1) determine section/appendix boundaries so appendix bodies
  // remain inside their parent, then (2) emit nodes in document order.
  interface Boundary {
    lineIndex: number;
    kind: "section" | "appendix" | "schedule";
    label: string;
    heading: string;
  }
  const boundaries: Boundary[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (insideTable(lineStarts[i])) continue;
    const app = APPENDIX_HEAD.exec(line);
    if (app && app.groups) {
      const kindWord = (app.groups.kind ?? "").toLowerCase();
      const kind: Boundary["kind"] = kindWord.startsWith("schedule")
        ? "schedule"
        : "appendix";
      boundaries.push({
        lineIndex: i,
        kind,
        label: `${kindWord} ${app.groups.label}`.trim(),
        heading: line,
      });
      continue;
    }
    if (HEADING_LINE.test(line) && line.length < 120) {
      boundaries.push({
        lineIndex: i,
        kind: "section",
        label: line.slice(0, 80),
        heading: line,
      });
    }
  }

  interface ContainerFrame {
    node: StructuralNode;
    startLine: number;
    endLine: number;
  }

  const rootFrame: ContainerFrame = {
    node: nodes[0],
    startLine: 0,
    endLine: lines.length,
  };
  /**
   * Deterministic parent lookup — for any line index, return the innermost
   * container frame whose [startLine, endLine) range contains it. This replaces
   * a mutable stack that was reset before the body-node walk, which caused
   * every clause/list/paragraph to be re-parented to the document root
   * (Bitrix Appendix 1's category list had no descendants for this reason).
   */
  const containerFrames: ContainerFrame[] = [rootFrame];
  const findParent = (lineIdx: number): ContainerFrame => {
    let best = rootFrame;
    for (const frame of containerFrames) {
      if (
        lineIdx >= frame.startLine &&
        lineIdx < frame.endLine &&
        // Deeper frame wins (smaller line range).
        frame.endLine - frame.startLine <= best.endLine - best.startLine
      ) {
        best = frame;
      }
    }
    return best;
  };

  // Precompute end-lines for each container boundary (appendix/schedule bodies
  // extend to the next appendix/schedule; a plain section extends to the next
  // section OR to the next appendix/schedule).
  const boundaryEnds: number[] = boundaries.map((b, idx) => {
    if (b.kind === "appendix" || b.kind === "schedule") {
      for (let k = idx + 1; k < boundaries.length; k++) {
        if (boundaries[k].kind === "appendix" || boundaries[k].kind === "schedule") {
          return boundaries[k].lineIndex;
        }
      }
      return lines.length;
    }
    return idx + 1 < boundaries.length ? boundaries[idx + 1].lineIndex : lines.length;
  });

  const emitContainerNodes = () => {
    boundaries.forEach((b, idx) => {
      const startOff = lineStarts[b.lineIndex];
      const endOff =
        boundaryEnds[idx] >= lines.length
          ? fullText.length
          : lineStarts[boundaryEnds[idx]];
      const rawText = fullText.slice(startOff, endOff);
      const kind: StructuralNodeKind = b.kind;
      const parent = findParent(b.lineIndex);
      const path = `${parent.node.structuralPath}/${slug(b.label)}`;
      const node: StructuralNode = {
        spanId: `${documentId}::${kind}::${shortHash(`${path}:${startOff}`)}`,
        documentId,
        kind,
        structuralPath: path,
        parentSpanId: parent.node.spanId,
        order: nextOrder(),
        rawText,
        normalizedText: normalize(rawText).slice(0, 400),
        sourceOffsets: [startOff, endOff],
        contentHash: shortHash(rawText),
      };
      nodes.push(node);
      containerFrames.push({
        node,
        startLine: b.lineIndex,
        endLine: boundaryEnds[idx],
      });
      // Also emit the heading node so a reader can point at just the title.
      const headingRaw = lines[b.lineIndex];
      const headingStart = lineStarts[b.lineIndex];
      const headingEnd = headingStart + headingRaw.length;
      nodes.push({
        spanId: `${documentId}::heading::${shortHash(`${path}:heading`)}`,
        documentId,
        kind: "heading",
        structuralPath: `${path}/heading`,
        parentSpanId: node.spanId,
        order: nextOrder(),
        rawText: headingRaw,
        normalizedText: normalize(headingRaw),
        sourceOffsets: [headingStart, headingEnd],
        contentHash: shortHash(headingRaw),
      });
    });
  };
  emitContainerNodes();

  // Now walk lines and emit clause/paragraph/list/list_item/table nodes with
  // the correct parent. `findParent` is a pure lookup over `containerFrames`,
  // so no stack state carries between iterations.
  let listFrame: { node: StructuralNode; endLine: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      if (listFrame && i >= listFrame.endLine) listFrame = null;
      continue;
    }
    const startOff = lineStarts[i];
    const endOff = startOff + line.length;

    // If this line is a boundary heading we already emitted, just move on
    // (the heading node was created above).
    if (boundaries.some((b) => b.lineIndex === i)) {
      listFrame = null;
      continue;
    }

    // Tables: emit once at the first row of a run, skip subsequent rows.
    const table = tableStarts.get(startOff);
    if (table) {
      const parent = findParent(i);
      const tableRaw = fullText.slice(table.startOffset, table.endOffset);
      const tableNode: StructuralNode = {
        spanId: `${documentId}::table::${shortHash(`${parent.node.structuralPath}:${table.startOffset}`)}`,
        documentId,
        kind: "table",
        structuralPath: `${parent.node.structuralPath}/table@${table.startOffset}`,
        parentSpanId: parent.node.spanId,
        order: nextOrder(),
        rawText: tableRaw,
        normalizedText: normalize(tableRaw).slice(0, 400),
        sourceOffsets: [table.startOffset, table.endOffset],
        contentHash: shortHash(tableRaw),
      };
      nodes.push(tableNode);
      let rowIdx = 0;
      for (const row of table.rows) {
        const rowRaw = fullText.slice(row.startOffset, row.endOffset);
        const rowNode: StructuralNode = {
          spanId: `${documentId}::table_row::${shortHash(`${tableNode.structuralPath}:${row.startOffset}`)}`,
          documentId,
          kind: "table_row",
          structuralPath: `${tableNode.structuralPath}/row-${rowIdx + 1}`,
          parentSpanId: tableNode.spanId,
          order: nextOrder(),
          rawText: rowRaw,
          normalizedText: normalize(rowRaw),
          sourceOffsets: [row.startOffset, row.endOffset],
          contentHash: shortHash(rowRaw),
        };
        nodes.push(rowNode);
        let cellIdx = 0;
        for (const cell of row.cells) {
          nodes.push({
            spanId: `${documentId}::table_cell::${shortHash(`${rowNode.structuralPath}:${cell.startOffset}`)}`,
            documentId,
            kind: "table_cell",
            structuralPath: `${rowNode.structuralPath}/cell-${cellIdx + 1}`,
            parentSpanId: rowNode.spanId,
            order: nextOrder(),
            rawText: cell.rawText,
            normalizedText: normalize(cell.rawText),
            sourceOffsets: [cell.startOffset, cell.endOffset],
            contentHash: shortHash(cell.rawText),
          });
          cellIdx += 1;
        }
        rowIdx += 1;
      }
      // Skip past the table body.
      // Advance i to the last row's line index.
      const lastRowLine =
        Math.min(...lines.map((_, idx) => idx).filter((idx) => lineStarts[idx] === table.rows[table.rows.length - 1].startOffset));
      if (Number.isFinite(lastRowLine)) i = lastRowLine;
      listFrame = null;
      continue;
    }

    const parent = findParent(i);
    const numbered = trimmed.match(NUMBERED_CLAUSE);
    if (numbered && numbered.groups) {
      const num = numbered.groups.num;
      nodes.push({
        spanId: `${documentId}::clause::${shortHash(`${parent.node.structuralPath}:${startOff}`)}`,
        documentId,
        kind: "clause",
        structuralPath: `${parent.node.structuralPath}/clause-${num}`,
        parentSpanId: parent.node.spanId,
        order: nextOrder(),
        rawText: line,
        normalizedText: normalize(line),
        sourceOffsets: [startOff, endOff],
        contentHash: shortHash(line),
      });
      listFrame = null;
      continue;
    }

    if (LIST_ITEM.test(trimmed)) {
      if (!listFrame || i >= listFrame.endLine) {
        // Open a new list container spanning contiguous list-item lines.
        let k = i;
        while (
          k < lines.length &&
          (lines[k].trim() === "" || LIST_ITEM.test(lines[k].trim()))
        ) {
          k += 1;
        }
        const listStart = startOff;
        const listEnd = lineStarts[k] > 0 ? lineStarts[k] : fullText.length;
        const listRaw = fullText.slice(listStart, listEnd);
        const listNode: StructuralNode = {
          spanId: `${documentId}::list::${shortHash(`${parent.node.structuralPath}:${listStart}`)}`,
          documentId,
          kind: "list",
          structuralPath: `${parent.node.structuralPath}/list@${listStart}`,
          parentSpanId: parent.node.spanId,
          order: nextOrder(),
          rawText: listRaw,
          normalizedText: normalize(listRaw).slice(0, 400),
          sourceOffsets: [listStart, listEnd],
          contentHash: shortHash(listRaw),
        };
        nodes.push(listNode);
        listFrame = { node: listNode, endLine: k };
      }
      nodes.push({
        spanId: `${documentId}::list_item::${shortHash(`${listFrame!.node.structuralPath}:${startOff}`)}`,
        documentId,
        kind: "list_item",
        structuralPath: `${listFrame!.node.structuralPath}/item@${startOff}`,
        parentSpanId: listFrame!.node.spanId,
        order: nextOrder(),
        rawText: line,
        normalizedText: normalize(line),
        sourceOffsets: [startOff, endOff],
        contentHash: shortHash(line),
      });
      continue;
    }

    // Paragraph fallback.
    nodes.push({
      spanId: `${documentId}::paragraph::${shortHash(`${parent.node.structuralPath}:${startOff}`)}`,
      documentId,
      kind: "paragraph",
      structuralPath: `${parent.node.structuralPath}/para@${startOff}`,
      parentSpanId: parent.node.spanId,
      order: nextOrder(),
      rawText: line,
      normalizedText: normalize(line),
      sourceOffsets: [startOff, endOff],
      contentHash: shortHash(line),
    });
  }

  // Definition nodes derived from `"Term" means …` matches. Attach as
  // children of the enclosing container.
  DEFINITION_INLINE.lastIndex = 0;
  let defMatch: RegExpExecArray | null;
  while ((defMatch = DEFINITION_INLINE.exec(fullText)) !== null) {
    const term = (defMatch.groups?.term ?? "").trim();
    if (!term) continue;
    const start = defMatch.index;
    // Extend to the next paragraph/line end.
    const rest = fullText.slice(start);
    const endMatch = /\n\s*\n|\.\s+[A-Z]/.exec(rest);
    const end = start + (endMatch ? endMatch.index + 1 : Math.min(400, rest.length));
    const lineIdx = lineStarts.findIndex((s, idx) => s <= start && start < s + lines[idx].length + 1);
    const parent = findParent(Math.max(0, lineIdx));
    const raw = fullText.slice(start, end);
    nodes.push({
      spanId: `${documentId}::definition::${shortHash(`${term}:${start}`)}`,
      documentId,
      kind: "definition",
      structuralPath: `${parent.node.structuralPath}/def-${slug(term)}`,
      parentSpanId: parent.node.spanId,
      order: nextOrder(),
      rawText: raw,
      normalizedText: normalize(raw),
      sourceOffsets: [start, end],
      contentHash: shortHash(raw),
      definedTerm: term,
    });
  }

  return nodes;
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "node"
  );
}

/** Convenience — build nodes for a workspace document. */
export function buildStructuralNodesForDoc(doc: SegmentedDocument): StructuralNode[] {
  return buildStructuralNodes({
    documentId: doc.docId,
    fullText: doc.fullText ?? "",
  });
}
