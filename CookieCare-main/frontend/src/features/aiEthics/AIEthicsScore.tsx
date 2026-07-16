import React from "react";
import { useAIEthicsAnalysis } from "./hooks/useAIEthicsAnalysis";
import { EthicsUploadState }    from "./components/EthicsUploadState";
import { EthicsAnalyzingState } from "./components/EthicsAnalyzingState";
import { EthicsResultsState }   from "./components/EthicsResultsState";

interface AIEthicsScoreProps {
  authToken: string;
}

export default function AIEthicsScore({ authToken }: AIEthicsScoreProps) {
  const {
    appState,
    fileNames,
    steps,
    reviewResult,
    error,
    startAnalysis,
    reset,
  } = useAIEthicsAnalysis({ authToken });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {appState === "upload" && (
        <EthicsUploadState onFilesSelected={startAnalysis} error={error} />
      )}
      {appState === "analyzing" && (
        <EthicsAnalyzingState fileNames={fileNames} steps={steps} />
      )}
      {appState === "results" && reviewResult && (
        <EthicsResultsState
          fileNames={fileNames}
          result={reviewResult}
          onReset={reset}
        />
      )}
    </div>
  );
}
