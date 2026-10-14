import React from "react";
import { useAIEthicsAnalysis } from "./hooks/useAIEthicsAnalysis";
import { EthicsUploadState }    from "./components/EthicsUploadState";
import { EthicsAnalyzingState } from "./components/EthicsAnalyzingState";
import { EthicsResultsState }   from "./components/EthicsResultsState";
import { useAppContext } from "../../contexts/AppContext";

/** @deprecated authToken is now read from AppContext */
interface AIEthicsScoreProps {
  authToken?: string;
}

export default function AIEthicsScore(_props: AIEthicsScoreProps = {}) {
  const { authToken: ctxToken } = useAppContext();
  const authToken = ctxToken ?? "";
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
    <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden font-sans">
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
