import { useState, useRef, useCallback, useEffect } from "react";
import { ANALYSIS_STEPS } from "../constants";
import type { AnalysisStep, AppState } from "../types";

interface UseVendorAnalysisReturn {
  appState: AppState;
  fileNames: string[];
  steps: AnalysisStep[];
  handleFilesSelected: (files: File[]) => void;
  handleReset: () => void;
}

export function useVendorAnalysis(): UseVendorAnalysisReturn {
  const [appState, setAppState] = useState<AppState>("upload");
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [steps, setSteps] = useState<AnalysisStep[]>(
    ANALYSIS_STEPS.map((s) => ({ ...s })),
  );
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    },
    [],
  );

  const runAnalysis = useCallback(() => {
    setSteps(ANALYSIS_STEPS.map((s) => ({ ...s, status: "pending" })));
    const total = ANALYSIS_STEPS.length;
    let current = 0;

    const advance = () => {
      setSteps((prev) => {
        const next = [...prev];
        if (current > 0) next[current - 1] = { ...next[current - 1], status: "done" };
        if (current < total) next[current] = { ...next[current], status: "active" };
        return next;
      });

      if (current < total) {
        current++;
        const delay = 700 + Math.random() * 700;
        stepTimerRef.current = setTimeout(() => {
          if (current === total) {
            setSteps((prev) => prev.map((s) => ({ ...s, status: "done" })));
            stepTimerRef.current = setTimeout(() => setAppState("results"), 700);
          } else {
            advance();
          }
        }, delay);
      }
    };

    advance();
  }, []);

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      setFileNames(files.map((f) => f.name));
      setAppState("analyzing");
      runAnalysis();
    },
    [runAnalysis],
  );

  const handleReset = useCallback(() => {
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    setAppState("upload");
    setFileNames([]);
    setSteps(ANALYSIS_STEPS.map((s) => ({ ...s, status: "pending" })));
  }, []);

  return { appState, fileNames, steps, handleFilesSelected, handleReset };
}
