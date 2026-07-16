import { useState, useEffect } from "react";
import {
  RefreshCw, ShieldCheck, Building2, BarChart3, Download,
  AlertTriangle, AlertCircle, CheckCircle2, Info,
  FileSearch, Sparkles, ArrowRight,
  Download as DownloadIcon, FileDown, Copy, Check,
} from "lucide-react";
import { MOCK_RECOMMENDATIONS } from "../constants";
import {
  deriveComplianceStatus, getComplianceStatusConfig,
  getRiskScoreLabel, getPrivacyScoreLabel, getSecurityScoreLabel,
} from "../utils";
import { useResultsState } from "../hooks/useResultsState";
import { RadialGauge }    from "./RadialGauge";
import { ComplianceDot }  from "./ComplianceDot";
import { FindingCard }    from "./FindingCard";
import type { VendorReviewResult, RecommendationSection } from "../types";
import React from "react";
import { XCircle, TrendingUp, AlertTriangle as AlertTriangleIcon } from "lucide-react";

interface ResultsStateProps {
  fileNames:    string[];
  reviewResult: VendorReviewResult | null;
  onReset:      () => void;
}

/**
 * Map real backend recommendations to the UI RecommendationSection shape.
 * Each recommendation gets an icon based on its priority.
 */
function mapRecommendations(result: VendorReviewResult): RecommendationSection[] {
  if (!result.recommendations || result.recommendations.length === 0) {
    return MOCK_RECOMMENDATIONS;
  }

  const accentMap: Record<string, string> = {
    critical: "border-red-200 bg-red-50/40",
    high:     "border-orange-200 bg-orange-50/40",
    medium:   "border-amber-200 bg-amber-50/40",
    low:      "border-emerald-200 bg-emerald-50/40",
  };

  const iconMap: Record<string, React.ReactNode> = {
    critical: React.createElement(XCircle,          { className: "w-4 h-4" }),
    high:     React.createElement(AlertTriangleIcon, { className: "w-4 h-4" }),
    medium:   React.createElement(TrendingUp,        { className: "w-4 h-4" }),
    low:      React.createElement(CheckCircle2,      { className: "w-4 h-4" }),
  };

  return result.recommendations.map((r) => ({
    category: r.category,
    icon:     iconMap[r.priority] ?? iconMap["medium"],
    accent:   accentMap[r.priority] ?? accentMap["medium"],
    items:    r.items,
  }));
}

export function ResultsState({ fileNames, reviewResult, onReset }: ResultsStateProps) {
  const [mounted, setMounted] = useState(false);

  const {
    activeTab, setActiveTab,
    findingFilter, setFindingFilter,
    filteredFindings, allFindings, copiedSummary, handleCopy,
    passedCount, warningCount, missingCount, highRiskCount,
    overallScore, privacyScore, securityScore,
    vendorName, vendorIndustry, vendorHQ, vendorDataRegions, vendorServices,
    isRealData,
  } = useResultsState({ reviewResult });

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, []);

  const complianceStatus = deriveComplianceStatus(highRiskCount, missingCount, warningCount);
  const complianceCfg    = getComplianceStatusConfig(complianceStatus);

  // Compliance items — use real data if available, else show legacy mock shape
  const complianceItems = isRealData && reviewResult!.compliance.length > 0
    ? reviewResult!.compliance
    : [
        { label: "GDPR",      status: "compliant" as const },
        { label: "SOC 2",     status: "partial"   as const },
        { label: "ISO 27001", status: "compliant" as const },
        { label: "HIPAA",     status: "missing"   as const },
        { label: "CCPA",      status: "partial"   as const },
        { label: "PCI DSS",   status: "na"        as const },
      ];

  // Recommendations — use real data if available
  const recommendations = isRealData && reviewResult
    ? mapRecommendations(reviewResult)
    : MOCK_RECOMMENDATIONS;

  const totalFindings = allFindings.length;

  return (
    <div
      className="flex-1 overflow-y-auto bg-[#FAFAFB] px-10 py-8"
      style={{
        opacity:   mounted ? 1 : 0,
        transform: mounted ? "none" : "translateY(8px)",
        transition: "opacity 0.4s ease, transform 0.4s ease",
      }}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="badge badge-success">Assessment Complete</span>
            <span className="text-[11px] text-gray-400 font-medium">
              {fileNames.length} document{fileNames.length !== 1 ? "s" : ""} reviewed
            </span>
            {isRealData && (
              <span className="text-[11px] text-emerald-600 font-semibold bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                AI Analysis
              </span>
            )}
          </div>
          <h1 className="text-[24px] font-bold text-gray-900 tracking-tight">Vendor Assessment Report</h1>
          <p className="text-[13px] text-gray-500 mt-1">
            {isRealData && reviewResult?.summary
              ? reviewResult.summary.substring(0, 140) + (reviewResult.summary.length > 140 ? "…" : "")
              : "AI-generated vendor risk, privacy and compliance assessment."}
          </p>
        </div>
        <button onClick={onReset} className="btn-secondary text-[12px] py-2 px-4 shrink-0 cursor-pointer mt-1">
          <RefreshCw className="w-3.5 h-3.5" />New Assessment
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow">
          <p className="section-label mb-3">Vendor Risk Score</p>
          <RadialGauge score={overallScore} />
          <p className="text-[11px] text-gray-400 mt-3 leading-tight">{getRiskScoreLabel(overallScore)}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow">
          <p className="section-label mb-3">Privacy Score</p>
          <RadialGauge score={privacyScore} />
          <p className="text-[11px] text-gray-400 mt-3 leading-tight">{getPrivacyScoreLabel(privacyScore)}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow">
          <p className="section-label mb-3">Security Score</p>
          <RadialGauge score={securityScore} />
          <p className="text-[11px] text-gray-400 mt-3 leading-tight">{getSecurityScoreLabel(securityScore)}</p>
        </div>

        <div className={`border rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow ${complianceCfg.bg} ${complianceCfg.border}`}>
          <p className="section-label mb-3">Compliance Status</p>
          <div className="w-[72px] h-[72px] rounded-2xl bg-white/70 flex flex-col items-center justify-center gap-1 shadow-xs">
            {highRiskCount > 0
              ? <AlertTriangle className="w-6 h-6 text-red-500" />
              : missingCount >= 2
              ? <AlertCircle  className="w-6 h-6 text-amber-500" />
              : warningCount >= 2
              ? <Info         className="w-6 h-6 text-amber-400" />
              : <CheckCircle2 className="w-6 h-6 text-emerald-500" />}
            <span className={`text-[9px] font-bold uppercase tracking-wide mt-1 ${complianceCfg.text}`}>
              {complianceStatus}
            </span>
          </div>
          <p className={`text-[11px] mt-3 font-medium ${complianceCfg.text}`}>
            {highRiskCount} critical · {missingCount} missing
          </p>
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
                  ${activeTab === t
                    ? "bg-gray-900 text-white shadow-sm"
                    : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-gray-800 hover:border-gray-300"}`}
              >
                {t === "findings"        && <FileSearch className="w-3.5 h-3.5" />}
                {t === "recommendations" && <Sparkles   className="w-3.5 h-3.5" />}
                <span className="capitalize">{t}</span>
                {t === "findings" && (
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${activeTab === t ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>
                    {totalFindings}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Findings tab */}
          {activeTab === "findings" && (
            <div className="space-y-3">
              {/* Filter bar */}
              <div className="flex flex-wrap items-center gap-2">
                {([
                  { val: "all",       label: "All",       count: totalFindings, cls: "bg-gray-100 text-gray-700 border border-gray-200" },
                  { val: "passed",    label: "Passed",    count: passedCount,   cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
                  { val: "warning",   label: "Warning",   count: warningCount,  cls: "bg-amber-50 text-amber-700 border border-amber-200" },
                  { val: "missing",   label: "Missing",   count: missingCount,  cls: "bg-red-50 text-red-700 border border-red-200" },
                  { val: "high-risk", label: "High Risk", count: highRiskCount, cls: "bg-red-100 text-red-800 border border-red-300" },
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
                {filteredFindings.length === 0 && (
                  <p className="text-[13px] text-gray-400 text-center py-8">
                    No findings match the selected filter.
                  </p>
                )}
                {filteredFindings.map((finding) => (
                  <FindingCard key={finding.id} finding={finding} />
                ))}
              </div>
            </div>
          )}

          {/* Recommendations tab */}
          {activeTab === "recommendations" && (
            <div className="space-y-4">
              {recommendations.map((rec) => (
                <div key={rec.category} className={`border rounded-[18px] overflow-hidden shadow-xs ${rec.accent}`}>
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-white/60">
                    <div className="w-7 h-7 rounded-lg bg-white/80 border border-white flex items-center justify-center text-gray-600 shadow-xs">
                      {rec.icon}
                    </div>
                    <h3 className="text-[13px] font-bold text-gray-900">{rec.category}</h3>
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
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="xl:w-[300px] shrink-0 space-y-4">
          {/* Vendor information */}
          <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-gray-400" />
                <p className="section-label">Vendor Information</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              {[
                { label: "Vendor Name",      value: vendorName        },
                { label: "Industry",         value: vendorIndustry    },
                { label: "Headquarters",     value: vendorHQ          },
                { label: "Data Regions",     value: vendorDataRegions },
                { label: "Primary Services", value: vendorServices    },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3">
                  <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide shrink-0 mt-0.5 min-w-[80px]">{row.label}</span>
                  <span className="text-[12px] font-semibold text-gray-900 text-right">
                    {row.value ?? <span className="text-gray-300 font-normal italic">Not identified</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Compliance Overview */}
          <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-gray-400" />
                <p className="section-label">Compliance Overview</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              {complianceItems.map(({ label, status }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-gray-800">{label}</span>
                  <ComplianceDot status={status} />
                </div>
              ))}
            </div>
            <div className="px-5 pb-4">
              <div className="flex items-center gap-4 pt-3 border-t border-gray-100 flex-wrap">
                {[
                  { cls: "bg-emerald-500", label: "Compliant" },
                  { cls: "bg-amber-400",   label: "Partial"   },
                  { cls: "bg-red-500",     label: "Missing"   },
                  { cls: "bg-gray-300",    label: "N/A"       },
                ].map(({ cls, label }) => (
                  <span key={label} className="flex items-center gap-1 text-[10px] text-gray-400 font-medium">
                    <span className={`w-1.5 h-1.5 rounded-full ${cls}`} />{label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Score Breakdown */}
          <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 text-gray-400" />
                <p className="section-label">Score Breakdown</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-4">
              {isRealData && reviewResult?.scoreBreakdown ? (
                // Real data: show the 6 dimension scores
                [
                  { label: "Privacy Posture",     score: reviewResult.scoreBreakdown.privacyPosture,     color: "bg-blue-400"    },
                  { label: "Security Posture",    score: reviewResult.scoreBreakdown.securityPosture,    color: "bg-indigo-400"  },
                  { label: "GDPR Compliance",     score: reviewResult.scoreBreakdown.gdprCompliance,     color: "bg-emerald-400" },
                  { label: "CCPA Compliance",     score: reviewResult.scoreBreakdown.ccpaCompliance,     color: "bg-teal-400"    },
                  { label: "Contractual Risk",    score: reviewResult.scoreBreakdown.contractualRisk,    color: "bg-amber-400"   },
                  { label: "Vendor Transparency", score: reviewResult.scoreBreakdown.vendorTransparency, color: "bg-violet-400"  },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[12px] text-gray-600 font-medium">{item.label}</span>
                      <span className="text-[12px] font-bold tabular-nums text-gray-700">{item.score}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${item.color} transition-all duration-700 ease-out`}
                        style={{ width: `${item.score}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                // Fallback: show finding counts like the original mock UI
                [
                  { label: "Passed",    count: passedCount,   barColor: "bg-emerald-400", textColor: "text-emerald-700" },
                  { label: "Warnings",  count: warningCount,  barColor: "bg-amber-400",   textColor: "text-amber-700"   },
                  { label: "Missing",   count: missingCount,  barColor: "bg-red-400",     textColor: "text-red-700"     },
                  { label: "High Risk", count: highRiskCount, barColor: "bg-red-600",     textColor: "text-red-800"     },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[12px] text-gray-600 font-medium">{item.label}</span>
                      <span className={`text-[12px] font-bold tabular-nums ${item.textColor}`}>{item.count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${item.barColor} transition-all duration-700 ease-out`}
                        style={{ width: totalFindings > 0 ? `${Math.round((item.count / totalFindings) * 100)}%` : "0%" }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Export */}
          <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-2">
                <Download className="w-3.5 h-3.5 text-gray-400" />
                <p className="section-label">Export</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-2.5">
              <button className="w-full btn-primary justify-center py-2.5 cursor-pointer">
                <DownloadIcon className="w-4 h-4" />Download Assessment
              </button>
              <button className="w-full btn-secondary justify-center py-2.5 cursor-pointer">
                <FileDown className="w-4 h-4" />Export PDF
              </button>
              <button
                onClick={handleCopy}
                className="w-full btn-secondary justify-center py-2.5 cursor-pointer transition-colors"
              >
                {copiedSummary
                  ? <><Check className="w-4 h-4 text-emerald-600" /><span className="text-emerald-700">Copied to clipboard</span></>
                  : <><Copy className="w-4 h-4" />Copy Summary</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
