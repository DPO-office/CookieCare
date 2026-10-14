/**
 * docxToPdf.ts
 *
 * Converts a DOCX (or DOC) buffer to a PDF buffer using the existing
 * Playwright/Puppeteer infrastructure (BrowserManager).
 *
 * Flow:
 *   DOCX Buffer
 *     → mammoth.convertToHtml()   — extracts semantic HTML
 *     → Playwright page.setContent(html)
 *     → page.pdf({ format: "A4", printBackground: true })
 *     → PDF Buffer
 *
 * The converted PDF is visually faithful enough for a legal-document
 * comparison viewer (text, headings, paragraphs, lists, tables).
 * It will not match a Word-rendered PDF pixel-for-pixel (different font
 * metrics, no Word templates/headers/footers), which is acceptable for P2.
 *
 * Reuses BrowserManager — does NOT launch a second browser instance.
 * Browser resources (page) are cleaned up in the finally block.
 */

import mammoth from "mammoth";
import { browserManager } from "./browserManager.js";

// ─── HTML wrapper ─────────────────────────────────────────────────────────────
// Wrap the mammoth HTML output in a minimal print-friendly shell so that
// Playwright renders it with sensible A4 margins and readable typography.

const PAGE_STYLE = `
  @page { size: A4; margin: 20mm 18mm 20mm 18mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Times New Roman", Georgia, serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #1a1a1a;
    margin: 0;
    padding: 0;
  }
  h1, h2, h3, h4, h5, h6 {
    font-family: Arial, Helvetica, sans-serif;
    margin-top: 1.2em;
    margin-bottom: 0.4em;
    page-break-after: avoid;
  }
  h1 { font-size: 16pt; }
  h2 { font-size: 14pt; }
  h3 { font-size: 12pt; }
  p  { margin: 0 0 0.6em 0; orphans: 3; widows: 3; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 0.8em; }
  th, td { border: 1px solid #ccc; padding: 4px 8px; font-size: 10pt; }
  ul, ol { margin: 0 0 0.6em 1.4em; }
  li { margin-bottom: 0.2em; }
  a { color: inherit; text-decoration: none; }
`;

function wrapHtml(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${PAGE_STYLE}</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert a DOCX or DOC buffer to a PDF buffer.
 *
 * @param buffer    Raw DOCX/DOC file bytes
 * @param fileName  Used only for logging
 * @returns         PDF buffer ready for storage and pdfjs-dist rendering
 * @throws          If mammoth extraction or Playwright PDF generation fails
 */
export async function docxToPdf(buffer: Buffer, fileName: string): Promise<Buffer> {
  // ── Step 1: DOCX → HTML via mammoth ────────────────────────────────────
  let html: string;
  try {
    const result = await mammoth.convertToHtml({ buffer });
    if (result.messages.length > 0) {
      console.warn(
        `[docxToPdf] mammoth warnings for "${fileName}":`,
        result.messages.map((m) => m.message).join("; ")
      );
    }
    html = result.value;
  } catch (err: any) {
    throw new Error(
      `[docxToPdf] mammoth HTML extraction failed for "${fileName}": ${err.message}`
    );
  }

  if (!html.trim()) {
    throw new Error(
      `[docxToPdf] mammoth returned empty HTML for "${fileName}". The file may be corrupt or image-only.`
    );
  }

  // ── Step 2: HTML → PDF via Playwright (BrowserManager) ─────────────────
  const page = await browserManager.newPage();
  try {
    await page.setContent(wrapHtml(html));

    // Wait for fonts/layout to settle before capturing PDF
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {
      // networkidle timeout is non-fatal — the content is already set
      console.warn(`[docxToPdf] networkidle timeout for "${fileName}" — proceeding with PDF capture.`);
    });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        right: "18mm",
        bottom: "20mm",
        left: "18mm",
      },
    });

    console.log(
      `[docxToPdf] Converted "${fileName}" DOCX → PDF (${Math.round(pdfBuffer.length / 1024)} KB)`
    );

    return pdfBuffer;
  } finally {
    // Always release the page back — never let it leak
    await page.close().catch(() => {});
  }
}

/**
 * Returns true if the given MIME type is a DOCX/DOC that needs conversion.
 */
export function requiresPdfConversion(mimeType: string): boolean {
  return (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  );
}
