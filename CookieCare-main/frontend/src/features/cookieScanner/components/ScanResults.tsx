import React from "react";
import {
  FileDown, Share2, RefreshCw, ShieldAlert, CheckCircle,
  FileCheck, Layers, Globe, GitCompareArrows,
} from "lucide-react";
import { CookieScanResult } from "../../../shared/types";
import { severityBadgeClass } from "../utils";
import { TRACKER_TABLE_HEADERS } from "../constants";

interface ScanResultsProps {
  result: CookieScanResult;
  shareEmail: string;
  sharing: boolean;
  shareMessage: string | null;
  onShareEmailChange: (v: string) => void;
  onShareSubmit: (e: React.FormEvent) => void;
  onDownload: () => void;
}

export default function ScanResults({
  result, shareEmail, sharing, shareMessage,
  onShareEmailChange, onShareSubmit, onDownload,
}: ScanResultsProps) {
  const kpis = [
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
  ];

  return (
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
        {kpis.map((kpi) => (
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
          <button id="download-pdf-btn" onClick={onDownload} className="inline-flex items-center gap-2 bg-gray-900 text-white hover:bg-gray-800 rounded-xl px-4 py-2.5 text-[13px] font-medium transition shadow-xs cursor-pointer">
            <FileDown className="w-3.5 h-3.5" /><span>Download PDF Report</span>
          </button>
        </div>
        <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-6">
          <h3 className="font-bold text-[14px] text-gray-900 mb-1">Share report</h3>
          <p className="text-[12px] text-gray-500 mb-4">Send to counselors, partners, or clients.</p>
          <form onSubmit={onShareSubmit} className="flex gap-2">
            <input type="email" required placeholder="partner@legalfirm.com" className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 transition" value={shareEmail} onChange={(e) => onShareEmailChange(e.target.value)} />
            <button type="submit" disabled={sharing || !shareEmail} className="inline-flex items-center gap-2 bg-gray-900 text-white hover:bg-gray-800 rounded-xl px-4 py-2.5 text-[13px] font-medium transition shadow-xs cursor-pointer disabled:opacity-50">
              {sharing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>Send</span>
            </button>
          </form>
          {shareMessage && (
            <p className={`text-[12px] mt-2 ${shareMessage === "Report shared successfully." ? "text-emerald-600" : "text-red-600"}`}>
              {shareMessage}
            </p>
          )}
        </div>
      </div>

      {/* Trackers + Gaps */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
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
                    {TRACKER_TABLE_HEADERS.map((h) => (
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
                      <td className="px-5 py-3.5"><span className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${severityBadgeClass(cookie.severity)}`}>{cookie.severity}</span></td>
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
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${severityBadgeClass(gap.severity === "RED" ? "HIGH" : gap.severity === "YELLOW" ? "MEDIUM" : "LOW")}`}>
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

      {/* Enterprise — Consent Comparison Card */}
      {result.enterpriseReport?.consentComparison && (() => {
        const cc = result.enterpriseReport!.consentComparison!;
        const isPass = cc.complianceSummary.startsWith("PASS");
        const acceptDelta = cc.acceptCount - cc.preConsentCount;
        const rejectDelta = cc.rejectCount - cc.preConsentCount;
        return (
          <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-2">
                <GitCompareArrows className="w-4 h-4 text-gray-500" />
                <h3 className="font-bold text-[14px] text-gray-900">Consent Comparison</h3>
              </div>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md ${isPass ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                {isPass ? "PASS" : "FAIL"}
              </span>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: counts */}
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
                  <span className="text-[12px] text-gray-500 font-medium">Before Consent</span>
                  <span className="text-[14px] font-bold text-gray-900 tabular-nums">{cc.preConsentCount} cookies</span>
                </div>
                <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
                  <span className="text-[12px] text-gray-500 font-medium">After Accept</span>
                  <span className="text-[14px] font-bold text-gray-900 tabular-nums">
                    {cc.acceptCount}{" "}
                    <span className={`text-[12px] font-semibold ${acceptDelta >= 0 ? "text-amber-600" : "text-emerald-600"}`}>
                      ({acceptDelta >= 0 ? "+" : ""}{acceptDelta})
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
                  <span className="text-[12px] text-gray-500 font-medium">After Reject</span>
                  <span className="text-[14px] font-bold text-gray-900 tabular-nums">
                    {cc.rejectCount}{" "}
                    <span className={`text-[12px] font-semibold ${rejectDelta <= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      ({rejectDelta >= 0 ? "+" : ""}{rejectDelta})
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-[12px] text-gray-500 font-medium">Added after Accept</span>
                  <span className={`text-[13px] font-bold tabular-nums ${cc.addedAfterAccept.length > 0 ? "text-amber-700" : "text-emerald-700"}`}>{cc.addedAfterAccept.length}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-[12px] text-gray-500 font-medium">Marketing enabled after Accept</span>
                  <span className={`text-[13px] font-bold tabular-nums ${cc.marketingEnabledAfterAccept.length > 0 ? "text-amber-700" : "text-emerald-700"}`}>{cc.marketingEnabledAfterAccept.length}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-[12px] text-gray-500 font-medium">Analytics enabled after Accept</span>
                  <span className={`text-[13px] font-bold tabular-nums ${cc.analyticsEnabledAfterAccept.length > 0 ? "text-amber-700" : "text-emerald-700"}`}>{cc.analyticsEnabledAfterAccept.length}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-[12px] text-gray-500 font-medium">Still present after Reject</span>
                  <span className={`text-[13px] font-bold tabular-nums ${cc.stillPresentAfterReject.length > 0 ? "text-red-700" : "text-emerald-700"}`}>{cc.stillPresentAfterReject.length}</span>
                </div>
              </div>

              {/* Right: verdict + details */}
              <div className="space-y-4">
                <div className={`rounded-xl p-4 ${isPass ? "bg-emerald-50 border border-emerald-100" : "bg-red-50 border border-red-100"}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isPass ? 'text-emerald-600' : 'text-red-600'}">Compliance verdict</p>
                  <p className={`text-[12px] leading-relaxed font-medium ${isPass ? "text-emerald-800" : "text-red-800"}`}>{cc.complianceSummary}</p>
                </div>
                {cc.stillPresentAfterReject.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-red-600 mb-2">Non-essential cookies persisting after Reject</p>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {cc.stillPresentAfterReject.slice(0, 8).map((c) => (
                        <div key={c.name} className="flex items-center justify-between bg-red-50 rounded-lg px-3 py-1.5">
                          <span className="text-[12px] font-mono text-gray-800 truncate max-w-[140px]">{c.name}</span>
                          <span className="text-[10px] font-semibold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{c.category}</span>
                        </div>
                      ))}
                      {cc.stillPresentAfterReject.length > 8 && (
                        <p className="text-[11px] text-gray-400 text-center pt-1">+{cc.stillPresentAfterReject.length - 8} more</p>
                      )}
                    </div>
                  </div>
                )}
                {cc.marketingEnabledAfterAccept.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 mb-2">Marketing cookies loaded on Accept</p>
                    <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                      {cc.marketingEnabledAfterAccept.slice(0, 5).map((c) => (
                        <div key={c.name} className="flex items-center justify-between bg-amber-50 rounded-lg px-3 py-1.5">
                          <span className="text-[12px] font-mono text-gray-800 truncate max-w-[140px]">{c.name}</span>
                          <span className="text-[10px] font-medium text-amber-700">{c.partyType}</span>
                        </div>
                      ))}
                      {cc.marketingEnabledAfterAccept.length > 5 && (
                        <p className="text-[11px] text-gray-400 text-center pt-1">+{cc.marketingEnabledAfterAccept.length - 5} more</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
