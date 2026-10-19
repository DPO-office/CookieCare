import type { getDocument as GetDocumentFn } from "pdfjs-dist/legacy/build/pdf.mjs";

export const MAX_PDF_PAGES = 5_000;
const PDF_INSPECTION_TIMEOUT_MS = 30_000;
const PDFJS_LEGACY_SPECIFIER = "pdfjs-dist/legacy/build/pdf.mjs";

let getDocumentPromise: Promise<typeof GetDocumentFn> | undefined;

async function loadGetDocument(): Promise<typeof GetDocumentFn> {
  getDocumentPromise ??= import(PDFJS_LEGACY_SPECIFIER).then((mod) => mod.getDocument);
  return getDocumentPromise;
}

/** Counts pages from the original bytes, independently of later text extraction. */
export async function inspectOriginalPdf(bytes: Uint8Array): Promise<{ pageCount: number | null; readability: "readable" | "unreadable" }> {
  if (bytes.length < 5 || Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-") {
    throw new Error("Uploaded file is not a PDF");
  }
  const getDocument = await loadGetDocument();
  const task = getDocument({ data: Uint8Array.from(bytes), useSystemFonts: false, disableFontFace: true });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const document = await Promise.race([
      task.promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("PDF inspection timed out")), PDF_INSPECTION_TIMEOUT_MS);
      }),
    ]);
    try {
      if (document.numPages > MAX_PDF_PAGES) throw new Error("PDF exceeds the page limit");
      return { pageCount: document.numPages, readability: "readable" };
    } finally {
      await document.destroy();
    }
  } catch (error) {
    if (error instanceof Error && (error.message === "PDF exceeds the page limit" || error.message === "PDF inspection timed out")) throw error;
    return { pageCount: null, readability: "unreadable" };
  } finally {
    if (timeout) clearTimeout(timeout);
    await task.destroy();
  }
}
