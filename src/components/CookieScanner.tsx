import React, { useState } from "react";
import { apiUrl } from "../config";
import { 
  Globe, 
  Layers, 
  ShieldAlert, 
  AlertTriangle, 
  CheckCircle,
  HelpCircle,
  FileDown, 
  Mail, 
  RefreshCw, 
  Share2, 
  ShieldCheck, 
  Sparkles,
  Search,
  Lock,
  Play,
  FileCheck
} from "lucide-react";
import { CookieScanResult, CookieDetected, PrivacyComplianceGap } from "../types";

interface CookieScannerProps {
  authToken: string;
}

export default function CookieScanner({ authToken }: CookieScannerProps) {
  const [url, setUrl] = useState("https://example.com");
  const [scanDepth, setScanDepth] = useState<"Lite" | "Medium" | "Deep" | "Enterprise">("Deep");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<CookieScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareEmail, setShareEmail] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  // Trigger Scanner Api
  const handleStartScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setScanning(true);
    setError(null);
    setResult(null);
    setShareMessage(null);

    // Format URL safely
    let cleanUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = "https://" + cleanUrl;
    }

    try {
      const res = await fetch(apiUrl("/api/vulnerabilities/scan-cookie"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ url: cleanUrl, scanDepth })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Compliance scanner failed. Please try again.");
      }

      if (res.status === 202 && data.job_id) {
        // SSE for real-time progress
        const eventSource = new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));

        eventSource.onmessage = (event) => {
          const payload = JSON.parse(event.data);

          if (payload.event === "job_update" && payload.job.id === data.job_id) {
            const job = payload.job;
            if (job.status === "completed") {
              setResult(job.result);
              setScanning(false);
              eventSource.close();
            } else if (job.status === "failed") {
              setError(job.error || "Scanner failed unexpectedly.");
              setScanning(false);
              eventSource.close();
            }
          }
        };

        eventSource.onerror = (err) => {
          console.error("SSE Error:", err);
          eventSource.close();
          // Fallback to polling if SSE fails
          pollJob(data.job_id);
        };
      } else {
        setResult(data);
        setScanning(false);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during privacy web audit.");
    } finally {
      setScanning(false);
    }
  };

  const pollJob = async (jobId: string) => {
    let completed = false;
    let attempts = 0;
    while (!completed && attempts < 100) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      attempts++;
      const checkRes = await fetch(apiUrl(`/api/jobs/${jobId}`), {
        headers: { "Authorization": `Bearer ${authToken}` },
      });
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (checkData.status === "completed") {
          setResult(checkData.result);
          setScanning(false);
          completed = true;
        } else if (checkData.status === "failed") {
          setError(checkData.error || "Job failed.");
          setScanning(false);
          completed = true;
        }
      }
    }
  };

  const handleShareReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareEmail.trim() || !result) return;
    setSharing(true);
    setShareMessage(null);

    try {
      const reportContent = makeReportContentString();
      const res = await fetch(apiUrl("/api/reports/share-email"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          recipientEmail: shareEmail.trim(),
          subject: `PrivSecAI Cookie Compliance Scan - ${result.scanSummary.url}`,
          reportTitle: `Cookie Compliance Scan - ${result.scanSummary.url}`,
          contentType: "cookie_report",
          content: reportContent,
          format: "pdf"
        })
      });

      const data = await res.json();
      if (res.ok) {
        setShareMessage(`Report has been successfully transmitted to ${shareEmail}.`);
        setShareEmail("");
      } else {
        throw new Error(data.error || "Failed to dispatch audit logs.");
      }
    } catch (err: any) {
      setShareMessage(`Error sharing: ${err.message}`);
    } finally {
      setSharing(false);
    }
  };

  // Helper to generate dynamic report contents
  const makeReportContentString = () => {
    if (!result) return "";
    return `=====================================================
COOKIE CARE AUDIT REPORT - PRIVACY & REGULATORY COMPLIANCE
=====================================================
Target URL:  ${result.scanSummary.url}
Scan Level:  ${result.scanSummary.level}
Audit Score: ${result.scanSummary.overallScore}/100
Timestamp:   ${new Date(result.scanSummary.scannedAt).toLocaleString()}
-----------------------------------------------------
Consent Banner Found:       ${result.scanSummary.hasConsentBanner ? "YES" : "NO"}
Consent Bypass Checked:     ${result.scanSummary.loadsBeforeConsent ? "CRITICAL VALUE - THIRD PARTY DYNAMIC ASSIGN" : "SECURE"}
Total Elements Isolated:    ${result.scanSummary.totalCookiesCount} trackers

=====================================================
TRACKER REGISTRY DETECTED (${result.cookiesDetected.length})
=====================================================
${result.cookiesDetected.map(c => `
Name:      ${c.name}
Category:  ${c.category}
Domain:    ${c.domain}
Retention: ${c.retention}
Severity:  ${c.severity}
Description: ${c.description}
-----------------------------------------------------`).join("")}

=====================================================
REGULATORY COMPLIANCE ASSESSMENT (GDPR / CCPA / DPDP)
=====================================================
${result.complianceGaps.map(g => `
[${g.regulation}] Severity: ${g.severity}
Issue Identified:
${g.issue}

Remediation Steps Required:
${g.remediation}
-----------------------------------------------------`).join("")}

Report secured and validated by Cookie Care FIPS Sandbox services.`;
  };

  const downloadReportFile = async (format: "pdf" | "docx") => {
    if (!result) return;

    const reportContent = makeReportContentString();
    const res = await fetch(apiUrl("/api/documents/export"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`
      },
      body: JSON.stringify({
        title: `Cookie Compliance Scan - ${result.scanSummary.url}`,
        contentType: "cookie_report",
        content: reportContent,
        format,
      })
    });

    if (!res.ok) {
      throw new Error("Backend export failed");
    }

    const blob = await res.blob();
    const element = document.createElement("a");
    element.href = URL.createObjectURL(blob);
    element.download = `PrivSecAI_Compliance_${result?.scanSummary.url.replace(/https?:\/\/|www\./gi, "").replace(/[\.\s\/]/gi, "_")}.${format}`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="flex-1 overflow-y-auto p-10 font-sans grid-bg min-h-screen">
      
      {/* BRAND & HEADER SECTION */}
      <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-gray-900 tracking-tight">
            Cookie Scanner
          </h1>
          <p className="text-sm text-gray-500 font-mono tracking-wider uppercase mt-1">
            Privacy Compliance Scan & Consensus Engine
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs font-mono text-gray-500 bg-white shadow-xs border border-gray-200/60 rounded-full py-1.5 px-3">
          <ShieldCheck className="w-4.5 h-4.5 text-emerald-600" />
          <span>Real-time Compliance Sandbox</span>
        </div>
      </div>

      {/* CORE CONTROL INPUT CANVAS - ARCHITECTURAL BLACK & WHITE GRIDS */}
      <div className="bg-white border-2 border-black rounded-none p-6 md:p-8 shadow-xs mb-10">
        <h2 className="text-xl font-display font-bold text-gray-900 uppercase tracking-tight mb-4 flex items-center space-x-2">
          <span>Target Web Audit Settings</span>
        </h2>
        
        <form onSubmit={handleStartScan} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-end">
            
            {/* Website URL Input */}
            <div className="lg:col-span-2">
              <label htmlFor="scan-url" className="block text-xs font-bold text-black uppercase tracking-wider mb-2 font-mono">
                Website Audit URL
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-black">
                  <Globe className="w-4.5 h-4.5" />
                </div>
                <input
                  id="scan-url"
                  type="text"
                  required
                  placeholder="e.g. www.shoppingsite.com"
                  className="w-full bg-white text-black border-2 border-black rounded-none py-3.5 pl-11 pr-4 text-sm font-semibold focus:ring-0 focus:outline-none focus:bg-gray-50 font-mono"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
            </div>

            {/* Scan Depth Selector */}
            <div>
              <label htmlFor="scan-depth" className="block text-xs font-bold text-black uppercase tracking-wider mb-2 font-mono">
                Scan Depth Level
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-black">
                  <Layers className="w-4.5 h-4.5" />
                </div>
                <select
                  id="scan-depth"
                  className="w-full bg-white text-black border-2 border-black rounded-none py-3.5 pl-11 pr-8 text-sm font-semibold focus:ring-0 focus:outline-none focus:bg-gray-50 font-mono appearance-none"
                  value={scanDepth}
                  onChange={(e) => setScanDepth(e.target.value as any)}
                >
                  <option value="Lite">Lite Scan (1 page + header inspection)</option>
                  <option value="Medium">Medium Scan (5 subpages + tracker mapping)</option>
                  <option value="Deep">Deep Scan (20 subpages + Consent Banner check)</option>
                  <option value="Enterprise">Enterprise Scan (Full Domain + Consent Bypass Test)</option>
                </select>
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-black">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                  </svg>
                </div>
              </div>
            </div>

          </div>

          <div className="flex flex-col sm:flex-row justify-between items-center pt-2 border-t border-gray-100 gap-4">
            <div className="flex items-center space-x-2 text-xs font-mono text-gray-500">
              <Sparkles className="w-3.5 h-3.5 text-gray-500" />
              <span>Audit includes Consent bypass checking & dynamic policy matching.</span>
            </div>
            
            <button
              id="start-scanning-btn"
              type="submit"
              disabled={scanning}
              className="w-full sm:w-auto bg-black text-white hover:bg-gray-900 border-2 border-black rounded-none py-3 px-8 font-bold font-mono text-xs uppercase tracking-wider flex items-center justify-center space-x-2.5 transition-all shadow-md disabled:opacity-50 cursor-pointer"
            >
              {scanning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Scanning Cloud Assets...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Trigger Privacy Audit</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* ERROR WARNING */}
      {error && (
        <div className="mb-8 p-5 bg-red-50 border-2 border-red-500 text-red-700 text-xs rounded-none font-mono">
          <div className="flex items-center space-x-2 font-bold uppercase mb-1">
            <ShieldAlert className="w-4.5 h-4.5" />
            <span>Audit Connection Timeout</span>
          </div>
          <p>{error}</p>
        </div>
      )}

      {/* RESULTS DISPLAY PANEL */}
      {result ? (
        <div className="space-y-8 animate-fade-in">
          
          {/* DUAL CANVAS CONTAINER: KPIs / AUDIT HERO */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 bg-white border-2 border-black p-6 md:p-8 rounded-none">
            
            <div className="lg:border-r border-black/10 pr-6 flex flex-col justify-center items-center text-center">
              <span className="text-[10px] font-bold text-gray-400 font-mono uppercase tracking-widest block mb-2">Overall Scoring KPI</span>
              <div className="relative flex items-center justify-center">
                {/* Visual circle rating */}
                <div className={`w-28 h-28 rounded-full border-4 flex flex-col items-center justify-center ${
                  result.scanSummary.overallScore >= 80 
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800" 
                    : result.scanSummary.overallScore >= 50 
                    ? "border-yellow-500 bg-yellow-50 text-yellow-800"
                    : "border-red-500 bg-red-50 text-red-800"
                }`}>
                  <span className="text-3xl font-display font-black leading-none">{result.scanSummary.overallScore}</span>
                  <span className="text-[10px] font-mono uppercase tracking-tight mt-0.5">HEALTH</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-6 font-mono text-xs p-4">
              <div className="bg-gray-50 border border-gray-200 p-4">
                <span className="text-gray-400 text-[10px] uppercase font-bold block mb-1">Consent Banner</span>
                <span className={`text-base font-bold flex items-center space-x-1.5 ${result.scanSummary.hasConsentBanner ? "text-emerald-700" : "text-red-700"}`}>
                  <FileCheck className="w-4.5 h-4.5" />
                  <span>{result.scanSummary.hasConsentBanner ? "DETECTION: FOUND" : "DETECTION: NONE"}</span>
                </span>
                <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
                  {result.scanSummary.hasConsentBanner ? "A compliant banner checks user choices." : "CCPA/CCPA-like standards mandate opting-out headers."}
                </p>
              </div>

              <div className="bg-gray-50 border border-gray-200 p-4">
                <span className="text-gray-400 text-[10px] uppercase font-bold block mb-1">Bypass Consent Check</span>
                <span className={`text-base font-bold flex items-center space-x-1.5 ${result.scanSummary.loadsBeforeConsent ? "text-red-700" : "text-emerald-700"}`}>
                  <Layers className="w-4.5 h-4.5" />
                  <span>{result.scanSummary.loadsBeforeConsent ? "LOADS BEFORE" : "MUTED (OK)"}</span>
                </span>
                <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
                  {result.scanSummary.loadsBeforeConsent ? "Trackers load prior to client opting-in. Severe GDPR gap." : "Static cookies require active approval."}
                </p>
              </div>

              <div className="bg-gray-50 border border-gray-200 p-4">
                <span className="text-gray-400 text-[10px] uppercase font-bold block mb-1">Total Web Element Logs</span>
                <span className="text-base font-bold text-gray-900 block font-sans">
                  {result.scanSummary.totalCookiesCount} Isolated Elements
                </span>
                <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
                  Calculated against standard depth tier. Contains analytics and dynamic metadata.
                </p>
              </div>
            </div>

          </div>

          {/* REPORT EXPORT / SHARING CONTROLS (ON PANEL CANVAS) */}
          <div className="bg-white border-2 border-black p-6 rounded-none grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <h3 className="font-display font-black text-black uppercase tracking-tight text-sm">Download Legal Report Ledger</h3>
              <p className="text-xs text-gray-500 mt-1">Export this compliance scan raw matrix as legal proof for regulatory audits.</p>
              <div className="flex space-x-3 mt-4">
                <button
                  id="download-docx-btn"
                  onClick={() => downloadReportFile("docx")}
                  className="bg-black hover:bg-gray-800 text-white rounded-none border border-black py-2.5 px-4 font-mono font-bold text-xs uppercase tracking-wider flex items-center space-x-1.5 transition-all shadow-sm cursor-pointer"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Download .DOCX</span>
                </button>
                <button
                  id="download-pdf-btn"
                  onClick={() => downloadReportFile("pdf")}
                  className="bg-black hover:bg-gray-800 text-white rounded-none border border-black py-2.5 px-4 font-mono font-bold text-xs uppercase tracking-wider flex items-center space-x-1.5 transition-all shadow-sm cursor-pointer"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Download .PDF</span>
                </button>
              </div>
            </div>

            <div>
              <h3 className="font-display font-black text-black uppercase tracking-tight text-sm">Safe Transmission & Share</h3>
              <p className="text-xs text-gray-500 mt-1">Securely dispatch compliance data report to counselors, partners or clients.</p>
              
              <form onSubmit={handleShareReport} className="flex space-x-2 mt-4">
                <input
                  type="email"
                  required
                  placeholder="partner@legalfirm.com"
                  className="bg-white text-black text-xs border border-gray-300 p-2.5 flex-1 focus:ring-1 focus:ring-black focus:outline-none font-mono"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={sharing || !shareEmail}
                  className="bg-black text-white hover:bg-gray-800 py-2.5 px-4 text-xs font-mono font-bold uppercase tracking-wide flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                >
                  {sharing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Share2 className="w-3.5 h-3.5" />
                  )}
                  <span>Transmit</span>
                </button>
              </form>
              
              {shareMessage && (
                <p className="text-[10px] font-mono text-emerald-700 italic mt-2">
                  {shareMessage}
                </p>
              )}
            </div>
          </div>

          {/* DUAL SECTION PANELS */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            
            {/* PANEL 1: TRACKERS REGISTER TABLE (LEFT 2 COLS) */}
            <div className="lg:col-span-2 bg-white border-2 border-black p-6 rounded-none">
              <div className="flex justify-between items-center border-b-2 border-black pb-3 mb-6">
                <h3 className="text-base font-display font-extrabold uppercase text-gray-900 tracking-tight">
                  Tracker Payload Registry Table
                </h3>
                <span className="font-mono text-[10px] text-gray-500">
                  {result.cookiesDetected.length} TRACKERS REGISTERED
                </span>
              </div>

              {result.cookiesDetected.length === 0 ? (
                <div className="py-12 text-center text-xs font-mono text-gray-400 font-semibold uppercase italic bg-gray-50">
                  No tracking scripts or storage units isolated.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-sans">
                    <thead>
                      <tr className="border-b border-gray-300 font-mono text-black uppercase text-[10px] font-extrabold bg-gray-50 p-2 text-left">
                        <th className="py-3 px-3">Name</th>
                        <th className="py-3 px-3">Category</th>
                        <th className="py-3 px-2">Domain</th>
                        <th className="py-3 px-2">Retention</th>
                        <th className="py-3 px-2 text-right">Severity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-mono text-[11px]">
                      {result.cookiesDetected.map((cookie, i) => {
                        let severityColor = "bg-green-50 text-green-700 border-green-200";
                        if (cookie.severity === "HIGH") severityColor = "bg-red-50 text-red-700 border-red-200 font-bold";
                        else if (cookie.severity === "MEDIUM") severityColor = "bg-amber-50 text-amber-700 border-amber-200";

                        let categoryColor = "bg-gray-100 text-gray-700";
                        if (cookie.category === "Essential") categoryColor = "bg-black text-white text-[9px]";
                        else if (cookie.category === "Marketing") categoryColor = "bg-sky-50 text-sky-700 border border-sky-100";
                        else if (cookie.category === "Analytics") categoryColor = "bg-pink-50 text-pink-700 border border-pink-100";

                        return (
                          <tr key={i} className="hover:bg-gray-50 transition-colors">
                            <td className="py-3 px-3 font-semibold text-gray-900 select-all pr-2">{cookie.name}</td>
                            <td className="py-3 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-medium uppercase ${categoryColor}`}>
                                {cookie.category}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-gray-500 font-mono select-all truncate max-w-[120px]" title={cookie.domain}>{cookie.domain}</td>
                            <td className="py-3 px-2 text-gray-500 font-mono">{cookie.retention}</td>
                            <td className="py-3 px-2 text-right">
                              <span className={`px-2 py-0.5 border text-[10px] rounded uppercase font-bold tracking-tight inline-block ${severityColor}`}>
                                {cookie.severity}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* PANEL 2: REGULATORY PRIVACY GAPS BREAKDOWN (RIGHT 1 COL) */}
            <div className="bg-white border-2 border-black p-6 rounded-none space-y-6">
              <div className="border-b-2 border-black pb-3 mb-4">
                <h3 className="text-base font-display font-extrabold uppercase text-gray-900 tracking-tight flex items-center space-x-2">
                  <ShieldAlert className="w-5 h-5 text-black shrink-0" />
                  <span>Compliance Gaps Matrix</span>
                </h3>
                <p className="text-[10px] text-gray-400 font-mono tracking-wide mt-1 uppercase">GDPR • CCPA • DPDP PARSER</p>
              </div>

              {result.complianceGaps.length === 0 ? (
                <div className="py-6 text-center text-xs font-mono text-emerald-600 font-bold uppercase bg-emerald-50 border border-emerald-200">
                  This domain fits global guidelines. No gaps discovered.
                </div>
              ) : (
                <div className="space-y-4">
                  {result.complianceGaps.map((gap, i) => {
                    let alertColor = "border-l-4 border-l-green-500 border border-gray-200";
                    let badgeColor = "bg-green-100 text-green-800 text-[9px]";
                    
                    if (gap.severity === "RED") {
                      alertColor = "border-l-4 border-l-red-500 border border-gray-200";
                      badgeColor = "bg-red-100 text-red-800 font-bold text-[9px]";
                    } else if (gap.severity === "YELLOW") {
                      alertColor = "border-l-4 border-l-amber-500 border border-gray-200";
                      badgeColor = "bg-amber-100 text-amber-800 text-[9px]";
                    }

                    return (
                      <div key={gap.id || i} className={`p-4 rounded-none font-sans bg-white ${alertColor} shadow-md`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-xs font-bold text-gray-800">{gap.regulation}</span>
                          <span className={`px-2 py-0.5 font-mono rounded uppercase tracking-wide ${badgeColor}`}>
                            {gap.severity} LEVEL RISK
                          </span>
                        </div>
                        
                        <div className="space-y-2 mt-2">
                          <div className="text-xs leading-normal">
                            <span className="text-[10px] font-mono text-gray-400 font-bold uppercase block">Violation Issue:</span>
                            <p className="text-gray-900 font-semibold">{gap.issue}</p>
                          </div>
                          
                          <div className="text-xs leading-normal bg-gray-50 p-2.5 border border-gray-200/50">
                            <span className="text-[10px] font-mono text-emerald-700 font-bold uppercase block">Required Remediation:</span>
                            <p className="text-gray-700 font-bold mt-0.5">{gap.remediation}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

        </div>
      ) : (
        /* IDLE STATE: PROMPTING SCAN START */
        <div className="bg-white border-2 border-dashed border-black p-16 text-center flex flex-col items-center justify-center">
          <Globe className="w-16 h-16 text-black mb-6 animate-pulse" />
          <h3 className="font-display font-extrabold text-black text-xl uppercase tracking-tight">Compliance Scan Not Executed</h3>
          <p className="text-gray-500 text-sm max-w-md mx-auto mt-2 leading-relaxed">
            Specify a target corporate URL with necessary depth specifications above to scan scripts, parse tracker categories, and check banner compliance.
          </p>
        </div>
      )}

    </div>
  );
}
