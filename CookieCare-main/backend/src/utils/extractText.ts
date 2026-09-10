/**
 * Shared text extraction utility.
 *
 * Uses pdf-parse-fork as a canary/validity check for PDF inputs.
 * The actual text used downstream always comes from pdfjs-dist, which
 * exposes per-item coordinates needed for structure-aware reconstruction.
 *
 * For PDF files this module also returns pageBreaks: a sorted array of
 * cumulative character offsets at which each new page begins in the flat
 * extracted text string. pageBreaks[0] is always 0 (start of page 1).
 */

import pdf from "pdf-parse-fork";
import mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { DocumentInitParameters } from "pdfjs-dist/types/src/display/api.js";
import {
  assemblePageTwoPass,
  MARKER_ONLY_RE,
  type PdfTextItem,
} from "./pdf-page-assemble.js";

// ─── Result type ──────────────────────────────────────────────────────────────

export interface ExtractionResult {
  text: string;
  /**
   * Cumulative char offsets in the flat text where each page starts.
   * pageBreaks[0] === 0 always. Only populated for PDF inputs.
   */
  pageBreaks?: number[];
}

/** pdf-parse-fork validity canary — text is discarded; pdfjs-dist supplies the extract. */
async function extractPdfWithPdfParse(buffer: Buffer): Promise<void> {
  await pdf(buffer);
}

function toPdfTextItem(item: any): PdfTextItem {
  return {
    str: String(item.str ?? ""),
    x: item.transform?.[4] ?? 0,
    y: item.transform?.[5] ?? 0,
    width: item.width ?? 0,
    hasEOL: item.hasEOL === true,
  };
}

// ─── PDF extraction helpers ───────────────────────────────────────────────────

/**
 * Cross-page marker stitch (P0-1 fix).
 *
 * assemblePageTwoPass() processes each page independently. When a bare numeric
 * clause marker (e.g. "5." or "3.2.") is the last non-empty line on page N,
 * its body text is the first content on page N+1. assemblePageTwoPass sees an
 * empty block for that marker on page N and drops it (Pattern B). The body on
 * page N+1 then has no heading and either becomes preamble or attaches to the
 * wrong marker, losing the clause heading entirely.
 *
 * Fix: after all pages are assembled, scan the assembled page texts. When
 * page N's last non-empty line exactly matches MARKER_ONLY_RE, remove that
 * line from page N and prepend it (plus a newline) to page N+1. The segmenter
 * then sees the marker at the start of page N+1, immediately above its body.
 *
 * Safety constraints:
 *   - Only fires when the LAST non-empty line is a bare marker — never for
 *     body text, headings, or partial sentences.
 *   - Handles the edge case where the marker is the only content on page N
 *     (the page becomes empty after stripping; that is fine — it contributes
 *     no text to the joined output).
 *   - pageBreaks are recomputed after stitching to remain accurate.
 */
export function stitchCrossPageMarkers(pageTexts: string[]): string[] {
  const result = [...pageTexts];

  for (let i = 0; i < result.length - 1; i++) {
    const lines = result[i].split("\n");

    // Find the last non-empty line
    let lastNonEmptyIdx = -1;
    for (let j = lines.length - 1; j >= 0; j--) {
      if (lines[j].trim() !== "") {
        lastNonEmptyIdx = j;
        break;
      }
    }

    if (lastNonEmptyIdx === -1) continue; // page is entirely empty

    const lastLine = lines[lastNonEmptyIdx].trim();

    // Only stitch when the last non-empty line is exactly a bare numeric marker
    if (!MARKER_ONLY_RE.test(lastLine)) continue;

    // Remove the marker line from the end of page N
    lines.splice(lastNonEmptyIdx, 1);
    result[i] = lines.join("\n");

    // Prepend the marker to the top of page N+1 so the segmenter sees it
    // immediately above its body text.
    const nextPage = result[i + 1];
    result[i + 1] = nextPage.length > 0
      ? `${lastLine}\n${nextPage}`
      : lastLine;

    console.log(
      `[extractText] Cross-page stitch: marker "${lastLine}" moved from page ${i + 1} to page ${i + 2}`
    );
  }

  return result;
}

/**
 * Extract text from a PDF using pdfjs-dist with structure-aware reconstruction.
 *
 * Each page is processed by assemblePageTwoPass() (pdf-page-assemble.ts),
 * which assigns body text with a small same-line window and then repairs
 * clause ownership using structural/content signals rather than a large
 * global Y tolerance.
 *
 * After per-page assembly, stitchCrossPageMarkers() moves any bare numeric
 * marker that sits at the bottom of page N to the top of page N+1, preventing
 * cross-page clause heading loss (P0-1 fix).
 */
async function extractPdfWithPdfJs(buffer: Buffer): Promise<ExtractionResult> {
  const uint8Array = new Uint8Array(buffer);
  const params: DocumentInitParameters = {
    data: uint8Array,
    disableWorker: true,
    stopAtErrors: false,
  } as any;
  const loadingTask = getDocument(params);
  // Prevent pdfjs internal background promises (font loading, XRef repair chains)
  // from escaping as UnhandledPromiseRejection after loadingTask.promise resolves.
  // Text extraction still proceeds normally — this only silences stray async chains
  // that pdfjs fires internally on ReportLab and similar programmatic PDFs.
  loadingTask.promise.catch(() => {});
  const doc = await loadingTask.promise;

  const rawPageTexts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    // Filter to real text items only
    const textItems = content.items.filter(
      (item: any) => "str" in item && "hasEOL" in item && item.str !== ""
    );

    const pageText = assemblePageTwoPass(textItems.map(toPdfTextItem));
    rawPageTexts.push(pageText);
  }

  // Apply cross-page marker stitch before joining pages
  const pageTexts = stitchCrossPageMarkers(rawPageTexts);

  const pageBreaks: number[] = [0];
  let cumulative = 0;
  for (let i = 0; i < pageTexts.length - 1; i++) {
    cumulative += pageTexts[i].length + 1; // +1 for the "\n" separator
    pageBreaks.push(cumulative);
  }

  return { text: pageTexts.join("\n"), pageBreaks };
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Extract plaintext (and optional page-break metadata) from a file buffer.
 *
 * For PDF inputs, pdfjs-dist is always used for text (structure-aware
 * reconstruction). pdf-parse-fork runs as a validity canary; if it throws,
 * we still proceed with pdfjs-dist unless pdfjs also fails.
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractionResult> {
  if (mimeType === "application/pdf") {
    // Canary run — validates the PDF is parseable, text is discarded
    try {
      await extractPdfWithPdfParse(buffer);
    } catch (primaryErr: any) {
      console.warn(
        "[extractText] pdf-parse-fork canary failed (continuing with pdfjs-dist):",
        primaryErr?.message ?? primaryErr
      );
    }

    // Always use pdfjs-dist for the actual text
    try {
      return await extractPdfWithPdfJs(buffer);
    } catch (pdfJsErr: any) {
      throw new Error(
        `[extractText] pdfjs-dist extraction failed: ${pdfJsErr?.message ?? pdfJsErr}`
      );
    }
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    const { value: html } = await mammoth.convertToHtml({ buffer });
    return htmlToStructuredText(html).text;
  }

  if (mimeType.startsWith("text/") || mimeType === "application/json") {
    return { text: buffer.toString("utf-8") };
  }

  return { text: buffer.toString("utf-8").replace(/[^\x20-\x7E\r\n\t]/g, " ") };
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
