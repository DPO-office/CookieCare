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

/**
 * Extract text from a PDF using pdf-parse-fork (canary path).
 * Runs only to validate the PDF is parseable. Its text is discarded.
 */
async function extractPdfWithPdfParse(buffer: Buffer): Promise<void> {
  await pdf(buffer);
}

// ─── DOCX helper ──────────────────────────────────────────────────────────────

function htmlToStructuredText(html: string): string {
  return html
    .replace(/<\/(p|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
    return { text: htmlToStructuredText(html) };
  }

  if (mimeType.startsWith("text/") || mimeType === "application/json") {
    return { text: buffer.toString("utf-8") };
  }

  return { text: buffer.toString("utf-8").replace(/[^\x20-\x7E\r\n\t]/g, " ") };
}
