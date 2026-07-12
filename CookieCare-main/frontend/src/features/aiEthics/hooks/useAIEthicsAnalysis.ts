import { useState, useRef, useCallback, useEffect } from "react";
import { AppState, AnalysisStep } from "../types";
import { ANALYSIS_STEPS } from "../constants";

export function useAIEthicsAnalysis() {
  const [appState, setAppState] = useState<AppState>("upload");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [steps, setSteps] = useState<AnalysisStep[]>(ANALYSIS_STEPS);
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startAnalysis = useCallback((files: File[]) => {
    setUploadedFiles(files);
    setSteps(ANALYSIS_STEPS.map((s) => ({ ...s, status: "pending" })));
    setAppState("analyzing");

    let current = 0;
    const advance = () => {
      if (current >= ANALYSIS_STEPS.length) {
        setAppState("results");
        return;
      }
      setSteps((prev) =>
        prev.map((s, i) =>
          i === current
            ? { ...s, status: "active" }
            : i < current
            ? { ...s, status: "done" }
            : s
        )
      );
      current++;
      const delay =
        current === ANALYSIS_STEPS.length ? 900 : 600 + Math.random() * 500;
      stepTimerRef.current = setTimeout(() => {
        setSteps((prev) =>
          prev.map((s, i) =>
            i === current - 1 ? { ...s, status: "done" } : s
          )
        );
        setTimeout(advance, 200);
      }, delay);
    };
    setTimeout(advance, 300);
  }, []);

  const reset = useCallback(() => {
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    setAppState("upload");
    setUploadedFiles([]);
    setSteps(ANALYSIS_STEPS.map((s) => ({ ...s, status: "pending" })));
  }, []);

  useEffect(() => {
    return () => {
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    };
  }, []);

  return {
    appState,
    fileNames: uploadedFiles.map((f) => f.name),
    steps,
    startAnalysis,
    reset,
  };
}
