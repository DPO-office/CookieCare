import { useState, useCallback, useRef } from "react";
import { ANALYSIS_STEPS } from "../constants";
import type { AnalysisStep, AppState, VendorReviewResult } from "../types";
import { submitVendorReview, createJobSSE } from "../api/vendorReview.api";

interface UseVendorAnalysisOptions {
  authToken: string;
}

interface UseVendorAnalysisReturn {
  appState: AppState;
  fileNames: string[];
  websiteUrl: string;
  steps: AnalysisStep[];
  reviewResult: VendorReviewResult | null;
  error: string;
  handleFilesSelected: (files: File[], websiteUrl?: string) => void;
  handleReset: () => void;
}

/**
 * Maps a backend progress value (0–100) to which analysis step should appear
 * active. Each step covers an equal band across the 13-step sequence.
 */
function progressToStepIndex(progress: number): number {
  if (progress < 8)  return 0;  // Receiving request
  if (progress < 16) return 1;  // Extracting uploaded documents
  if (progress < 22) return 2;  // Scanning website
  if (progress < 28) return 3;  // Discovering compliance pages
  if (progress < 36) return 4;  // Extracting website intelligence
  if (progress < 44) return 5;  // Searching knowledge base
  if (progress < 52) return 6;  // Reviewing privacy posture
  if (progress < 60) return 7;  // Reviewing security posture
  if (progress < 68) return 8;  // Reviewing compliance
  if (progress < 76) return 9;  // Evaluating contractual risks
  if (progress < 84) return 10; // Calculating vendor score
  if (progress < 92) return 11; // Generating recommendations
  if (progress < 98) return 12; // Preparing report
  return ANALYSIS_STEPS.length; // All done
}

export function useVendorAnalysis({ authToken }: UseVendorAnalysisOptions): UseVendorAnalysisReturn {
  const [appState,    setAppState]    = useState<AppState>("upload");
  const [fileNames,   setFileNames]   = useState<string[]>([]);
  const [websiteUrl,  setWebsiteUrl]  = useState<string>("");
  const [steps,       setSteps]       = useState<AnalysisStep[]>(
    ANALYSIS_STEPS.map((s) => ({ ...s, status: "pending" as const }))
  );
  const [reviewResult, setReviewResult] = useState<VendorReviewResult | null>(null);
  const [error,        setError]        = useState<string>("");

  // Keep a ref to the EventSource so we can close it on reset/unmount
  const esRef = useRef<EventSource | null>(null);

  const applyProgress = (progress: number) => {
    const activeIdx = progressToStepIndex(progress);
    setSteps(
      ANALYSIS_STEPS.map((s, i) => ({
        ...s,
        status:
          i < activeIdx
            ? ("done" as const)
            : i === activeIdx
            ? ("active" as const)
            : ("pending" as const),
      }))
    );
  };

  const handleFilesSelected = useCallback(
    async (files: File[], url?: string) => {
      // Close any lingering SSE connection from a previous run
      esRef.current?.close();
      esRef.current = null;

      const names = files.map((f) => f.name);
      setFileNames(names);
      setWebsiteUrl(url ?? "");
      setError("");
      setReviewResult(null);
      setSteps(ANALYSIS_STEPS.map((s) => ({ ...s, status: "pending" as const })));
      setAppState("analyzing");

      // ── 1. Submit files + URL, get job_id ─────────────────────────────────
      let jobId: string;
      try {
        const res = await submitVendorReview(files, authToken, url);
        jobId = res.job_id;
      } catch (submitErr: any) {
        console.error("[useVendorAnalysis] Submit failed:", submitErr.message);
        setError(submitErr.message || "Failed to start vendor review.");
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
          let result: VendorReviewResult | null = null;
          try {
            result =
              typeof job.result === "string"
                ? JSON.parse(job.result)
                : job.result;
          } catch (parseErr) {
            console.error("[useVendorAnalysis] Failed to parse result:", parseErr);
            setError("Received an invalid response from the server.");
            setAppState("upload");
            return;
          }

          if (!result) {
            setError("No result was returned from the vendor review.");
            setAppState("upload");
            return;
          }

          setReviewResult(result);
          // Small delay so user sees all steps as "done" before the results screen
          setTimeout(() => setAppState("results"), 400);

        } else if (job.status === "failed") {
          es.close();
          esRef.current = null;
          console.error("[useVendorAnalysis] Job failed:", job.error);
          setError(job.error || "Vendor review failed. Please try again.");
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

  const handleReset = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setAppState("upload");
    setFileNames([]);
    setWebsiteUrl("");
    setError("");
    setReviewResult(null);
    setSteps(ANALYSIS_STEPS.map((s) => ({ ...s, status: "pending" as const })));
  }, []);

  return {
    appState,
    fileNames,
    websiteUrl,
    steps,
    reviewResult,
    error,
    handleFilesSelected,
    handleReset,
  };
}
