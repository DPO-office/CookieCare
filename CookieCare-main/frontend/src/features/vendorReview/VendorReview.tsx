import { useVendorAnalysis } from "./hooks/useVendorAnalysis";
import { UploadState } from "./components/UploadState";
import { AnalyzingState } from "./components/AnalyzingState";
import { ResultsState } from "./components/ResultsState";

export default function VendorReview() {
  const { appState, fileNames, steps, handleFilesSelected, handleReset } =
    useVendorAnalysis();

  return (
    <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden font-sans">
      {appState === "upload"    && <UploadState    onFilesSelected={handleFilesSelected} />}
      {appState === "analyzing" && <AnalyzingState fileNames={fileNames} steps={steps} />}
      {appState === "results"   && <ResultsState   fileNames={fileNames} onReset={handleReset} />}
    </div>
  );
}
