import { useState, useCallback, useRef } from "react";
import { AppState, AnalysisStep, AIEthicsReviewResult } from "../types";
import { ANALYSIS_STEPS } from "../constants";
import { submitAIEthicsReview, createJobSSE } from "../api/aiEthicsApi";

interface UseAIEthicsAnalysisOptions {
  authToken: string;
}

// ─── Progress → step index mapping ───────────────────────────────────────────
// Each threshold aligns with the backend's updateJobProgress() calls.
// Steps: 0=receive 1=extract 2=scan 3=governance 4=intelligence 5=knowledge
//        6=ai-governance 7=transparency 8=fairness 9=accountability
//        10=privacy 11=oversight 12=explainability 13=score 14=recommendations 15=report

function progressToStepIndex(progress: number): number {
  if (progress < 8)  return 0;   // Receiving request
  if (progress < 15) return 1;   // Extracting documents
  if (progress < 22) return 2;   // Scanning website
  if (progress < 30) return 3;   // Discovering AI governance pages
  if (progress < 38) return 4;   // Extracting website intelligence
  if (progress < 44) return 5;   // Searching knowledge base
  if (progress < 50) return 6;   // Reviewing AI governance
  if (progress < 56) return 7;   // Reviewing transparency
  if (progress < 62) return 8;   // Reviewing fairness
  if (progress < 67) return 9;   // Reviewing accountability
  if (progress < 71) return 10;  // Reviewing privacy
  if (progress < 75) return 11;  // Reviewing human oversight
  if (progress < 80) return 12;  // Reviewing explainability
  if (progress < 88) return 13;  // Calculating AI ethics score
  if (progress < 94) return 14;  // Generating recommendations
  if (progress < 98) return 15;  // Preparing report
  return ANALYSIS_STEPS.length;  // All done
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAIEthicsAnalysis({ authToken }: UseAIEthicsAnalysisOptions) {
  const [appState,     setAppState]     = useState<AppState>("upload");
  const [fileNames,    setFileNames]    = useState<string[]>([]);
  const [websiteUrl,   setWebsiteUrl]   = useState<string>("");
  const [steps,        setSteps]        = useState<AnalysisStep[]>(
    ANALYSIS_STEPS.map((s) => ({ ...s, status: "pending" as const }))
  );
  const [reviewResult, setReviewResult] = useState<AIEthicsReviewResult | null>(null);
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

  const startAnalysis = useCallback(
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

      // ── 1. Submit files + URL, get job_id ───────────────────────────────
      let jobId: string;
      try {
        const res = await submitAIEthicsReview(files, authToken, url);
        jobId = res.job_id;
      } catch (submitErr: any) {
        console.error("[useAIEthicsAnalysis] Submit failed:", submitErr.message);
        setError(submitErr.message || "Failed to start AI Ethics review.");
        setAppState("upload");
        return;
      }

      // ── 2. Subscribe to SSE progress ────────────────────────────────────
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
          let result: AIEthicsReviewResult | null = null;
          try {
            result =
              typeof job.result === "string"
                ? JSON.parse(job.result)
                : job.result;
          } catch (parseErr) {
            console.error("[useAIEthicsAnalysis] Failed to parse result:", parseErr);
            setError("Received an invalid response from the server.");
            setAppState("upload");
            return;
          }

          if (!result) {
            setError("No result was returned from the AI Ethics review.");
            setAppState("upload");
            return;
          }

          setReviewResult(result);
          // Small delay so the user sees all steps as "done" before the results screen
          setTimeout(() => setAppState("results"), 400);
        } else if (job.status === "failed") {
          es.close();
          esRef.current = null;
          console.error("[useAIEthicsAnalysis] Job failed:", job.error);
          setError(job.error || "AI Ethics review failed. Please try again.");
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
    [authToken] // authToken comes from the parent component via props
  );

  const reset = useCallback(() => {
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
    startAnalysis,
    reset,
  };
}
