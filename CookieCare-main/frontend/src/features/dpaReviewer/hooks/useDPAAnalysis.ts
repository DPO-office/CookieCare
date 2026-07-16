import { useState, useCallback, useRef } from "react";
import { AppState, AnalysisStep, DPAReviewResult } from "../types";
import { ANALYSIS_STEPS } from "../constants";
import { submitDPAReview, createJobSSE } from "../api/dpaApi";

interface UseDPAAnalysisOptions {
  authToken: string;
}

export function useDPAAnalysis({ authToken }: UseDPAAnalysisOptions) {
  const [appState, setAppState] = useState<AppState>("upload");
  const [fileName, setFileName] = useState("");
  const [steps, setSteps] = useState<AnalysisStep[]>(
    ANALYSIS_STEPS.map((s) => ({ ...s, status: "pending" as const }))
  );
  const [reviewResult, setReviewResult] = useState<DPAReviewResult | null>(null);
  const [error, setError] = useState<string>("");

  // Keep a ref to the EventSource so we can close it on reset/unmount
  const esRef = useRef<EventSource | null>(null);

  // ── Map backend progress (0–100) to which step should appear active ────────
  // Each step covers an ~8-point band so all 10 steps map naturally to 0–97%
  const progressToStepIndex = (progress: number): number => {
    if (progress < 16) return 0;       // Reading document structure
    if (progress < 24) return 1;       // Identifying parties
    if (progress < 32) return 2;       // GDPR Article 28
    if (progress < 42) return 3;       // Processor obligations
    if (progress < 52) return 4;       // Security controls
    if (progress < 62) return 5;       // International transfers
    if (progress < 72) return 6;       // Sub-processor controls
    if (progress < 82) return 7;       // Compliance gaps
    if (progress < 92) return 8;       // Calculating score
    if (progress < 97) return 9;       // Generating recommendations
    return ANALYSIS_STEPS.length;      // All done
  };

  const applyProgress = (progress: number) => {
    const activeIdx = progressToStepIndex(progress);
    setSteps(
      ANALYSIS_STEPS.map((s, i) => ({
        ...s,
        status:
          i < activeIdx
            ? "done"
            : i === activeIdx
            ? "active"
            : "pending",
      }))
    );
  };

  const runAnalysis = useCallback(
    async (file: File) => {
      // Close any lingering SSE connection from a previous run
      esRef.current?.close();
      esRef.current = null;

      setFileName(file.name);
      setError("");
      setReviewResult(null);
      setSteps(ANALYSIS_STEPS.map((s) => ({ ...s, status: "pending" as const })));
      setAppState("analyzing");

      // ── 1. Upload file and get job_id ──────────────────────────────────────
      let jobId: string;
      try {
        const res = await submitDPAReview(file, authToken);
        jobId = res.job_id;
      } catch (uploadErr: any) {
        console.error("[useDPAAnalysis] Upload failed:", uploadErr.message);
        setError(uploadErr.message || "Failed to upload document.");
        setAppState("upload");
        return;
      }

      // ── 2. Subscribe to SSE progress ───────────────────────────────────────
      const es = createJobSSE(authToken);
      esRef.current = es;

      es.onmessage = (event) => {
        let payload: any;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }

        if (payload.event !== "job_update") return;
        const job = payload.job;
        if (job.id !== jobId) return;

        // Update step progress bar
        if (typeof job.progress === "number") {
          applyProgress(job.progress);
        }

        if (job.status === "completed") {
          es.close();
          esRef.current = null;

          // Mark all steps done
          setSteps(ANALYSIS_STEPS.map((s) => ({ ...s, status: "done" as const })));

          // Parse result — may arrive as a JSON string or already as an object
          let result: DPAReviewResult | null = null;
          try {
            result =
              typeof job.result === "string"
                ? JSON.parse(job.result)
                : job.result;
          } catch (parseErr) {
            console.error("[useDPAAnalysis] Failed to parse result:", parseErr);
            setError("Received an invalid response from the server.");
            setAppState("upload");
            return;
          }

          if (!result) {
            setError("No result was returned from the DPA review.");
            setAppState("upload");
            return;
          }

          setReviewResult(result);
          // Small delay so the user sees all steps as "done" before the results screen
          setTimeout(() => setAppState("results"), 400);
        } else if (job.status === "failed") {
          es.close();
          esRef.current = null;
          console.error("[useDPAAnalysis] Job failed:", job.error);
          setError(job.error || "DPA review failed. Please try again.");
          setAppState("upload");
        }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        setError("Connection to the analysis server was interrupted. Please retry.");
        setAppState("upload");
      };
    },
    [authToken]
  );

  const reset = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setAppState("upload");
    setFileName("");
    setError("");
    setReviewResult(null);
    setSteps(ANALYSIS_STEPS.map((s) => ({ ...s, status: "pending" as const })));
  }, []);

  return {
    appState,
    fileName,
    steps,
    reviewResult,
    error,
    runAnalysis,
    reset,
  };
}
