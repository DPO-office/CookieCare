import React from "react";
import {
  FileDown, Share2, RefreshCw, ShieldAlert, CheckCircle,
  FileCheck, Layers, Globe, GitCompareArrows,
} from "lucide-react";
import { CookieScanResult } from "../../../shared/types";
import { severityBadgeClass } from "../utils";
import { CARD_SHADOW, TRACKER_TABLE_HEADERS } from "../constants";

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

  const score = result.scanSummary.overallScore;
  const scoreWell =
    score >= 80
      ? "bg-badge-green text-badge-green-text"
      : score >= 50
        ? "bg-badge-yellow text-badge-yellow-text"
        : "bg-badge-red text-badge-red-text";

  return (
    <div className="space-y-5 font-sans">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div
          className="flex flex-col items-center justify-center rounded-[24px] bg-white px-6 py-7 text-center"
          style={{ boxShadow: CARD_SHADOW }}
        >
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#98A2B3]">
            Overall score
          </p>
          <div className={`flex h-24 w-24 flex-col items-center justify-center rounded-[22px] ${scoreWell}`}>
            <span className="text-3xl font-semibold tabular-nums tracking-[-0.03em]">{score}</span>
            <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]">/ 100</span>
          </div>
        </div>
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="flex flex-col justify-between rounded-[24px] bg-white p-5"
            style={{ boxShadow: CARD_SHADOW }}
          >
            <div>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#98A2B3]">
                {kpi.label}
              </p>
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full ${
                    kpi.ok ? "bg-badge-green text-badge-green-text" : "bg-badge-red text-badge-red-text"
                  }`}
                >
                  <kpi.icon className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <span className="text-[14px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
                  {kpi.value}
                </span>
              </div>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-[#667085]">{kpi.note}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-[24px] bg-white p-6" style={{ boxShadow: CARD_SHADOW }}>
          <h3 className="m-0 text-[15px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
            Download report
          </h3>
          <p className="mb-4 mt-1 text-[13px] text-[#667085]">
            Export this scan as a legal compliance document.
          </p>
          <button
            id="download-pdf-btn"
            type="button"
            onClick={onDownload}
            className="primary-gradient inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border-none px-4 text-[13px] font-semibold text-white"
          >
            <FileDown className="h-3.5 w-3.5" />
            Download PDF
          </button>
        </div>
        <div className="rounded-[24px] bg-white p-6" style={{ boxShadow: CARD_SHADOW }}>
          <h3 className="m-0 text-[15px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
            Share report
          </h3>
          <p className="mb-4 mt-1 text-[13px] text-[#667085]">
            Send to counselors, partners, or clients.
          </p>
          <form onSubmit={onShareSubmit} className="flex gap-2">
            <input
              type="email"
              required
              placeholder="partner@legalfirm.com"
              className="min-w-0 flex-1 rounded-full border-none bg-[#F7F8FB] px-4 py-2.5 text-[13px] text-[#1a1a1a] outline-none focus:bg-white focus:shadow-[0_0_0_1.5px_#8e98ff]"
              value={shareEmail}
              onChange={(e) => onShareEmailChange(e.target.value)}
            />
            <button
              type="submit"
              disabled={sharing || !shareEmail}
              className="primary-gradient inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border-none px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sharing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
              Send
            </button>
          </form>
          {shareMessage && (
            <p
              className={`mt-2 text-[12px] ${
                shareMessage === "Report shared successfully."
                  ? "text-badge-green-text"
                  : "text-badge-red-text"
              }`}
            >
              {shareMessage}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="overflow-hidden rounded-[24px] bg-white lg:col-span-2" style={{ boxShadow: CARD_SHADOW }}>
          <div className="flex items-center justify-between px-6 py-4">
            <h3 className="m-0 text-[15px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
              Tracker registry
            </h3>
            <span className="score-badge bg-[#EEF2FF] text-[11px] font-medium text-[#4F5BD9]">
              {result.cookiesDetected.length} trackers
            </span>
          </div>
          {result.cookiesDetected.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
                <Globe className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <p className="m-0 text-[14px] font-semibold text-[#1a1a1a]">No trackers detected</p>
              <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-[#667085]">
                No tracking scripts or cookies were isolated at this scan depth.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#F4F4F5]">
                    {TRACKER_TABLE_HEADERS.map((h) => (
                      <th
                        key={h}
                        className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-[#98A2B3]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.cookiesDetected.map((cookie, i) => (
                    <tr key={i} className="border-b border-[#F4F4F5] last:border-0 hover:bg-[#FAFBFF]">
                      <td className="px-5 py-3.5 font-medium text-[#1a1a1a]">{cookie.name}</td>
                      <td className="px-5 py-3.5">
                        <span className="score-badge bg-[#EEF2FF] text-[11px] font-medium text-[#4F5BD9]">
                          {cookie.category}
                        </span>
                      </td>
                      <td className="max-w-[120px] truncate px-5 py-3.5 font-mono text-[12px] text-[#667085]">
                        {cookie.domain}
                      </td>
                      <td className="px-5 py-3.5 text-[12px] text-[#667085]">{cookie.retention}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[11px] font-medium ${severityBadgeClass(cookie.severity)}`}>
                          {cookie.severity}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-[24px] bg-white" style={{ boxShadow: CARD_SHADOW }}>
          <div className="flex items-center gap-2.5 px-5 py-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
              <ShieldAlert className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <h3 className="m-0 text-[15px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
              Compliance gaps
            </h3>
          </div>
          {result.complianceGaps.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <CheckCircle className="mx-auto mb-2 h-8 w-8 text-badge-green-text" />
              <p className="m-0 text-[13px] font-medium text-badge-green-text">No compliance gaps found</p>
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {result.complianceGaps.map((gap, i) => (
                <div key={gap.id || i} className="rounded-[18px] bg-[#F7F8FB] p-3.5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold text-[#1a1a1a]">{gap.regulation}</span>
                    <span
                      className={`text-[10px] font-medium ${severityBadgeClass(
                        gap.severity === "RED" ? "HIGH" : gap.severity === "YELLOW" ? "MEDIUM" : "LOW",
                      )}`}
                    >
                      {gap.severity}
                    </span>
                  </div>
                  <p className="mb-1 text-[12px] font-medium text-[#1a1a1a]">{gap.issue}</p>
                  <p className="text-[11px] leading-relaxed text-[#667085]">{gap.remediation}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {result.enterpriseReport?.consentComparison && (() => {
        const cc = result.enterpriseReport!.consentComparison!;
        const isPass = cc.complianceSummary.startsWith("PASS");
        const acceptDelta = cc.acceptCount - cc.preConsentCount;
        const rejectDelta = cc.rejectCount - cc.preConsentCount;
        return (
          <div className="overflow-hidden rounded-[24px] bg-white" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
                  <GitCompareArrows className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <h3 className="m-0 text-[15px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
                  Consent comparison
                </h3>
              </div>
              <span
                className={`score-badge text-[11px] font-medium ${
                  isPass ? "bg-badge-green text-badge-green-text" : "bg-badge-red text-badge-red-text"
                }`}
              >
                {isPass ? "PASS" : "FAIL"}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-6 px-6 pb-6 md:grid-cols-2">
              <div className="space-y-1">
                {[
                  ["Before consent", `${cc.preConsentCount} cookies`, "text-[#1a1a1a]"],
                  ["After accept", `${cc.acceptCount}`, acceptDelta >= 0 ? "text-badge-yellow-text" : "text-badge-green-text"],
                  ["After reject", `${cc.rejectCount}`, rejectDelta <= 0 ? "text-badge-green-text" : "text-badge-red-text"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between border-b border-[#F4F4F5] py-2.5 last:border-0"
                  >
                    <span className="text-[12px] font-medium text-[#667085]">{label}</span>
                    <span className="text-[14px] font-semibold tabular-nums text-[#1a1a1a]">
                      {value}
                      {label === "After accept" && (
                        <span className={`ml-1 text-[12px] ${acceptDelta >= 0 ? "text-badge-yellow-text" : "text-badge-green-text"}`}>
                          ({acceptDelta >= 0 ? "+" : ""}{acceptDelta})
                        </span>
                      )}
                      {label === "After reject" && (
                        <span className={`ml-1 text-[12px] ${rejectDelta <= 0 ? "text-badge-green-text" : "text-badge-red-text"}`}>
                          ({rejectDelta >= 0 ? "+" : ""}{rejectDelta})
                        </span>
                      )}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-b border-[#F4F4F5] py-2">
                  <span className="text-[12px] font-medium text-[#667085]">Added after accept</span>
                  <span className={`text-[13px] font-semibold tabular-nums ${cc.addedAfterAccept.length > 0 ? "text-badge-yellow-text" : "text-badge-green-text"}`}>
                    {cc.addedAfterAccept.length}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-[#F4F4F5] py-2">
                  <span className="text-[12px] font-medium text-[#667085]">Marketing enabled after accept</span>
                  <span className={`text-[13px] font-semibold tabular-nums ${cc.marketingEnabledAfterAccept.length > 0 ? "text-badge-yellow-text" : "text-badge-green-text"}`}>
                    {cc.marketingEnabledAfterAccept.length}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-[#F4F4F5] py-2">
                  <span className="text-[12px] font-medium text-[#667085]">Analytics enabled after accept</span>
                  <span className={`text-[13px] font-semibold tabular-nums ${cc.analyticsEnabledAfterAccept.length > 0 ? "text-badge-yellow-text" : "text-badge-green-text"}`}>
                    {cc.analyticsEnabledAfterAccept.length}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-[12px] font-medium text-[#667085]">Still present after reject</span>
                  <span className={`text-[13px] font-semibold tabular-nums ${cc.stillPresentAfterReject.length > 0 ? "text-badge-red-text" : "text-badge-green-text"}`}>
                    {cc.stillPresentAfterReject.length}
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div className={`rounded-[18px] p-4 ${isPass ? "bg-badge-green" : "bg-badge-red"}`}>
                  <p className={`m-0 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${isPass ? "text-badge-green-text" : "text-badge-red-text"}`}>
                    Compliance verdict
                  </p>
                  <p className={`m-0 text-[12px] leading-relaxed font-medium ${isPass ? "text-badge-green-text" : "text-badge-red-text"}`}>
                    {cc.complianceSummary}
                  </p>
                </div>
                {cc.stillPresentAfterReject.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-badge-red-text">
                      Non-essential cookies persisting after reject
                    </p>
                    <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
                      {cc.stillPresentAfterReject.slice(0, 8).map((c) => (
                        <div key={c.name} className="flex items-center justify-between rounded-full bg-badge-red px-3 py-1.5">
                          <span className="max-w-[140px] truncate font-mono text-[12px] text-[#1a1a1a]">{c.name}</span>
                          <span className="score-badge bg-white/70 text-[10px] font-medium text-[#667085]">{c.category}</span>
                        </div>
                      ))}
                      {cc.stillPresentAfterReject.length > 8 && (
                        <p className="pt-1 text-center text-[11px] text-[#98A2B3]">
                          +{cc.stillPresentAfterReject.length - 8} more
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {cc.marketingEnabledAfterAccept.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-badge-yellow-text">
                      Marketing cookies loaded on accept
                    </p>
                    <div className="max-h-28 space-y-1.5 overflow-y-auto pr-1">
                      {cc.marketingEnabledAfterAccept.slice(0, 5).map((c) => (
                        <div key={c.name} className="flex items-center justify-between rounded-full bg-badge-yellow px-3 py-1.5">
                          <span className="max-w-[140px] truncate font-mono text-[12px] text-[#1a1a1a]">{c.name}</span>
                          <span className="text-[10px] font-medium text-badge-yellow-text">{c.partyType}</span>
                        </div>
                      ))}
                      {cc.marketingEnabledAfterAccept.length > 5 && (
                        <p className="pt-1 text-center text-[11px] text-[#98A2B3]">
                          +{cc.marketingEnabledAfterAccept.length - 5} more
                        </p>
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
