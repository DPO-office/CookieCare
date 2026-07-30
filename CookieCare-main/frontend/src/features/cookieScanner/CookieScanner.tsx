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

      <div className="w-full max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-[26px] font-bold tracking-tight" style={{ color: "#2175D9" }}>Cookie scanner</h1>
          <p className="text-[13px] text-gray-500 mt-1">Privacy compliance scan and consent engine.</p>
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
            <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs px-6 py-10 text-center flex flex-col items-center">
              <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-3">
                <Globe className="w-5 h-5 text-gray-300" />
              </div>
              <h3 className="font-bold text-gray-900 text-[14px] mb-1.5 tracking-tight">Ready to scan</h3>
              <p className="text-[12px] text-gray-500 max-w-sm leading-relaxed">
                Enter a target URL above to scan for tracking scripts, parse cookie categories, and check banner compliance against GDPR, CCPA and DPDP.
              </p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
