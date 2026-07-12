import React from "react";
import { useAIEthicsAnalysis } from "./hooks/useAIEthicsAnalysis";
import { EthicsUploadState }    from "./components/EthicsUploadState";
import { EthicsAnalyzingState } from "./components/EthicsAnalyzingState";
import { EthicsResultsState }   from "./components/EthicsResultsState";

export default function AIEthicsScore() {
  const { appState, fileNames, steps, startAnalysis, reset } = useAIEthicsAnalysis();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {appState === "upload"    && <EthicsUploadState    onFilesSelected={startAnalysis} />}
      {appState === "analyzing" && <EthicsAnalyzingState fileNames={fileNames} steps={steps} />}
      {appState === "results"   && <EthicsResultsState   fileNames={fileNames} onReset={reset} />}
    </div>
  );
}
