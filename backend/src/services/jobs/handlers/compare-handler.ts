/**
 * compare-handler.ts
 *
 * Job handler for the "contract_comparison" job type.
 * Follows the same pattern as drafting-handler.ts:
 *   - Receives (jobId, userId, payload)
 *   - Reconstructs CompareState from the serialised payload
 *   - Runs the pipeline via CompareWorkflowOrchestrator
 *   - Returns the result object that the job queue persists as job.result
 */

import { updateJobProgress } from "../../jobQueue.js";
import { CompareState } from "../../../modules/compare/models/compare-state.js";
import { CompareWorkflowOrchestrator } from "../../../modules/compare/workflows/compare-workflow.js";
import { compareSessionStore } from "../../../modules/compare/session/compare-session-store.js";
import { docxToPdf, requiresPdfConversion } from "../../../utils/docxToPdf.js";

export async function executeContractComparison(
  jobId: string,
  userId: string,
  payload: any
): Promise<any> {
  const { title, original, revised } = payload as {
    title: string;
    original: {
      fileBufferBase64: string;
      mimeType: string;
      fileName: string;
    };
    revised: {
      fileBufferBase64: string;
      mimeType: string;
      fileName: string;
    };
  };

  // ── Re-inflate buffers from Base64 ────────────────────────────────────────
  const originalBuffer = Buffer.from(original.fileBufferBase64, "base64");
  const revisedBuffer = Buffer.from(revised.fileBufferBase64, "base64");

  // ── DOCX → PDF conversion (Phase 2b) ─────────────────────────────────────
  // For DOCX/DOC files we convert to PDF before running the pipeline.
  // The converted PDF is used for:
  //   1. Visual rendering in the browser (served via GET /api/compare/:jobId/pdf)
  //   2. Text extraction with page-break metadata (so pageNumber is consistent
  //      with the rendered PDF pages, not with the DOCX paragraph layout)
  //
  // For PDF files we keep the original bytes unchanged.

  await updateJobProgress(jobId, userId, 5, "Starting comparison pipeline...");

  let pdfBufferA: Buffer;
  let mimeTypeA: string;
  let pdfConvertedA = false; // true only when docxToPdf actually succeeded

  let pdfBufferB: Buffer;
  let mimeTypeB: string;
  let pdfConvertedB = false;

  if (requiresPdfConversion(original.mimeType)) {
    await updateJobProgress(jobId, userId, 7, "Converting original document to PDF...");
    try {
      pdfBufferA = await docxToPdf(originalBuffer, original.fileName);
      mimeTypeA = "application/pdf";
      pdfConvertedA = true;
      console.log(`[compare-handler] Converted original DOCX "${original.fileName}" → PDF`);
    } catch (err: any) {
      console.error("[compare-handler] DOCX→PDF conversion failed for original:", err.message);
      // Fall back to raw DOCX for text extraction (pipeline still works),
      // but mark pdfConvertedA=false so the session stores null for pdfA —
      // the /pdf endpoint will return 404 and the frontend falls back to
      // the text view instead of serving un-renderable DOCX bytes to pdfjs.
      pdfBufferA = originalBuffer;
      mimeTypeA = original.mimeType;
    }
  } else {
    pdfBufferA = originalBuffer;
    mimeTypeA = original.mimeType;
    pdfConvertedA = mimeTypeA === "application/pdf"; // native PDF → renderable
  }

  if (requiresPdfConversion(revised.mimeType)) {
    await updateJobProgress(jobId, userId, 8, "Converting revised document to PDF...");
    try {
      pdfBufferB = await docxToPdf(revisedBuffer, revised.fileName);
      mimeTypeB = "application/pdf";
      pdfConvertedB = true;
      console.log(`[compare-handler] Converted revised DOCX "${revised.fileName}" → PDF`);
    } catch (err: any) {
      console.error("[compare-handler] DOCX→PDF conversion failed for revised:", err.message);
      pdfBufferB = revisedBuffer;
      mimeTypeB = revised.mimeType;
    }
  } else {
    pdfBufferB = revisedBuffer;
    mimeTypeB = revised.mimeType;
    pdfConvertedB = mimeTypeB === "application/pdf";
  }

  // ── Build initial CompareState ────────────────────────────────────────────
  // Use the (possibly converted) PDF buffers so that page-break extraction
  // in extractText.ts corresponds to the same pages the viewer will render.
  const initialState: CompareState = {
    onProgress: async (percent: number, message: string) => {
      await updateJobProgress(jobId, userId, percent, message);
    },
    files: {
      original: {
        buffer: pdfBufferA,
        mimeType: mimeTypeA,
        fileName: original.fileName,
      },
      revised: {
        buffer: pdfBufferB,
        mimeType: mimeTypeB,
        fileName: revised.fileName,
      },
    },
    parsed: null,
    structure: null,
    metadata: {
      timestamp: new Date().toISOString(),
      title,
    },
  };

  // ── Run the pipeline ──────────────────────────────────────────────────────
  const orchestrator = new CompareWorkflowOrchestrator();
  const finalState = await orchestrator.execute(initialState);

  // ── Build the result object returned as job.result ────────────────────────
  // Buffers are stripped — they must never be serialised into the jobs table.
  const { files: _files, ...serializableState } = finalState;

  const resultPayload = {
    title,
    parsed: serializableState.parsed
      ? {
          metaA: serializableState.parsed.metaA,
          metaB: serializableState.parsed.metaB,
          textA: serializableState.parsed.textA,
          textB: serializableState.parsed.textB,
        }
      : null,
    structure: serializableState.structure
      ? {
          clausesA: serializableState.structure.clausesA.map((c) => ({
            id: c.id,
            title: c.title,
            text: c.text,
            position: c.position,
            sectionPath: c.sectionPath,
            pageNumber: c.pageNumber,
          })),
          clausesB: serializableState.structure.clausesB.map((c) => ({
            id: c.id,
            title: c.title,
            text: c.text,
            position: c.position,
            sectionPath: c.sectionPath,
            pageNumber: c.pageNumber,
          })),
        }
      : null,
    alignment: serializableState.alignment ?? null,
    differences: serializableState.differences ?? null,
    risks: serializableState.risks ?? null,
    executiveSummary: serializableState.executiveSummary ?? null,
    metadata: serializableState.metadata,
  };

  // ── Store session for follow-up chat ──────────────────────────────────────
  // The jobId is the session key — the client already has it.
  // We store the structured artifacts so the CompareChatAgent can answer
  // follow-up questions without re-running any pipeline step.
  compareSessionStore.set(jobId, {
    jobId,
    userId,
    title,
    originalFileName: original.fileName,
    revisedFileName: revised.fileName,
    textA: serializableState.parsed?.textA ?? null,
    textB: serializableState.parsed?.textB ?? null,
    // Extracted clause objects with text — used by the drafting context builder
    // to locate and quote actual clause language without re-running the pipeline.
    clausesA: serializableState.structure?.clausesA?.map((c) => ({
      id: c.id,
      title: c.title,
      text: c.text,
      pageNumber: c.pageNumber,
    })) ?? null,
    clausesB: serializableState.structure?.clausesB?.map((c) => ({
      id: c.id,
      title: c.title,
      text: c.text,
      pageNumber: c.pageNumber,
    })) ?? null,
    alignment: serializableState.alignment ?? null,
    differences: serializableState.differences ?? null,
    risks: serializableState.risks ?? null,
    executiveSummary: serializableState.executiveSummary ?? null,
    // Only store renderable PDF bytes — null when conversion failed so the
    // /pdf endpoint returns 404 and the frontend shows the text fallback view
    // instead of handing un-renderable DOCX bytes to pdfjs.
    pdfA: pdfConvertedA ? pdfBufferA : null,
    pdfB: pdfConvertedB ? pdfBufferB : null,
  });

  return resultPayload;
}
