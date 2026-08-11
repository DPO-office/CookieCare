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

  // ── Build initial CompareState ────────────────────────────────────────────
  const initialState: CompareState = {
    onProgress: async (percent: number, message: string) => {
      await updateJobProgress(jobId, userId, percent, message);
    },
    files: {
      original: {
        buffer: originalBuffer,
        mimeType: original.mimeType,
        fileName: original.fileName,
      },
      revised: {
        buffer: revisedBuffer,
        mimeType: revised.mimeType,
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

  await updateJobProgress(jobId, userId, 5, "Starting comparison pipeline...");

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
    structure: serializableState.structure,
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
    })) ?? null,
    clausesB: serializableState.structure?.clausesB?.map((c) => ({
      id: c.id,
      title: c.title,
      text: c.text,
    })) ?? null,
    alignment: serializableState.alignment ?? null,
    differences: serializableState.differences ?? null,
    risks: serializableState.risks ?? null,
    executiveSummary: serializableState.executiveSummary ?? null,
  });

  return resultPayload;
}
