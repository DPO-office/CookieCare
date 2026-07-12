import { useState, useRef, useEffect } from "react";
import type { FormEvent } from "react";
import { CookieScanResult } from "../../../shared/types";
import { ScanDepth } from "../types";
import { normalizeUrl, buildReportContentString, buildDownloadFilename } from "../utils";
import { startCookieScan, pollJobStatus, shareReportByEmail, exportReport } from "../api/cookieScannerApi";
import { apiUrl } from "../../../config";

export function useCookieScan(authToken: string) {
  const [url, setUrl] = useState("https://example.com");
  const [scanDepth, setScanDepth] = useState<ScanDepth>("Deep");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<CookieScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolvedRef = useRef(false);

  const cleanupListeners = () => {
    if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    resolvedRef.current = false;
  };

  useEffect(() => () => cleanupListeners(), []);

  const handleStartScan = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    cleanupListeners();
    setScanning(true); setError(null); setResult(null);
    setScanProgress("Preparing privacy scan request..."); setShareMessage(null);

    const cleanUrl = normalizeUrl(url);

    try {
      const { status, data } = await startCookieScan(authToken, cleanUrl, scanDepth);
      if (!data || data.error) throw new Error(data?.error || "Scan failed.");

      if (status === 202 && data.job_id) {
        const jobId: string = data.job_id;
        resolvedRef.current = false;
        setScanProgress("Scanning website for trackers and consent elements...");

        const finish = (r: any) => {
          if (resolvedRef.current) return;
          resolvedRef.current = true;
          setResult(r); setScanProgress(""); setScanning(false); cleanupListeners();
        };
        const fail = (msg: string) => {
          if (resolvedRef.current) return;
          resolvedRef.current = true;
          setError(msg); setScanProgress(""); setScanning(false); cleanupListeners();
        };

        const es = new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));
        eventSourceRef.current = es;
        es.onmessage = (event) => {
          try {
            const p = JSON.parse(event.data);
            if (p.event === "job_update" && p.job.id === jobId) {
              if (p.job.message) setScanProgress(p.job.message);
              if (p.job.status === "completed") finish(p.job.result);
              else if (p.job.status === "failed") fail(p.job.error);
            }
          } catch {}
        };
        es.onerror = () => { es.close(); eventSourceRef.current = null; };

        pollIntervalRef.current = setInterval(async () => {
          if (resolvedRef.current) return;
          try {
            const job = await pollJobStatus(authToken, jobId);
            if (job.status === "completed") finish(job.result);
            else if (job.status === "failed") fail(job.error || "Scan failed");
          } catch {}
        }, 4000);
        return;
      } else {
        setResult(data); setScanning(false);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setScanning(false);
    }
  };

  const handleShareReport = async (e: FormEvent) => {
    e.preventDefault();
    if (!shareEmail.trim() || !result) return;
    setSharing(true); setShareMessage(null);
    try {
      const { ok, error: err } = await shareReportByEmail(authToken, {
        recipientEmail: shareEmail.trim(),
        subject: `Lexify Cookie Scan - ${result.scanSummary.url}`,
        reportTitle: "Cookie Compliance Scan",
        contentType: "cookie_report",
        content: buildReportContentString(result),
        format: "pdf",
      });
      if (ok) { setShareMessage(`Report sent to ${shareEmail}.`); setShareEmail(""); }
      else throw new Error(err || "Failed to send report.");
    } catch (err: any) {
      setShareMessage(`Error: ${err.message}`);
    } finally {
      setSharing(false);
    }
  };

  const downloadReportFile = async (format: "pdf" | "docx") => {
    if (!result) return;
    const blob = await exportReport(authToken, {
      title: `Cookie Scan - ${result.scanSummary.url}`,
      contentType: "cookie_report",
      content: buildReportContentString(result),
      format,
    });
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = buildDownloadFilename(result.scanSummary.url, format);
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return {
    url, setUrl, scanDepth, setScanDepth,
    scanning, result, error, setError, scanProgress,
    shareEmail, setShareEmail, sharing, shareMessage,
    handleStartScan, handleShareReport, downloadReportFile,
  };
}
