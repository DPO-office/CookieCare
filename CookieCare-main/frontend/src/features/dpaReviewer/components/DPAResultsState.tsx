import React, { useState, useEffect } from "react";
import {
  CheckCircle2, AlertTriangle, FileSearch, Sparkles,
  Download, Copy, Check, RefreshCw, ArrowRight, Loader2,
} from "lucide-react";
import { Finding, DPAReviewResult } from "../types";
import { DPARadialGauge }  from "./DPARadialGauge";
import { DPAFindingCard }  from "./DPAFindingCard";
import { useReportDownload } from "../../../shared/report/useReportDownload";
import { adaptDPAResult }    from "../../../shared/report/reportAdapters";

interface DPAResultsStateProps {
  fileName: string;
  reviewResult: DPAReviewResult;
  onReset: () => void;
}

export function DPAResultsState({ fileName, reviewResult, onReset }: DPAResultsStateProps) {
  const [activeTab, setActiveTab]         = useState<"findings" | "recommendations">("findings");
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [findingFilter, setFindingFilter] = useState<"all" | Finding["status"]>("all");
  const [mounted, setMounted]             = useState(false);

  const { isGenerating, downloadReport } = useReportDownload();

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, []);

  const handleDownloadReport = () => {
    const reportData = adaptDPAResult(reviewResult, fileName);
    downloadReport(reportData, `DPA_Review_Report_${new Date().toISOString().split("T")[0]}`);
  };

  const { overallScore, riskLevel, summary, findings, recommendations, missingClauses, scoreBreakdown } = reviewResult;

  const compliantCount = findings.filter((f) => f.status === "compliant").length;
  const warningCount   = findings.filter((f) => f.status === "warning").length;
  const missingCount   = findings.filter((f) => f.status === "missing").length;

  const riskCfg = {
    high:   { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-100",    icon: <AlertTriangle className="w-5 h-5 text-red-500" /> },
    medium: { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-100",  icon: <AlertTriangle className="w-5 h-5 text-amber-500" /> },
    low:    { bg: "bg-emerald-50",text: "text-emerald-700",border: "border-emerald-100",icon: <CheckCircle2  className="w-5 h-5 text-emerald-500" /> },
  }[riskLevel];

  const filteredFindings =
    findingFilter === "all"
      ? findings
      : findings.filter((f) => f.status === findingFilter);

  const handleCopy = () => {
    const text = `DPA Compliance Report\nFile: ${fileName}\nScore: ${overallScore}/100\nRisk: ${riskLevel}\n\n${summary}\n\nCompliant: ${compliantCount}, Warnings: ${warningCount}, Missing: ${missingCount}`;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  // Priority accent colours for recommendations
  const priorityAccent: Record<string, string> = {
    critical: "border-red-200 bg-red-50/40",
    high:     "border-amber-200 bg-amber-50/40",
    medium:   "border-orange-200 bg-orange-50/40",
    low:      "border-blue-200 bg-blue-50/40",
  };

  return (
    <div
      className="flex-1 overflow-y-auto bg-[#FAFAFB] px-10 py-8"
      style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? "none" : "translateY(8px)",
        transition: "opacity 0.4s ease, transform 0.4s ease",
      }}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="badge badge-success">Analysis Complete</span>
            <span className="text-[11px] text-gray-400 font-medium truncate max-w-[240px]">{fileName}</span>
          </div>
          <h1 className="text-[24px] font-bold text-gray-900 tracking-tight">DPA Compliance Report</h1>
          <p className="text-[13px] text-gray-500 mt-1">AI-generated GDPR compliance analysis and risk assessment.</p>
          {summary && (
            <p className="text-[13px] text-gray-600 mt-2 max-w-2xl leading-relaxed">{summary}</p>
          )}
        </div>
        <button onClick={onReset} className="btn-secondary text-[12px] py-2 px-4 shrink-0 cursor-pointer mt-1">
          <RefreshCw className="w-3.5 h-3.5" />New Review
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow">
          <p className="section-label mb-3">Compliance Score</p>
          <DPARadialGauge score={overallScore} />
          <p className="text-[11px] text-gray-400 mt-3 leading-tight">
            {overallScore >= 70 ? "Generally compliant" : overallScore >= 50 ? "Needs attention" : "Critical gaps found"}
          </p>
        </div>

        <div className={`border rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow ${riskCfg.bg} ${riskCfg.border}`}>
          <p className="section-label mb-3">Risk Level</p>
          <div className="w-[72px] h-[72px] rounded-2xl bg-white/70 flex flex-col items-center justify-center gap-1 shadow-xs">
            {riskCfg.icon}
            <span className={`text-[11px] font-bold uppercase tracking-wide ${riskCfg.text}`}>{riskLevel}</span>
          </div>
          <p className={`text-[11px] mt-3 font-medium ${riskCfg.text}`}>
            {riskLevel === "high" ? "Immediate action required" : riskLevel === "medium" ? "Review recommended" : "Low risk profile"}
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow">
          <p className="section-label mb-3">Missing Clauses</p>
          <div className="w-[72px] h-[72px] rounded-2xl bg-red-50 border border-red-100 flex flex-col items-center justify-center">
            <span className="text-[26px] font-bold text-red-700 tabular-nums leading-none">{missingCount}</span>
            <span className="text-[9px] font-bold text-red-400 uppercase tracking-wide mt-0.5">clauses</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-3">Required by GDPR</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow">
          <p className="section-label mb-3">Critical Findings</p>
          <div className="w-[72px] h-[72px] rounded-2xl bg-amber-50 border border-amber-100 flex flex-col items-center justify-center">
            <span className="text-[26px] font-bold text-amber-700 tabular-nums leading-none">{warningCount + missingCount}</span>
            <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wide mt-0.5">findings</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-3">{warningCount} warnings · {missingCount} missing</p>
        </div>
      </div>

      {/* Two-column workspace */}
      <div className="flex flex-col xl:flex-row gap-6">

        {/* Main panel */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Tabs */}
          <div className="flex items-center gap-2">
            {(["findings", "recommendations"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 cursor-pointer
                  ${activeTab === t ? "bg-gray-900 text-white shadow-sm" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-gray-800 hover:border-gray-300"}`}
              >
                {t === "findings"        && <FileSearch className="w-3.5 h-3.5" />}
                {t === "recommendations" && <Sparkles   className="w-3.5 h-3.5" />}
                <span className="capitalize">{t}</span>
                {t === "findings" && (
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${activeTab === t ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>
                    {findings.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {activeTab === "findings" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {([
                  { val: "all",       label: "All",       count: findings.length, cls: "bg-gray-100 text-gray-700 border border-gray-200" },
                  { val: "compliant", label: "Compliant", count: compliantCount,   cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
                  { val: "warning",   label: "Warning",   count: warningCount,     cls: "bg-amber-50 text-amber-700 border border-amber-200" },
                  { val: "missing",   label: "Missing",   count: missingCount,     cls: "bg-red-50 text-red-700 border border-red-200" },
                ] as const).map((f) => (
                  <button
                    key={f.val}
                    onClick={() => setFindingFilter(f.val)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all duration-150 cursor-pointer ${f.cls}
                      ${findingFilter === f.val ? "ring-2 ring-gray-900 ring-offset-1 shadow-xs" : "hover:opacity-80"}`}
                  >
                    {f.label}
                    <span className="font-bold opacity-70">{f.count}</span>
                  </button>
                ))}
              </div>
              <div className="space-y-2.5">
                {filteredFindings.map((finding) => (
                  <DPAFindingCard
                    key={finding.id}
                    finding={{
                      ...finding,
                      // Map backend articleReference to the article field the card expects
                      article: finding.article ?? finding.articleReference,
                    }}
                  />
                ))}
                {filteredFindings.length === 0 && (
                  <p className="text-[13px] text-gray-400 text-center py-8">
                    No findings in this category.
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === "recommendations" && (
            <div className="space-y-4">
              {recommendations.map((rec) => (
                <div key={rec.category} className={`border rounded-[18px] overflow-hidden shadow-xs ${priorityAccent[rec.priority] ?? "border-gray-200 bg-gray-50/40"}`}>
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-white/60">
                    <div className="w-7 h-7 rounded-lg bg-white/80 border border-white flex items-center justify-center text-gray-600 shadow-xs">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <h3 className="text-[13px] font-bold text-gray-900">{rec.category}</h3>
                    <span className={`ml-2 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${
                      rec.priority === "critical" ? "bg-red-100 text-red-700"
                      : rec.priority === "high" ? "bg-amber-100 text-amber-700"
                      : rec.priority === "medium" ? "bg-orange-100 text-orange-700"
                      : "bg-blue-100 text-blue-700"
                    }`}>
                      {rec.priority}
                    </span>
                    <span className="ml-auto text-[11px] font-semibold text-gray-500 bg-white/60 rounded-md px-2 py-0.5">
                      {rec.items.length} item{rec.items.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="divide-y divide-white/40">
                    {rec.items.map((item, i) => (
                      <div key={i} className="flex items-start gap-3 px-5 py-3.5 bg-white/30 hover:bg-white/50 transition-colors duration-150">
                        <div className="w-5 h-5 rounded-full bg-white border border-gray-200 flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                          <ArrowRight className="w-2.5 h-2.5 text-gray-500" />
                        </div>
                        <p className="text-[13px] text-gray-800 leading-relaxed">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Missing clauses rendered in recommendations tab if not empty */}
              {missingClauses.length > 0 && (
                <div className="border rounded-[18px] overflow-hidden shadow-xs border-red-200 bg-red-50/40">
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-white/60">
                    <div className="w-7 h-7 rounded-lg bg-white/80 border border-white flex items-center justify-center text-red-500 shadow-xs">
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </div>
                    <h3 className="text-[13px] font-bold text-gray-900">Missing Mandatory Clauses</h3>
                    <span className="ml-2 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-700">
                      critical
                    </span>
                    <span className="ml-auto text-[11px] font-semibold text-gray-500 bg-white/60 rounded-md px-2 py-0.5">
                      {missingClauses.length}
                    </span>
                  </div>
                  <div className="divide-y divide-white/40">
                    {missingClauses.map((mc, i) => (
                      <div key={i} className="px-5 py-4 bg-white/30 hover:bg-white/50 transition-colors duration-150 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-semibold text-gray-900">{mc.clauseName}</span>
                          {mc.articleReference && (
                            <span className="badge badge-neutral text-[10px]">{mc.articleReference}</span>
                          )}
                        </div>
                        <p className="text-[12px] text-gray-600">{mc.reason}</p>
                        <p className="text-[12px] text-red-700 font-medium">{mc.recommendation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="xl:w-[320px] shrink-0 space-y-4">
          {/* Score breakdown */}
          <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <p className="section-label">Score Breakdown</p>
            </div>
            <div className="px-5 py-4 space-y-4">
              {[
                { label: "Compliant",  count: compliantCount, total: findings.length, barColor: "bg-emerald-400", textColor: "text-emerald-700" },
                { label: "Warnings",   count: warningCount,   total: findings.length, barColor: "bg-amber-400",   textColor: "text-amber-700" },
                { label: "Missing",    count: missingCount,   total: findings.length, barColor: "bg-red-400",     textColor: "text-red-700" },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] text-gray-600 font-medium">{item.label}</span>
                    <span className={`text-[12px] font-bold tabular-nums ${item.textColor}`}>{item.count}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${item.barColor} transition-all duration-700 ease-out`}
                      style={{ width: `${item.total > 0 ? Math.round((item.count / item.total) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dimension breakdown */}
          <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <p className="section-label">Dimension Scores</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              {[
                { label: "Article 28",         value: scoreBreakdown.article28Compliance },
                { label: "Processor Obligations", value: scoreBreakdown.processorObligations },
                { label: "Security Measures",  value: scoreBreakdown.securityMeasures },
                { label: "Data Subject Rights",value: scoreBreakdown.dataSubjectRights },
                { label: "Int'l Transfers",    value: scoreBreakdown.internationalTransfers },
                { label: "Sub-processors",     value: scoreBreakdown.subprocessorControls },
              ].map((d) => (
                <div key={d.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-gray-500 font-medium">{d.label}</span>
                    <span className={`text-[11px] font-bold tabular-nums ${d.value >= 70 ? "text-emerald-600" : d.value >= 40 ? "text-amber-600" : "text-red-600"}`}>
                      {d.value}%
                    </span>
                  </div>
                  <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ease-out ${d.value >= 70 ? "bg-emerald-400" : d.value >= 40 ? "bg-amber-400" : "bg-red-400"}`}
                      style={{ width: `${d.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Export */}
          <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <p className="section-label">Export Report</p>
            </div>
            <div className="px-5 py-4 space-y-2.5">
              <button
                onClick={handleDownloadReport}
                disabled={isGenerating}
                className="w-full btn-primary justify-center py-2.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isGenerating
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Generating PDF…</>
                  : <><Download className="w-4 h-4" />Download Report</>}
              </button>
              <button onClick={handleCopy} className="w-full btn-secondary justify-center py-2.5 cursor-pointer transition-colors">
                {copiedSummary
                  ? <><Check className="w-4 h-4 text-emerald-600" /><span className="text-emerald-700">Copied to clipboard</span></>
                  : <><Copy className="w-4 h-4" />Copy Summary</>}
              </button>
            </div>
          </div>

          {/* Document details */}
          <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <p className="section-label">Document Details</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              {[
                { label: "File",     value: fileName },
                { label: "Type",     value: "Data Processing Agreement" },
                { label: "Standard", value: "GDPR / EU 2016/679" },
                { label: "Reviewed", value: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3">
                  <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide shrink-0 mt-0.5">{row.label}</span>
                  <span className="text-[12px] font-semibold text-gray-900 text-right truncate">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
