import { useState, useCallback } from "react";
import { AppState, AnalysisStep } from "../types";
import { ANALYSIS_STEPS } from "../constants";

export function useDPAAnalysis() {
  const [appState, setAppState] = useState<AppState>("upload");
  const [fileName, setFileName] = useState("");
  const [steps, setSteps] = useState<AnalysisStep[]>(ANALYSIS_STEPS);

  const runAnalysis = useCallback((file: File) => {
    setFileName(file.name);
    setAppState("analyzing");

    const resetSteps = ANALYSIS_STEPS.map(s => ({ ...s, status: "pending" as const }));
    setSteps(resetSteps);

    let currentIdx = 0;
    const interval = setInterval(() => {
      setSteps(prev => {
        const updated = prev.map((s, i) => {
          if (i < currentIdx) return { ...s, status: "done" as const };
          if (i === currentIdx) return { ...s, status: "active" as const };
          return { ...s, status: "pending" as const };
        });
        return updated;
      });
      currentIdx++;
      if (currentIdx > ANALYSIS_STEPS.length) {
        clearInterval(interval);
        setSteps(ANALYSIS_STEPS.map(s => ({ ...s, status: "done" as const })));
        setTimeout(() => setAppState("results"), 500);
      }
    }, 600);
  }, []);

  const reset = () => {
    setAppState("upload");
    setFileName("");
    setSteps(ANALYSIS_STEPS.map(s => ({ ...s, status: "pending" as const })));
  };

  return { appState, fileName, steps, runAnalysis, reset };
}
