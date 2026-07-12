import React, { useState, useEffect } from "react";
import {
  CheckCircle2, AlertTriangle, AlertCircle, FileSearch,
  Sparkles, Download, FileDown, Copy, Check,
  RefreshCw, ArrowRight, BarChart3, Brain,
} from "lucide-react";
import { EthicsFinding } from "../types";
import {
  MOCK_FINDINGS, MOCK_RECOMMENDATIONS, ETHICS_BREAKDOWN,
} from "../constants";
import { EthicsRadialGauge } from "./EthicsRadialGauge";
import { EthicsFindingCard } from "./EthicsFindingCard";

interface EthicsResultsStateProps {
  fileNames: string[];
  onReset: () => void;
}

export function EthicsResultsState({ fileNames, onReset }: EthicsResultsStateProps) {
  const [activeTab, setActiveTab] = useState<"findings" | "recommendations">("findings");
  const [findingFilter, setFindingFilter] = useState<"all" | EthicsFinding["status"]>("all");
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, []);

  const passedCount   = MOCK_FINDINGS.filter((f) => f.status === "passed").length;
  const needsImpCount = MOCK_FINDINGS.filter((f) => f.status === "needs-improvement").length;
  const warningCount  = MOCK_FINDINGS.filter((f) => f.status === "warning").length;
  const highRiskCount = MOCK_FINDINGS.filter((f) => f.status === "high-risk").length;

  const ethicsScore      = 62;
  const riskLevel        = highRiskCount > 0 ? "High Risk" : warningCount >= 2 ? "Medium" : "Low";
  const highPriority     = highRiskCount + warningCount;
  const complianceStatus = highRiskCount > 0 ? "Needs Action" : warningCount >= 2 ? "Partial" : "Compliant";

  const riskCfg = {
    "High Risk": { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-100"     },
    "Medium":    { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-100"   },
    "Low":       { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-100" },
  }[riskLevel];

  const complianceCfg = {
    "Needs Action": { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-100",     icon: <AlertTriangle className="w-5 h-5 text-red-500" /> },
    "Partial":      { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-100",   icon: <AlertCircle   className="w-5 h-5 text-amber-500" /> },
    "Compliant":    { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-100", icon: <CheckCircle2  className="w-5 h-5 text-emerald-500" /> },
  }[complianceStatus];

  const filteredFindings =
    findingFilter === "all"
      ? MOCK_FINDINGS
      : MOCK_FINDINGS.filter((f) => f.status === findingFilter);

  const handleCopy = () => {
    const summary = `AI Ethics Assessment Report\nFile: ${fileNames[0]}\nEthics Score: ${ethicsScore}/100\nRisk Level: ${riskLevel}\nHigh Priority: ${highPriority}\nStatus: ${complianceStatus}`;
    navigator.clipboard.writeText(summary).catch(() => {});
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
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
            <span className="badge badge-success">
              <CheckCircle2 className="w-3 h-3" />Assessment Complete
            </span>
            <span className="text-[11px] text-gray-400 font-medium">
              {fileNames.length} document{fileNames.length !== 1 ? "s" : ""} reviewed
            </span>
          </div>
          <h1 className="text-[24px] font-bold text-gray-900 tracking-tight">AI Ethics Score</h1>
          <p className="text-[13px] text-gray-500 mt-1">
            AI-generated responsible AI evaluation and governance assessment.
          </p>
        </div>
        <button
          onClick={onReset}
          className="btn-secondary text-[12px] py-2 px-4 shrink-0 cursor-pointer mt-1"
        >
          <RefreshCw className="w-3.5 h-3.5" />New Assessment
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow">
          <p className="section-label mb-3">AI Ethics Score</p>
          <EthicsRadialGauge score={ethicsScore} />
          <p className="text-[11px] text-gray-400 mt-3 leading-tight">
            {ethicsScore >= 70 ? "Strong ethics posture" : ethicsScore >= 50 ? "Improvement needed" : "Significant gaps found"}
          </p>
        </div>

        <div className={`border rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow ${riskCfg.bg} ${riskCfg.border}`}>
          <p className="section-label mb-3">Risk Level</p>
          <div className="w-[72px] h-[72px] rounded-2xl bg-white/70 flex flex-col items-center justify-center gap-1 shadow-xs">
            {riskLevel === "High Risk" && <AlertTriangle className="w-6 h-6 text-red-500" />}
            {riskLevel === "Medium"    && <AlertCircle   className="w-6 h-6 text-amber-500" />}
            {riskLevel === "Low"       && <CheckCircle2  className="w-6 h-6 text-emerald-500" />}
            <span className={`text-[9px] font-bold uppercase tracking-wide mt-1 ${riskCfg.text}`}>{riskLevel}</span>
          </div>
          <p className={`text-[11px] mt-3 font-medium ${riskCfg.text}`}>{highRiskCount} critical issues</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow">
          <p className="section-label mb-3">High Priority Issues</p>
          <div className="w-[72px] h-[72px] rounded-2xl bg-amber-50 border border-amber-100 flex flex-col items-center justify-center gap-1">
            <span className="text-[28px] font-bold text-amber-600 tabular-nums leading-none">{highPriority}</span>
            <span className="text-[9px] font-semibold text-amber-400 uppercase tracking-wider">Issues</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-3 leading-tight">
            {highRiskCount} high risk · {warningCount} warnings
          </p>
        </div>

        <div className={`border rounded-[18px] shadow-xs p-5 flex flex-col items-center text-center hover:shadow-sm transition-shadow ${complianceCfg.bg} ${complianceCfg.border}`}>
          <p className="section-label mb-3">Compliance Status</p>
          <div className="w-[72px] h-[72px] rounded-2xl bg-white/70 flex flex-col items-center justify-center gap-1 shadow-xs">
            {complianceCfg.icon}
            <span className={`text-[9px] font-bold uppercase tracking-wide mt-1 ${complianceCfg.text}`}>{complianceStatus}</span>
          </div>
          <p className={`text-[11px] mt-3 font-medium ${complianceCfg.text}`}>
            {passedCount} of {MOCK_FINDINGS.length} passed
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
                    : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-gray-800 hover:border-gray-300"
                  }`}
              >
                {t === "findings"        && <FileSearch className="w-3.5 h-3.5" />}
                {t === "recommendations" && <Sparkles   className="w-3.5 h-3.5" />}
                <span className="capitalize">{t}</span>
                {t === "findings" && (
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${activeTab === t ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>
                    {MOCK_FINDINGS.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Findings tab */}
          {activeTab === "findings" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {([
                  { val: "all",               label: "All",              count: MOCK_FINDINGS.length, cls: "bg-gray-100 text-gray-700 border border-gray-200" },
                  { val: "passed",            label: "Passed",           count: passedCount,          cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
                  { val: "needs-improvement", label: "Needs Improvement",count: needsImpCount,        cls: "bg-gray-100 text-gray-700 border border-gray-200" },
                  { val: "warning",           label: "Warning",          count: warningCount,         cls: "bg-amber-50 text-amber-700 border border-amber-200" },
                  { val: "high-risk",         label: "High Risk",        count: highRiskCount,        cls: "bg-red-100 text-red-800 border border-red-300" },
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
                  <EthicsFindingCard key={finding.id} finding={finding} />
                ))}
              </div>
            </div>
          )}

          {/* Recommendations tab */}
          {activeTab === "recommendations" && (
            <div className="space-y-4">
              {MOCK_RECOMMENDATIONS.map((rec) => (
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
          <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-2">
                <Brain className="w-3.5 h-3.5 text-gray-400" />
                <p className="section-label">Assessment Summary</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              {[
                { label: "AI System",       value: "Lexify ML Platform v2.1" },
                { label: "Assessment Type", value: "Full Ethics Review" },
                { label: "Framework",       value: "EU AI Act / NIST RMF" },
                { label: "Review Date",     value: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) },
                { label: "Overall Rating",  value: `${ethicsScore}/100 — ${ethicsScore >= 70 ? "Low Risk" : ethicsScore >= 50 ? "Moderate" : "High Risk"}` },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3">
                  <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide shrink-0 mt-0.5 min-w-[90px]">{row.label}</span>
                  <span className="text-[12px] font-semibold text-gray-900 text-right">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 text-gray-400" />
                <p className="section-label">Ethics Breakdown</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-4">
              {ETHICS_BREAKDOWN.map((item) => {
                const barColor  = item.score >= 70 ? "bg-emerald-400" : item.score >= 50 ? "bg-amber-400" : "bg-red-400";
                const textColor = item.score >= 70 ? "text-emerald-700" : item.score >= 50 ? "text-amber-700" : "text-red-700";
                return (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[12px] text-gray-600 font-medium">{item.label}</span>
                      <span className={`text-[12px] font-bold tabular-nums ${textColor}`}>{item.score}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor} transition-all duration-700 ease-out`} style={{ width: `${item.score}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-2">
                <Download className="w-3.5 h-3.5 text-gray-400" />
                <p className="section-label">Export</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-2.5">
              <button className="w-full btn-primary justify-center py-2.5 cursor-pointer">
                <Download className="w-4 h-4" />Download Report
              </button>
              <button className="w-full btn-secondary justify-center py-2.5 cursor-pointer">
                <FileDown className="w-4 h-4" />Export PDF
              </button>
              <button onClick={handleCopy} className="w-full btn-secondary justify-center py-2.5 cursor-pointer transition-colors">
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
