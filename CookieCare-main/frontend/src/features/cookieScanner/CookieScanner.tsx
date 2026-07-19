import React from "react";
import { Globe } from "lucide-react";
import AiProgressOverlay from "../../shared/components/AiProgressOverlay";
import ScanForm from "./components/ScanForm";
import ScanResults from "./components/ScanResults";
import { useCookieScan } from "./hooks/useCookieScan";

interface CookieScannerProps {
  authToken: string;
}

export default function CookieScanner({ authToken }: CookieScannerProps) {
  const {
    url, setUrl, scanDepth, setScanDepth,
    scanning, result, error, setError, scanProgress, scanProgressPct,
    shareEmail, setShareEmail, sharing, shareMessage,
    handleStartScan, handleShareReport, downloadReportFile,
  } = useCookieScan(authToken);

  return (
    <div className="flex-1 overflow-y-auto px-10 py-8 bg-[#FAFAFB] min-h-screen relative">

      {(scanning || !!error) && (
        <AiProgressOverlay
          visible={scanning || !!error}
          message={scanProgress}
          progress={scanProgressPct}
          error={error || ""}
          label="Scanning website..."
          onRetry={error ? () => setError(null) : undefined}
          onDismiss={error ? () => setError(null) : undefined}
        />
      )}

      <div className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-gray-900 tracking-tight">Cookie Scanner</h1>
          <p className="text-[13px] text-gray-500 mt-1">Privacy compliance scan and consent engine.</p>
        </div>
      </div>

      <ScanForm
        url={url}
        scanDepth={scanDepth}
        scanning={scanning}
        onUrlChange={setUrl}
        onDepthChange={setScanDepth}
        onSubmit={handleStartScan}
      />

      {result ? (
        <ScanResults
          result={result}
          shareEmail={shareEmail}
          sharing={sharing}
          shareMessage={shareMessage}
          onShareEmailChange={setShareEmail}
          onShareSubmit={handleShareReport}
          onDownload={downloadReportFile}
        />
      ) : (
        !scanning && (
          <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-16 text-center flex flex-col items-center">
            <Globe className="w-12 h-12 text-gray-200 mb-4" />
            <h3 className="font-bold text-gray-900 text-[16px] mb-2 tracking-tight">Ready to scan</h3>
            <p className="text-[13px] text-gray-500 max-w-md leading-relaxed">
              Enter a target URL above to scan for tracking scripts, parse cookie categories, and check banner compliance against GDPR, CCPA and DPDP.
            </p>
          </div>
        )
      )}
    </div>
  );
}
