import { useVendorAnalysis } from "./hooks/useVendorAnalysis";
import { UploadState }       from "./components/UploadState";
import { AnalyzingState }    from "./components/AnalyzingState";
import { ResultsState }      from "./components/ResultsState";

interface VendorReviewProps {
  authToken: string;
}

export default function VendorReview({ authToken }: VendorReviewProps) {
  const {
    appState,
    fileNames,
    steps,
    reviewResult,
    error,
    handleFilesSelected,
    handleReset,
  } = useVendorAnalysis({ authToken });

  return (
    <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden font-sans">
      {appState === "upload" && (
        <UploadState
          onFilesSelected={handleFilesSelected}
          uploadError={error}
        />
      )}
      {appState === "analyzing" && (
        <AnalyzingState fileNames={fileNames} steps={steps} />
      )}
      {appState === "results" && (
        <ResultsState
          fileNames={fileNames}
          reviewResult={reviewResult}
          onReset={handleReset}
        />
      )}
    </div>
  );
}
