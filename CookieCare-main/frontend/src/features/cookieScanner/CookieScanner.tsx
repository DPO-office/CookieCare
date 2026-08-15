import React from "react";
import { Globe } from "lucide-react";
import AiProgressOverlay from "../../shared/components/AiProgressOverlay";
import ScanForm from "./components/ScanForm";
import ScanResults from "./components/ScanResults";
import { useCookieScan } from "./hooks/useCookieScan";
import { CARD_SHADOW } from "./constants";

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
    <div className="dpa-results-bg relative min-h-0 flex-1 overflow-y-auto px-6 py-8 font-sans sm:px-10">
      {(scanning || !!error) && (
        <AiProgressOverlay
          visible={scanning || !!error}
          message={scanProgress}
          progress={scanProgressPct}
          error={error || ""}
          label="Scanning website"
          illustration="scan"
          onRetry={error ? () => setError(null) : undefined}
          onDismiss={error ? () => setError(null) : undefined}
        />
      )}

      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-8 max-w-2xl">
          <p className="m-0 mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#98A2B3]">
            Privacy · Scanner
          </p>
          <h1 className="m-0 text-[30px] font-semibold leading-tight tracking-[-0.03em] text-[#1a1a1a] sm:text-[34px]">
            Cookie scanner
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-[#667085]">
            Privacy compliance scan and consent engine.
          </p>
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
            <div
              className="flex flex-col items-center rounded-[24px] bg-white px-6 py-16 text-center"
              style={{ boxShadow: CARD_SHADOW }}
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
                <Globe className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <h3 className="m-0 text-[16px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
                Ready to scan
              </h3>
              <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-[#667085]">
                Enter a target URL above to scan for tracking scripts, parse cookie categories,
                and check banner compliance against GDPR, CCPA and DPDP.
              </p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
