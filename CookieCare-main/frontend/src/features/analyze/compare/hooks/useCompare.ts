// ─── useCompare ───────────────────────────────────────────────────────────────
// Manages the full Compare Agreements SSE lifecycle.
//
// Flow:
//   1. User clicks "Compare Agreements" in the modal
//   2. submitCompare() POSTs files → receives job_id
//   3. SSE stream opens — job_update events update the progress message in chat
//   4. On completion: parse CompareState → inject result into chat as
//      an assistant message with structured compareResult attached
//
// This hook does NOT own chat state — it receives callbacks from useChat/
// RandTrustAI.tsx so the result lands in the canonical messages array.

import { useRef, useCallback } from "react";
import { submitCompare, createJobSSE } from "../api/compareApi";
import type {
  CompareResult,
  CompareRiskFinding,
  CompareClauseDifference,
  CompareAlignedPair,
  CompareExecutiveSummary,
} from "../../../randtrustAI/types";
import { formatExecutiveSummaryMarkdown } from "../utils/formatCompareResult";

/** Progress stages shown as cycling loading text in the placeholder bubble */
export const COMPARE_PROGRESS_STAGES = [
  "Parsing both agreements…",
  "Extracting clause structure…",
  "Aligning clauses between agreements…",
  "Detecting semantic differences…",
  "Analysing legal and commercial risk…",
  "Generating executive summary…",
] as const;

interface UseCompareOptions {
  authToken: string;
  /** Called once before the job starts — adds the user intent message */
  onUserMessage: (text: string, fileNames: string[]) => void;
  /** Called to start the streaming placeholder; returns the placeholder message id */
  onStreamingStart: () => string;
  /** Called on each progress update to update the placeholder label */
  onProgressUpdate: (id: string, label: string) => void;
  /** Called when comparison is complete — replaces placeholder with full result */
  onComplete: (id: string, markdownContent: string, compareResult: CompareResult) => void;
  /** Called on error — replaces placeholder with error message */
  onError: (id: string, errorMessage: string) => void;
}

export function useCompare({
  authToken,
  onUserMessage,
  onStreamingStart,
  onProgressUpdate,
  onComplete,
  onError,
}: UseCompareOptions) {
  const esRef = useRef<EventSource | null>(null);

  // Store all callbacks in refs so the SSE closure always calls the latest
  // version without needing to be recreated when callbacks change identity.
  // This makes startCompare stable (empty dep array) which prevents the
  // SSE handler from being torn down mid-run by a re-render.
  const onUserMessageRef    = useRef(onUserMessage);
  const onStreamingStartRef = useRef(onStreamingStart);
  const onProgressUpdateRef = useRef(onProgressUpdate);
  const onCompleteRef       = useRef(onComplete);
  const onErrorRef          = useRef(onError);
  const authTokenRef        = useRef(authToken);

  // Keep refs in sync on every render (no stale values)
  onUserMessageRef.current    = onUserMessage;
  onStreamingStartRef.current = onStreamingStart;
  onProgressUpdateRef.current = onProgressUpdate;
  onCompleteRef.current       = onComplete;
  onErrorRef.current          = onError;
  authTokenRef.current        = authToken;

  const startCompare = useCallback(
    async (original: File, revised: File) => {
      // Close any prior SSE connection
      esRef.current?.close();
      esRef.current = null;

      const title = `${original.name} vs ${revised.name}`;

      // 1. Post user intent message
      onUserMessageRef.current(
        `Compare agreements: ${original.name} vs ${revised.name}`,
        [original.name, revised.name]
      );

      // 2. Start streaming placeholder
      const placeholderId = onStreamingStartRef.current();
      onProgressUpdateRef.current(placeholderId, COMPARE_PROGRESS_STAGES[0]);

      // 3. Submit to backend
      let jobId: string;
      try {
        const res = await submitCompare(original, revised, authTokenRef.current, title);
        jobId = res.job_id;
      } catch (err: any) {
        onErrorRef.current(placeholderId, err?.message ?? "Failed to start comparison. Please try again.");
        return;
      }

      // 4. Open SSE stream
      const es = createJobSSE(authTokenRef.current);
      esRef.current = es;
      console.log("[useCompare] SSE stream opened — waiting for job:", jobId);

      es.onmessage = (event) => {
        let payload: any;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }

        if (payload.event !== "job_update") return;
        const job = payload.job;
        console.log("[useCompare/SSE] job_update received — job.id:", job.id, "expected:", jobId, "status:", job.status);
        if (job.id !== jobId) return;

        // Map backend progress % to a stage label
        if (typeof job.progress === "number") {
          const stage = progressToStage(job.progress);
          onProgressUpdateRef.current(placeholderId, stage);
        }

        if (job.status === "completed") {
          es.close();
          esRef.current = null;

          // Parse the compare state from the job result
          let raw: any;
          try {
            raw = typeof job.result === "string" ? JSON.parse(job.result) : job.result;
          } catch {
            onErrorRef.current(placeholderId, "Received an invalid response from the server.");
            return;
          }

          if (!raw) {
            onErrorRef.current(placeholderId, "No result was returned from the comparison.");
            return;
          }

          // Build the structured CompareResult — include the jobId as the session key
          const compareResult = buildCompareResult(raw, original.name, revised.name, jobId);
          const markdown = formatExecutiveSummaryMarkdown(compareResult);

          console.log("[useCompare] Pipeline complete — sessionId:", compareResult.sessionId, "| jobId:", jobId);
          onCompleteRef.current(placeholderId, markdown, compareResult);

        } else if (job.status === "failed") {
          es.close();
          esRef.current = null;
          onErrorRef.current(placeholderId, job.error || "Comparison failed. Please try again.");
        }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        onErrorRef.current(
          placeholderId,
          "Connection to the analysis server was interrupted. Please try again."
        );
      };
    },
    [] // stable — all callbacks accessed through refs
  );

  const cancel = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, []);

  return { startCompare, cancel };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Maps backend progress % to one of our human-readable stage labels.
 * Backend emits: 10, 30, 55, 75, 90, 96, 100
 */
function progressToStage(progress: number): string {
  if (progress < 20) return COMPARE_PROGRESS_STAGES[0]; // Parsing
  if (progress < 45) return COMPARE_PROGRESS_STAGES[1]; // Structure
  if (progress < 68) return COMPARE_PROGRESS_STAGES[2]; // Alignment
  if (progress < 83) return COMPARE_PROGRESS_STAGES[3]; // Differences
  if (progress < 95) return COMPARE_PROGRESS_STAGES[4]; // Risk
  return COMPARE_PROGRESS_STAGES[5];                     // Summary
}

/**
 * Extracts and normalises the fields we need from the raw job result
 * (which is a serialised CompareState).
 */
function buildCompareResult(
  raw: any,
  originalFileName: string,
  revisedFileName: string,
  sessionId?: string
): CompareResult {
  const executiveSummary: CompareExecutiveSummary = raw.executiveSummary ?? {
    overallAssessment: "Analysis complete.",
    overallRisk: "MEDIUM",
    keyFindings: [],
    criticalRedlines: [],
    missingProtections: [],
    negotiationPriorities: [],
    recommendation: "Review findings before proceeding.",
  };

  const risks: CompareRiskFinding[] = (raw.risks ?? []).map((r: any, i: number) => ({
    id: r.id ?? `risk-${i}`,
    pairId: r.pairId ?? "",
    level: r.level ?? "MEDIUM",
    category: r.category ?? "other",
    rationale: r.rationale ?? "",
    confidence: r.confidence ?? 0.5,
    source: r.source ?? "llm",
  }));

  const differences: CompareClauseDifference[] = (raw.differences ?? []).map((d: any) => ({
    pairId: d.pairId ?? "",
    clauseAId: d.clauseAId ?? null,
    clauseBId: d.clauseBId ?? null,
    classification: d.classification ?? "UNCHANGED",
    semanticSummary: d.semanticSummary ?? "",
    confidence: d.confidence ?? 0.5,
  }));

  const alignment: CompareAlignedPair[] = (raw.alignment ?? []).map((a: any, i: number) => ({
    id: a.id ?? `pair-${i}`,
    clauseAId: a.clauseAId ?? null,
    clauseBId: a.clauseBId ?? null,
    alignmentType: a.alignmentType ?? "exact",
    matchConfidence: a.matchConfidence ?? 1,
    alignmentReason: a.alignmentReason ?? "",
    status: a.status ?? "matched",
  }));

  return { executiveSummary, risks, differences, alignment, originalFileName, revisedFileName, sessionId };
}
