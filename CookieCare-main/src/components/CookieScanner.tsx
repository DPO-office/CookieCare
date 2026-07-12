import React, { useState, useRef, useEffect } from "react";
import { apiUrl } from "../config";
import {
  Globe,
  Layers,
  ShieldAlert,
  CheckCircle,
  FileDown,
  Mail,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sparkles,
  Play,
  FileCheck,
  AlertTriangle,
} from "lucide-react";
import { CookieScanResult } from "../types";
import AiProgressOverlay from "./AiProgressOverlay";

interface CookieScannerProps {
  authToken: string;
}

export default function CookieScanner({ authToken }: CookieScannerProps) {
  const [url, setUrl] = useState("https://example.com");
  const [scanDepth, setScanDepth] = useState<"Lite" | "Medium" | "Deep" | "Enterprise">("Deep");
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

  const handleStartScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    cleanupListeners();
    setScanning(true); setError(null); setResult(null);
    setScanProgress("Preparing privacy scan request..."); setShareMessage(null);

    let cleanUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) cleanUrl = "https://" + cleanUrl;

    try {
      const res = await fetch(apiUrl("/api/vulnerabilities/scan-cookie"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ url: cleanUrl, scanDepth }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Compliance scanner failed.");

      if (res.status === 202 && data.job_id) {
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
            const pr = await fetch(apiUrl(`/api/jobs/${jobId}`), { headers: { Authorization: `Bearer ${authToken}` } });
            if (!pr.ok) return;
            const job = await pr.json();
            if (job.status === "completed") finish(job.result);
            else if (job.status === "failed") fail(job.error);
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

  const makeReportContentString = () => {
    if (!result) return "";
    return `Cookie Compliance Audit Report\nURL: ${result.scanSummary.url}\nScore: ${result.scanSummary.overallScore}/100\n\nTrackers: ${result.cookiesDetected.length}\nCompliance Gaps: ${result.complianceGaps.length}`;
  };

  const handleShareReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareEmail.trim() || !result) return;
    setSharing(true); setShareMessage(null);
    try {
      const res = await fetch(apiUrl("/api/reports/share-email"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ recipientEmail: shareEmail.trim(), subject: `Lexify Cookie Scan - ${result.scanSummary.url}`, reportTitle: `Cookie Compliance Scan`, contentType: "cookie_report", content: makeReportContentString(), format: "pdf" }),
      });
      const data = await res.json();
      if (res.ok) { setShareMessage(`Report sent to ${shareEmail}.`); setShareEmail(""); }
      else throw new Error(data.error || "Failed to send report.");
    } catch (err: any) {
      setShareMessage(`Error: ${err.message}`);
    } finally {
      setSharing(false);
    }
  };

  const downloadReportFile = async (format: "pdf" | "docx") => {
    if (!result) return;
    const res = await fetch(apiUrl("/api/documents/export"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ title: `Cookie Scan - ${result.scanSummary.url}`, contentType: "cookie_report", content: makeReportContentString(), format }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Lexify_Cookie_${result.scanSummary.url.replace(/https?:\/\/|www\./gi, "").replace(/[./\s]/gi, "_")}.${format}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const severityBadge = (s: string) => {
    if (s === "HIGH") return "bg-red-50 text-red-700 border-red-200";
    if (s === "MEDIUM") return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  };

  return (
    <div className="flex-1 overflow-y-auto px-10 py-8 bg-[#FAFAFB] min-h-screen relative">

      {(scanning || !!error) && (
        <AiProgressOverlay
          visible={scanning || !!error}
          message={scanProgress}
          error={error || ""}
          label="Scanning website..."
          onRetry={error ? () => setError(null) : undefined}
          onDismiss={error ? () => setError(null) : undefined}
        />
      )}

      {/* Header */}
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-gray-900 tracking-tight">Cookie Scanner</h1>
          <p className="text-[13px] text-gray-500 mt-1">Privacy compliance scan and consent engine.</p>
        </div>
      </div>

      {/* Scan form */}
      <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-7 mb-8">
        <h2 className="font-bold text-[14px] text-gray-900 mb-5">Audit settings</h2>
        <form onSubmit={handleStartScan} className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-end">
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Website URL</label>
              <div className="relative">
                <Globe className="absolute left-3.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  id="scan-url"
                  type="text"
                  required
                  disabled={scanning}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="e.g. www.example.com"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-[13px] text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 transition"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Scan depth</label>
              <div className="relative">
                <Layers className="absolute left-3.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                <select
                  id="scan-depth"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-[13px] text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 transition appearance-none cursor-pointer"
                  value={scanDepth}
                  onChange={(e) => setScanDepth(e.target.value as any)}
                >
                  <option value="Lite">Lite (1 page)</option>
                  <option value="Medium">Medium (5 pages)</option>
                  <option value="Deep">Deep (20 pages)</option>
                  <option value="Enterprise">Enterprise (full domain)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2 text-[12px] text-gray-400">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Includes consent bypass checking and dynamic policy matching.</span>
            </div>
            <button
              id="start-scanning-btn"
              type="submit"
              disabled={scanning}
              className="inline-flex items-center gap-2 bg-gray-900 text-white hover:bg-gray-800 rounded-xl py-2.5 px-6 text-[13px] font-semibold transition shadow-xs hover:shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {scanning ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /><span>Scanning…</span></>
              ) : (
                <><Play className="w-3.5 h-3.5 fill-current" /><span>Run audit</span></>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Results */}
      {result ? (
        <div className="space-y-6">

          {/* Score + KPIs */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
            <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-7 flex flex-col items-center justify-center text-center">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Overall score</p>
              <div className={`w-24 h-24 rounded-2xl flex flex-col items-center justify-center ${
                result.scanSummary.overallScore >= 80 ? "bg-emerald-50 text-emerald-700" :
                result.scanSummary.overallScore >= 50 ? "bg-amber-50 text-amber-700" :
                "bg-red-50 text-red-700"
              }`}>
                <span className="text-3xl font-bold tabular-nums">{result.scanSummary.overallScore}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider mt-0.5">/ 100</span>
              </div>
            </div>

            {[
              {
                label: "Consent banner",
                value: result.scanSummary.hasConsentBanner ? "Found" : "Missing",
                ok: result.scanSummary.hasConsentBanner,
                note: result.scanSummary.hasConsentBanner ? "Compliant banner detected." : "GDPR requires a consent banner.",
                icon: FileCheck,
              },
              {
                label: "Pre-consent loading",
                value: result.scanSummary.loadsBeforeConsent ? "Loads before" : "Compliant",
                ok: !result.scanSummary.loadsBeforeConsent,
                note: result.scanSummary.loadsBeforeConsent ? "Trackers load before opt-in. Critical gap." : "Trackers wait for approval.",
                icon: Layers,
              },
              {
                label: "Total trackers",
                value: `${result.scanSummary.totalCookiesCount} isolated`,
                ok: true,
                note: "Calculated at selected scan depth.",
                icon: Globe,
              },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-5 flex flex-col justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">{kpi.label}</p>
                  <div className="flex items-center gap-2">
                    <kpi.icon className={`w-4 h-4 ${kpi.ok ? "text-emerald-500" : "text-red-500"}`} />
                    <span className={`text-[13px] font-bold ${kpi.ok ? "text-emerald-700" : "text-red-700"}`}>{kpi.value}</span>
                  </div>
                </div>
                <p className="text-[12px] text-gray-500 mt-3 leading-relaxed">{kpi.note}</p>
              </div>
            ))}
          </div>

          {/* Export / Share */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-6">
              <h3 className="font-bold text-[14px] text-gray-900 mb-1">Download report</h3>
              <p className="text-[12px] text-gray-500 mb-4">Export this scan as a legal compliance document.</p>
              <div className="flex gap-2">
                <button id="download-docx-btn" onClick={() => downloadReportFile("docx")} className="inline-flex items-center gap-2 bg-gray-900 text-white hover:bg-gray-800 rounded-xl px-4 py-2.5 text-[13px] font-medium transition shadow-xs cursor-pointer">
                  <FileDown className="w-3.5 h-3.5" /><span>DOCX</span>
                </button>
                <button id="download-pdf-btn" onClick={() => downloadReportFile("pdf")} className="inline-flex items-center gap-2 bg-gray-900 text-white hover:bg-gray-800 rounded-xl px-4 py-2.5 text-[13px] font-medium transition shadow-xs cursor-pointer">
                  <FileDown className="w-3.5 h-3.5" /><span>PDF</span>
                </button>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-6">
              <h3 className="font-bold text-[14px] text-gray-900 mb-1">Share report</h3>
              <p className="text-[12px] text-gray-500 mb-4">Send to counselors, partners, or clients.</p>
              <form onSubmit={handleShareReport} className="flex gap-2">
                <input type="email" required placeholder="partner@legalfirm.com" className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 transition" value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} />
                <button type="submit" disabled={sharing || !shareEmail} className="inline-flex items-center gap-2 bg-gray-900 text-white hover:bg-gray-800 rounded-xl px-4 py-2.5 text-[13px] font-medium transition shadow-xs cursor-pointer disabled:opacity-50">
                  {sharing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
                  <span>Send</span>
                </button>
              </form>
              {shareMessage && <p className="text-[12px] text-emerald-600 mt-2">{shareMessage}</p>}
            </div>
          </div>

          {/* Trackers + Gaps */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <h3 className="font-bold text-[14px] text-gray-900">Tracker registry</h3>
                <span className="text-[12px] text-gray-400 font-medium">{result.cookiesDetected.length} trackers</span>
              </div>
              {result.cookiesDetected.length === 0 ? (
                <div className="px-6 py-10 text-center text-[13px] text-gray-400">No trackers isolated.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        {["Name", "Category", "Domain", "Retention", "Severity"].map((h) => (
                          <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {result.cookiesDetected.map((cookie, i) => (
                        <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-5 py-3.5 font-medium text-gray-900">{cookie.name}</td>
                          <td className="px-5 py-3.5"><span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-700">{cookie.category}</span></td>
                          <td className="px-5 py-3.5 text-gray-500 text-[12px] font-mono truncate max-w-[120px]">{cookie.domain}</td>
                          <td className="px-5 py-3.5 text-gray-500 text-[12px]">{cookie.retention}</td>
                          <td className="px-5 py-3.5"><span className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${severityBadge(cookie.severity)}`}>{cookie.severity}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2 bg-gray-50">
                <ShieldAlert className="w-4 h-4 text-gray-500" />
                <h3 className="font-bold text-[14px] text-gray-900">Compliance gaps</h3>
              </div>
              {result.complianceGaps.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <p className="text-[13px] text-emerald-700 font-medium">No compliance gaps found</p>
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  {result.complianceGaps.map((gap, i) => {
                    const borderClass = gap.severity === "RED" ? "border-l-red-400" : gap.severity === "YELLOW" ? "border-l-amber-400" : "border-l-emerald-400";
                    return (
                      <div key={gap.id || i} className={`border border-gray-100 border-l-4 ${borderClass} rounded-xl p-3.5 bg-gray-50`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[12px] font-bold text-gray-700">{gap.regulation}</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${severityBadge(gap.severity === "RED" ? "HIGH" : gap.severity === "YELLOW" ? "MEDIUM" : "LOW")}`}>
                            {gap.severity}
                          </span>
                        </div>
                        <p className="text-[12px] font-medium text-gray-800 mb-1">{gap.issue}</p>
                        <p className="text-[11px] text-gray-500 leading-relaxed">{gap.remediation}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
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
