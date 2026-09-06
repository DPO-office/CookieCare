/**
 * usePdfSource
 *
 * Resolves the renderable PDF File/Blob for one side (original or revised)
 * of a comparison, regardless of whether the upload was PDF or DOCX.
 *
 * Resolution order:
 *   1. If result.pdfFiles has the File object (active PDF session) → use it directly.
 *      This is the fast path: the browser already has the bytes in memory.
 *
 *   2. If result.pdfFiles is absent but result.sessionId exists
 *      (DOCX session OR historical comparison) → fetch from
 *      GET /api/compare/:sessionId/pdf?doc=original|revised
 *      and return a synthetic File wrapping the response Blob.
 *
 *   3. If neither is available → return null (triggers text fallback in viewer).
 *
 * The fetched Blob is cached by sessionId+side so navigating between findings
 * does not re-fetch the PDF on every render.
 *
 * PdfDocumentPane remains unaware of where the bytes came from.
 */

import { useState, useEffect, useRef } from "react";
import { apiUrl } from "../../../../config";
import { useAppContext } from "../../../../contexts/AppContext";
import type { CompareResult } from "../../../randtrustAI/types";

export type PdfSourceSide = "original" | "revised";
export type PdfSourceStatus = "idle" | "loading" | "ready" | "unavailable";

export interface UsePdfSourceResult {
  file: File | null;
  status: PdfSourceStatus;
  error: string | null;
}

/** Module-level cache: "sessionId:side" → File */
const pdfBlobCache = new Map<string, File>();

export function usePdfSource(
  result: CompareResult | null,
  side: PdfSourceSide
): UsePdfSourceResult {
  const { authToken } = useAppContext();

  // Fast path: browser already holds the File object
  const inMemoryFile =
    side === "original" ? result?.pdfFiles?.original : result?.pdfFiles?.revised;

  const [status, setStatus] = useState<PdfSourceStatus>(() =>
    inMemoryFile ? "ready" : result?.sessionId ? "idle" : "unavailable"
  );
  const [file, setFile] = useState<File | null>(inMemoryFile ?? null);
  const [error, setError] = useState<string | null>(null);

  const sessionId = result?.sessionId ?? null;
  const fileName =
    side === "original"
      ? (result?.originalFileName ?? "original.pdf")
      : (result?.revisedFileName ?? "revised.pdf");

  // Derive a safe display filename with .pdf extension
  const displayName = fileName.replace(/\.[^.]+$/, "") + ".pdf";

  useEffect(() => {
    // Case 1: in-memory File available — nothing to fetch
    if (inMemoryFile) {
      setFile(inMemoryFile);
      setStatus("ready");
      return;
    }

    // Case 2: no session → nothing to fetch, fall back to text view
    if (!sessionId || !authToken) {
      setFile(null);
      setStatus("unavailable");
      return;
    }

    const cacheKey = `${sessionId}:${side}`;

    // Return cached Blob immediately
    const cached = pdfBlobCache.get(cacheKey);
    if (cached) {
      setFile(cached);
      setStatus("ready");
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setFile(null);
    setError(null);

    (async () => {
      try {
        const url = apiUrl(`/api/compare/${sessionId}/pdf?doc=${side}`);
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${authToken}` },
        });

        if (!res.ok) {
          const msg =
            res.status === 404
              ? "PDF not available — session may have expired."
              : res.status === 403
              ? "Access denied to this comparison."
              : `Failed to load PDF (${res.status}).`;
          if (!cancelled) {
            setError(msg);
            setStatus("unavailable");
          }
          return;
        }

        const blob = await res.blob();
        if (cancelled) return;

        // Wrap Blob in a File so PdfDocumentPane's file.type check works
        const syntheticFile = new File([blob], displayName, {
          type: "application/pdf",
        });

        pdfBlobCache.set(cacheKey, syntheticFile);
        setFile(syntheticFile);
        setStatus("ready");
      } catch (err: any) {
        if (!cancelled) {
          console.error("[usePdfSource] Fetch failed:", err);
          setError(err?.message ?? "Network error loading PDF.");
          setStatus("unavailable");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  // Re-run when sessionId or side changes; inMemoryFile identity is stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, side, authToken, inMemoryFile]);

  return { file, status, error };
}
