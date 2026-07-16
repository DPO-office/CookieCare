import React from "react";
import { useDPAAnalysis }    from "./hooks/useDPAAnalysis";
import { DPAUploadState }    from "./components/DPAUploadState";
import { DPAAnalyzingState } from "./components/DPAAnalyzingState";
import { DPAResultsState }   from "./components/DPAResultsState";

interface DPAReviewerProps {
  authToken: string;
}

export default function DPAReviewer({ authToken }: DPAReviewerProps) {
  const {
    appState,
    fileName,
    steps,
    reviewResult,
    error,
    runAnalysis,
    reset,
  } = useDPAAnalysis({ authToken });

  return (
    <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden font-sans">
      {appState === "upload" && (
        <DPAUploadState
          onFileSelected={runAnalysis}
          uploadError={error}
        />
      )}
      {appState === "analyzing" && (
        <DPAAnalyzingState fileName={fileName} steps={steps} />
      )}
      {appState === "results" && reviewResult && (
        <DPAResultsState
          fileName={fileName}
          reviewResult={reviewResult}
          onReset={reset}
        />
      )}
    </div>
  );
}
