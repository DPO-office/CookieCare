/**
 * Shared text extraction utility.
 *
 * Uses pdf-parse-fork as the primary PDF parser. Some PDFs have corrupted or
 * non-standard cross-reference tables that cause pdf-parse-fork to throw
 * "bad XRef entry" (and similar errors). In those cases we fall back to
 * pdfjs-dist, which uses a more lenient parser and can recover from XRef issues.
 */

import pdf from "pdf-parse-fork";
import mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { DocumentInitParameters } from "pdfjs-dist/types/src/display/api.js";

/**
 * Extract all text from a PDF buffer using pdfjs-dist.
 * This is the fallback path for PDFs that pdf-parse-fork cannot handle.
 */
async function extractPdfWithPdfJs(buffer: Buffer): Promise<string> {
  const uint8Array = new Uint8Array(buffer);
  const params: DocumentInitParameters = {
    data: uint8Array,
    // Run without a worker thread — required in Node.js server context
    disableWorker: true,
    // Recover from XRef / structure errors rather than throwing
    stopAtErrors: false,
  } as any;
  const loadingTask = getDocument(params);
  const doc = await loadingTask.promise;

  const pageTexts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ");
    pageTexts.push(pageText);
  }

  return pageTexts.join("\n");
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/**
 * Flatten inline HTML inside a single table cell to a one-line string, so a
 * multi-paragraph cell does not fragment its row's label/value alignment.
 * PHASE 1A: `\n` produced by `<p>`/`<br>`/`<li>` INSIDE a cell becomes a space,
 * because the cell's row-level boundary is a tab, not a newline.
 */
function cellHtmlToText(cellHtml: string): string {
  const withBreaks = cellHtml
    .replace(/<\/(p|li|h[1-6])>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "");
  return decodeHtmlEntities(withBreaks).replace(/\s+/g, " ").trim();
}

interface DocxTableRecord {
  tableId: string;
  rowCount: number;
  cellCount: number;
  rows: Array<{
    rowId: string;
    cells: Array<{
      cellId: string;
      rawText: string;
      /** [start, end) offset of the cell in the returned normalized text. */
      charRange: [number, number];
    }>;
  }>;
}

/**
 * Convert one `<table>` block into the boundary-preserving plaintext form:
 * cells joined with `\t`, rows joined with `\n`. Empty cells produce empty
 * strings so `Label:\t\tValue` alignment is preserved (Phase 1A §Implementation
 * item 3). Returns both the rendered text and the structural record used later
 * for `compliance.ingest.table` / `compliance.ingest.table_row` events.
 *
 * `baseOffset` is the character offset where this table's text begins in the
 * enclosing document, so cell `charRange` is document-relative — the mapping
 * from normalized text back to the raw source location the plan requires.
 */
function convertTableToText(
  tableHtml: string,
  tableIndex: number,
  baseOffset: number
): { text: string; record: DocxTableRecord } {
  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  const rows: DocxTableRecord["rows"] = [];
  const renderedRows: string[] = [];
  const tableId = `T${tableIndex + 1}`;
  let cellCount = 0;
  let cursor = baseOffset;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    const rowInner = rowMatch[1] ?? "";
    const rowId = `${tableId}R${rows.length + 1}`;
    const cells: DocxTableRecord["rows"][number]["cells"] = [];
    const rowCellTexts: string[] = [];
    let cellMatch: RegExpExecArray | null;
    cellRegex.lastIndex = 0;
    while ((cellMatch = cellRegex.exec(rowInner)) !== null) {
      const rawText = cellHtmlToText(cellMatch[2] ?? "");
      const cellId = `${rowId}C${cells.length + 1}`;
      const start = cursor;
      const end = start + rawText.length;
      cells.push({ cellId, rawText, charRange: [start, end] });
      rowCellTexts.push(rawText);
      // Advance cursor by cell text + the `\t` separator that follows (if any).
      cursor = end + 1;
      cellCount += 1;
    }
    if (cells.length > 0) {
      // Undo the trailing `\t` advance — last cell in a row is followed by `\n`.
      cursor -= 1;
    }
    // Row-end newline in the enclosing document.
    cursor += 1;
    rows.push({ rowId, cells });
    renderedRows.push(rowCellTexts.join("\t"));
  }
  const text = renderedRows.join("\n");
  return {
    text,
    record: { tableId, rowCount: rows.length, cellCount, rows },
  };
}

/**
 * Turn mammoth's HTML output back into plain text, preserving paragraph,
 * heading, and list-item boundaries as newlines instead of losing them.
 *
 * PHASE 1A: tables are converted BEFORE tag-stripping so every cell/row has
 * an explicit boundary (`\t` between cells, `\n` between rows). See
 * `convertTableToText` for the per-table structural record returned alongside.
 */
export function htmlToStructuredText(
  html: string
): { text: string; tables: DocxTableRecord[] } {
  const tables: DocxTableRecord[] = [];

  // Two-pass: (1) extract every <table> block, rendering it to boundary-
  // preserving plaintext and remembering its position, then (2) stitch the
  // table plaintexts back into the surrounding document AFTER regular tag
  // stripping. This avoids inline <p>/<br> inside a cell fragmenting its row
  // and lets each table receive its final document-offset in one place.
  const tableRegex = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  const placeholders: Array<{ token: string; tableIndex: number }> = [];
  let tIdx = 0;
  const htmlWithPlaceholders = html.replace(tableRegex, (_match, inner: string) => {
    const token = `TBL_${tIdx}`;
    placeholders.push({ token, tableIndex: tIdx });
    // Render with a provisional baseOffset of 0; we rewrite offsets after the
    // final document text is assembled below.
    const rendered = convertTableToText(inner, tIdx, 0);
    tables.push(rendered.record);
    tIdx += 1;
    // Save the rendered text on the record so we can substitute later.
    (rendered.record as any).__renderedText = rendered.text;
    return token;
  });

  const nonTable = htmlWithPlaceholders
    .replace(/<\/(p|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  const decoded = decodeHtmlEntities(nonTable)
    .replace(/\n{3,}/g, "\n\n");

  // Substitute each table placeholder with its rendered text and rewrite
  // cell offsets to be document-relative (mapping from normalized text back
  // to raw source location, Phase 1A §Implementation item 5).
  let assembled = decoded;
  for (const { token, tableIndex } of placeholders) {
    const record = tables[tableIndex];
    const rendered: string = (record as any).__renderedText ?? "";
    delete (record as any).__renderedText;
    const at = assembled.indexOf(token);
    if (at < 0) continue;
    // Walk cells in row/column order and reassign document-relative ranges.
    let localCursor = at;
    for (const row of record.rows) {
      for (let i = 0; i < row.cells.length; i++) {
        const cell = row.cells[i];
        const cellLen = cell.rawText.length;
        cell.charRange = [localCursor, localCursor + cellLen];
        // Advance past the cell + the separator that follows (`\t` between
        // cells, `\n` at end of row).
        localCursor += cellLen + (i < row.cells.length - 1 ? 1 : 1);
      }
    }
    assembled = assembled.slice(0, at) + rendered + assembled.slice(at + token.length);
  }

  const text = assembled.trim();
  return { text, tables };
}

/**
 * Extract plaintext from a file buffer.
 *
 * @param buffer   Raw file bytes
 * @param mimeType MIME type of the file (e.g. "application/pdf")
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  if (mimeType === "application/pdf") {
    try {
      const data = await pdf(buffer);
      return data.text;
    } catch (primaryErr: any) {
      // pdf-parse-fork fails on PDFs with bad XRef tables, linearised PDFs,
      // and a handful of other non-standard structures. pdfjs-dist handles
      // these gracefully, so we retry with it.
      console.warn(
        "[extractText] pdf-parse-fork failed, retrying with pdfjs-dist:",
        primaryErr?.message ?? primaryErr
      );
      return extractPdfWithPdfJs(buffer);
    }
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    // mammoth.extractRawText() only inserts a newline between text runs it
    // recognizes as separate paragraphs. On some real-world docx files —
    // notably PDF-to-DOCX conversions — the underlying paragraph marks
    // themselves are coarse, so several logical clauses can share one Word
    // paragraph and collapse onto a single line, breaking downstream
    // line-based segmentation (segment-document.ts). convertToHtml() exposes
    // the same paragraph/heading/list boundaries as real tags, which we turn
    // back into newlines — a strictly-more-faithful text rendering than the
    // raw-text mode for this purpose.
    const { value: html } = await mammoth.convertToHtml({ buffer });
    return htmlToStructuredText(html).text;
  }

  if (mimeType.startsWith("text/") || mimeType === "application/json") {
    return buffer.toString("utf-8");
  }

  // Best-effort fallback for any other content type
  return buffer.toString("utf-8").replace(/[^\x20-\x7E\r\n\t]/g, " ");
}

export type IngestTableRecord = DocxTableRecord;

/**
 * PHASE 1A — companion to `extractText` that also returns the DOCX table
 * structure (tables with row/cell ids and document-relative offsets). Non-DOCX
 * mime types return an empty tables array so callers can use one code path.
 *
 * The persisted content (what `extractText` returns) is unchanged in shape;
 * this function exists so the analysis pipeline's ingest hook can emit the
 * required `compliance.ingest.table` / `compliance.ingest.table_row` events
 * without re-parsing DOCX buffers later.
 */
export async function extractTextWithStructure(
  buffer: Buffer,
  mimeType: string
): Promise<{ text: string; rawText: string; tables: IngestTableRecord[] }> {
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    const [{ value: html }, { value: rawText }] = await Promise.all([
      mammoth.convertToHtml({ buffer }),
      mammoth.extractRawText({ buffer }),
    ]);
    const { text, tables } = htmlToStructuredText(html);
    return { text, rawText, tables };
  }
  const text = await extractText(buffer, mimeType);
  return { text, rawText: text, tables: [] };
}
