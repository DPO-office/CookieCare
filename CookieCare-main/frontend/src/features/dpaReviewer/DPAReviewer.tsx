import React from "react";
import { useDPAAnalysis }    from "./hooks/useDPAAnalysis";
import { DPAUploadState }    from "./components/DPAUploadState";
import { DPAAnalyzingState } from "./components/DPAAnalyzingState";
import { DPAResultsState }   from "./components/DPAResultsState";

export default function DPAReviewer() {
  const { appState, fileName, steps, runAnalysis, reset } = useDPAAnalysis();

  return (
    <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden font-sans">
      {appState === "upload"    && <DPAUploadState    onFileSelected={runAnalysis} />}
      {appState === "analyzing" && <DPAAnalyzingState fileName={fileName} steps={steps} />}
      {appState === "results"   && <DPAResultsState   fileName={fileName} onReset={reset} />}
    </div>
  );
}
