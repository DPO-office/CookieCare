/**
 * useReportDownload
 *
 * Shared hook that manages download/loading state for the enterprise report.
 * Used by all three assessment result components.
 */
import { useState, useCallback } from "react";
import { generateEnterpriseReport } from "./generatePDF";
import type { EnterpriseReportData } from "./reportTypes";

interface UseReportDownloadReturn {
  isGenerating: boolean;
  downloadReport: (data: EnterpriseReportData, fileName: string) => Promise<void>;
}

export function useReportDownload(): UseReportDownloadReturn {
  const [isGenerating, setIsGenerating] = useState(false);

  const downloadReport = useCallback(
    async (data: EnterpriseReportData, fileName: string) => {
      if (isGenerating) return;
      setIsGenerating(true);
      try {
        await generateEnterpriseReport(data, fileName);
      } catch (err) {
        console.error("[Report] PDF generation failed:", err);
      } finally {
        setIsGenerating(false);
      }
    },
    [isGenerating]
  );

  return { isGenerating, downloadReport };
}
