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
    const data = await mammoth.extractRawText({ buffer });
    return data.value;
  }

  if (mimeType.startsWith("text/") || mimeType === "application/json") {
    return buffer.toString("utf-8");
  }

  // Best-effort fallback for any other content type
  return buffer.toString("utf-8").replace(/[^\x20-\x7E\r\n\t]/g, " ");
}
