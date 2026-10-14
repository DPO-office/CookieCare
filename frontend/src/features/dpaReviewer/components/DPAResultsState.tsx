import React, { useState, useEffect, useMemo, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Finding, DPAReviewResult } from "../types";
import type { DPADimensionId } from "../constants";
import { DPAFindingCard } from "./DPAFindingCard";
import { DPAFindingInspector } from "./DPAFindingInspector";
import { DPADimensionCard } from "./DPADimensionCard";
import { DPARadialGauge } from "./DPARadialGauge";
import { buildDimensionResults } from "../utils/categorizeFindings";
import { useReportDownload } from "../../../shared/report/useReportDownload";
import { adaptDPAResult } from "../../../shared/report/reportAdapters";

interface DPAResultsStateProps {
  fileName: string;
  reviewResult: DPAReviewResult;
  onReset: () => void;
}

function estimateRemediationEta(missing: number, warnings: number, highRisk: number): string {
  const days = Math.max(1, missing * 2 + highRisk * 1.5 + warnings * 0.75);
  if (days <= 2) return "1–2 days";
  if (days <= 5) return "3–5 days";
  if (days <= 10) return "1–2 weeks";
  return "2–3 weeks";
}

export function DPAResultsState({ fileName, reviewResult, onReset }: DPAResultsStateProps) {
  const [activeView, setActiveView] = useState<"dimensions" | "recommendations">("dimensions");
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [selectedDimensionId, setSelectedDimensionId] = useState<DPADimensionId | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  const { isGenerating, downloadReport } = useReportDownload();

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, []);

  const handleDownloadReport = () => {
    const reportData = adaptDPAResult(reviewResult, fileName);
    downloadReport(reportData, `DPA_Review_Report_${new Date().toISOString().split("T")[0]}`);
  };

  const {
    overallScore,
    riskLevel,
    summary,
    findings,
    recommendations,
    missingClauses,
    scoreBreakdown,
  } = reviewResult;

  const compliantCount = findings.filter((f) => f.status === "compliant").length;
  const warningCount = findings.filter((f) => f.status === "warning").length;
  const missingCount = findings.filter((f) => f.status === "missing").length;
  const highSeverityGaps = findings.filter(
    (f) => f.status === "missing" || (f.status === "warning" && f.severity === "high"),
  ).length;

  const dimensions = useMemo(
    () => buildDimensionResults(findings, scoreBreakdown),
    [findings, scoreBreakdown],
  );

  const selectedDimension =
    dimensions.find((d) => d.dimension.id === selectedDimensionId) ?? null;

  const selectedFinding =
    findings.find((f) => f.id === selectedFindingId) ?? null;

  const riskCfg = {
    high: {
      pill: "bg-badge-red text-badge-red-text",
      label: "Needs attention",
      hint: "Immediate remediation required",
    },
    medium: {
      pill: "bg-badge-yellow text-badge-yellow-text",
      label: "Needs attention",
      hint: "Review and remediate gaps",
    },
    low: {
      pill: "bg-badge-green text-badge-green-text",
      label: "Strong",
      hint: "Strong compliance posture",
    },
  }[riskLevel];

  const remediationEta = estimateRemediationEta(missingCount, warningCount, highSeverityGaps);
  const shortFileName = fileName.length > 42 ? `${fileName.slice(0, 39)}…` : fileName;

  const heroMetrics = [
    {
      label: "Total Strength",
      value: String(compliantCount),
      valueCls: "text-[#1a1a1a]",
    },
    {
      label: "Critical Gaps",
      value: String(missingCount),
      valueCls: missingCount > 0 ? "text-badge-red-text" : "text-[#1a1a1a]",
    },
    {
      label: "Read Level",
      value: String(findings.length),
      valueCls: "text-[#1a1a1a]",
    },
    {
      label: "Implementation",
      value: remediationEta,
      valueCls: "text-[#1a1a1a]",
    },
  ];

  const handleSelectDimension = (id: DPADimensionId) => {
    const next = selectedDimensionId === id ? null : id;
    setSelectedDimensionId(next);
    setActiveView("dimensions");

    if (next) {
      const dim = dimensions.find((d) => d.dimension.id === next);
      const first = dim?.findings[0];
      setSelectedFindingId(first?.id ?? null);
      setTimeout(() => {
        detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    } else {
      setSelectedFindingId(null);
    }
  };

  const handleSelectFinding = (finding: Finding) => {
    setSelectedFindingId(finding.id);
  };

  const handleCopy = () => {
    const text = `DPA Compliance Report\nFile: ${fileName}\nScore: ${overallScore}/100\nRisk: ${riskLevel}\n\n${summary}\n\nCompliant: ${compliantCount}, Warnings: ${warningCount}, Missing: ${missingCount}`;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const recIcon = (priority: string) => {
    if (priority === "critical") return "/icons/ats-bad.svg";
    if (priority === "high") return "/icons/ats-warning.svg";
    return "/icons/ats-good.svg";
  };

  const recBadge = (priority: string) => {
    if (priority === "critical") return "bg-badge-red text-badge-red-text";
    if (priority === "high" || priority === "medium") return "bg-badge-yellow text-badge-yellow-text";
    return "bg-badge-green text-badge-green-text";
  };

  return (
    <div
      className="dpa-results-bg flex-1 overflow-y-auto"
      style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? "none" : "translateY(8px)",
        transition: "opacity 0.35s ease, transform 0.35s ease",
      }}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-8 sm:px-10">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex items-center gap-2 text-[13px] font-medium text-dark-200" aria-label="Breadcrumb">
            <span>Privacy Space</span>
            <span className="text-gray-300">/</span>
            <span>DPA Reviews</span>
            <span className="text-gray-300">/</span>
            <span className="inline-flex max-w-[280px] items-center gap-1.5 truncate text-gray-900">
              <img src="/icons/info.svg" alt="" className="h-4 w-4 object-contain" />
              {shortFileName}
            </span>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={handleCopy}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-[13px] font-medium text-dark-200 transition-colors hover:bg-light-blue-100"
            >
              {copiedSummary ? "Copied" : "Copy"}
            </button>
            <button
              onClick={onReset}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-[13px] font-medium text-dark-200 transition-colors hover:bg-light-blue-100"
            >
              New review
            </button>
            <button
              onClick={handleDownloadReport}
              disabled={isGenerating}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full primary-gradient px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generating…</>
              ) : (
                "Export PDF"
              )}
            </button>
          </div>
        </div>

        <section
          className="mb-8 rounded-[24px] bg-white p-6 sm:p-8"
          style={{ boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)" }}
        >
          <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.03em] text-[#1a1a1a] sm:text-[34px]">
            DPA compliance report
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-dark-200">
            Enterprise review across six compliance dimensions — scored, categorized, and ready for remediation.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.1fr)] lg:items-center">
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <DPARadialGauge score={overallScore} />
              <div className="min-w-0">
                <span className={`score-badge text-[12px] font-medium ${riskCfg.pill}`}>
                  {riskCfg.label}
                </span>
                {summary && (
                  <p className="mt-3 line-clamp-4 text-[13px] leading-relaxed text-dark-200">
                    {summary}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {heroMetrics.map((m) => (
                <div
                  key={m.label}
                  className="rounded-2xl bg-[#F7F8FB] px-4 py-4 sm:px-5 sm:py-5"
                >
                  <p className="mb-2 text-[12px] font-medium text-dark-200">
                    {m.label}
                  </p>
                  <p className={`text-[24px] font-semibold leading-none tracking-tight tabular-nums ${m.valueCls}`}>
                    {m.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="segmented-control mb-6">
          <button
            onClick={() => setActiveView("dimensions")}
            className={`segmented-control-btn ${activeView === "dimensions" ? "is-active" : ""}`}
          >
            Dimensions
          </button>
          <button
            onClick={() => setActiveView("recommendations")}
            className={`segmented-control-btn ${activeView === "recommendations" ? "is-active" : ""}`}
          >
            Recommendations
          </button>
        </div>

        {activeView === "dimensions" && (
          <>
            <div className="mb-5">
              <h2 className="text-[22px] font-semibold tracking-tight text-gray-900">
                Compliance dimensions
              </h2>
            </div>

            <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {dimensions.map((dim, i) => (
                <DPADimensionCard
                  key={dim.dimension.id}
                  result={dim}
                  selected={selectedDimensionId === dim.dimension.id}
                  onSelect={() => handleSelectDimension(dim.dimension.id)}
                  index={i}
                />
              ))}
            </div>

            <div ref={detailRef}>
              {selectedDimension ? (
                <section className="overflow-hidden rounded-2xl shadow-sm" style={{ boxShadow: "0 0 0 1px rgba(167,191,241,0.45)" }}>
                  <div className="flex items-start justify-between gap-4 bg-light-blue-200 px-5 py-4 sm:px-6">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[16px] font-semibold tracking-tight text-gray-900">
                          {selectedDimension.dimension.title}
                        </h3>
                        <span className={`score-badge text-[11px] font-semibold ${
                          selectedDimension.status === "strong"
                            ? "bg-badge-green text-badge-green-text"
                            : selectedDimension.status === "partial"
                              ? "bg-badge-yellow text-badge-yellow-text"
                              : "bg-badge-red text-badge-red-text"
                        }`}>
                          {selectedDimension.statusLabel}
                        </span>
                      </div>
                      <p className="mt-1 text-[13px] leading-relaxed text-dark-200">
                        {selectedDimension.dimension.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDimensionId(null);
                        setSelectedFindingId(null);
                      }}
                      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-white/70"
                      aria-label="Close dimension workspace"
                    >
                      <img src="/icons/cross.svg" alt="" className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3 bg-white px-5 py-4 sm:px-6">
                    {[
                      { label: "Compliant", value: selectedDimension.compliantCount, cls: "bg-badge-green text-badge-green-text" },
                      { label: "Warnings", value: selectedDimension.warningCount, cls: "bg-badge-yellow text-badge-yellow-text" },
                      { label: "Missing", value: selectedDimension.missingCount, cls: "bg-badge-red text-badge-red-text" },
                    ].map((s) => (
                      <div key={s.label} className={`rounded-2xl px-3 py-3 text-center ${s.cls}`}>
                        <p className="text-[18px] font-bold leading-none tabular-nums">{s.value}</p>
                        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider opacity-80">
                          {s.label}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="flex min-h-[360px] flex-col bg-white xl:flex-row">
                    <div className="min-w-0 flex-1 border-t border-light-blue-200 p-3 sm:p-4 xl:border-r xl:border-t-0">
                      {selectedDimension.findings.length === 0 ? (
                        <div className="py-14 text-center">
                          <p className="text-[13px] text-dark-200">No findings mapped to this dimension.</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {selectedDimension.findings.map((finding) => (
                            <DPAFindingCard
                              key={finding.id}
                              finding={{
                                ...finding,
                                article: finding.article ?? finding.articleReference,
                              }}
                              selected={selectedFindingId === finding.id}
                              onSelect={handleSelectFinding}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="w-full shrink-0 xl:w-[400px]">
                      <DPAFindingInspector finding={selectedFinding} />
                    </div>
                  </div>
                </section>
              ) : (
                <div className="rounded-2xl bg-light-blue-200 px-6 py-12 text-center">
                  <p className="mb-1 text-[14px] font-semibold text-gray-900">
                    Select a dimension to open the workspace
                  </p>
                  <p className="mx-auto max-w-md text-[13px] leading-relaxed text-dark-200">
                    Findings and AI remediation open in a split view — legal snippets on the left, analysis and copyable recommendations on the right.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {activeView === "recommendations" && (
          <div className="max-w-4xl space-y-4">
            {recommendations.map((rec) => (
              <div
                key={rec.category}
                className="overflow-hidden rounded-2xl bg-white"
                style={{ boxShadow: "0 0 0 1px rgba(167,191,241,0.4)" }}
              >
                <div className="flex items-center gap-3 bg-light-blue-200 px-5 py-3.5">
                  <img src={recIcon(rec.priority)} alt="" className="h-6 w-6" />
                  <h3 className="text-[14px] font-semibold text-gray-900">{rec.category}</h3>
                  <span className={`score-badge text-[10px] font-bold uppercase tracking-wide ${recBadge(rec.priority)}`}>
                    {rec.priority}
                  </span>
                  <span className="ml-auto text-[12px] font-semibold text-dark-200 tabular-nums">
                    {rec.items.length} item{rec.items.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="divide-y divide-light-blue-200">
                  {rec.items.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 px-5 py-3.5">
                      <img src="/icons/warning.svg" alt="" className="mt-0.5 h-4 w-4 shrink-0" />
                      <p className="text-[13px] leading-relaxed text-dark-200">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {missingClauses.length > 0 && (
              <div
                className="overflow-hidden rounded-2xl"
                style={{ boxShadow: "0 0 0 1px rgba(167,191,241,0.4)" }}
              >
                <div className="flex items-center gap-3 bg-badge-red px-5 py-3.5">
                  <img src="/icons/ats-bad.svg" alt="" className="h-6 w-6" />
                  <h3 className="text-[14px] font-semibold text-badge-red-text">Missing mandatory clauses</h3>
                  <span className="score-badge bg-white/70 text-[10px] font-bold uppercase tracking-wide text-badge-red-text">
                    critical
                  </span>
                  <span className="ml-auto text-[12px] font-semibold text-badge-red-text tabular-nums">
                    {missingClauses.length}
                  </span>
                </div>
                <div className="divide-y divide-badge-red bg-white">
                  {missingClauses.map((mc, i) => (
                    <div key={i} className="space-y-1 px-5 py-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold text-gray-900">{mc.clauseName}</span>
                        {mc.articleReference && (
                          <span className="score-badge bg-light-blue-100 text-[10px] font-semibold text-dark-200">
                            {mc.articleReference}
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-dark-200">{mc.reason}</p>
                      <p className="text-[12px] font-medium text-badge-red-text">{mc.recommendation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {recommendations.length === 0 && missingClauses.length === 0 && (
              <div className="rounded-2xl bg-light-blue-100 px-6 py-12 text-center">
                <p className="text-[13px] text-dark-200">No recommendations generated for this review.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
