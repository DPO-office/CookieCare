import { useState, useEffect, useMemo, useRef } from "react";
import { Loader2 } from "lucide-react";
import type { AIEthicsReviewResult, EthicsFinding, EthicsDimensionId } from "../types";
import { EthicsRadialGauge } from "./EthicsRadialGauge";
import { EthicsDimensionCard } from "./EthicsDimensionCard";
import { EthicsFindingRow } from "./EthicsFindingRow";
import { EthicsFindingInspector } from "./EthicsFindingInspector";
import { buildEthicsDimensionResults } from "../utils/categorizeFindings";
import { useReportDownload } from "../../../shared/report/useReportDownload";
import { adaptEthicsResult } from "../../../shared/report/reportAdapters";

interface EthicsResultsStateProps {
  fileNames: string[];
  result: AIEthicsReviewResult;
  onReset: () => void;
}

const CARD_SHADOW = "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)";

function recTone(priority: string) {
  if (priority === "critical" || priority === "high") {
    return { icon: "/icons/ats-bad.svg", badge: "bg-badge-red text-badge-red-text" };
  }
  if (priority === "medium") {
    return { icon: "/icons/ats-warning.svg", badge: "bg-badge-yellow text-badge-yellow-text" };
  }
  return { icon: "/icons/ats-good.svg", badge: "bg-badge-green text-badge-green-text" };
}

export function EthicsResultsState({ fileNames, result, onReset }: EthicsResultsStateProps) {
  const [mounted, setMounted] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [activeView, setActiveView] = useState<"dimensions" | "recommendations">("dimensions");
  const [selectedDimensionId, setSelectedDimensionId] = useState<EthicsDimensionId | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const { isGenerating, downloadReport } = useReportDownload();

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, []);

  const findings = result.findings ?? [];
  const passedCount = findings.filter((f) => f.status === "passed").length;
  const warningCount = findings.filter(
    (f) => f.status === "warning" || f.status === "needs-improvement",
  ).length;
  const highRiskCount = findings.filter((f) => f.status === "high-risk").length;
  const ethicsScore = result.overallScore;

  const dimensions = useMemo(
    () => buildEthicsDimensionResults(findings, result.scoreBreakdown),
    [findings, result.scoreBreakdown],
  );

  const selectedDimension = dimensions.find((d) => d.dimension.id === selectedDimensionId) ?? null;
  const selectedFinding = findings.find((f) => f.id === selectedFindingId) ?? null;

  const statusPill =
    result.overallRisk === "critical" || result.overallRisk === "high"
      ? "bg-badge-red text-badge-red-text"
      : result.overallRisk === "medium"
        ? "bg-badge-yellow text-badge-yellow-text"
        : "bg-badge-green text-badge-green-text";

  const statusLabel =
    result.overallRisk === "critical" || result.overallRisk === "high"
      ? "Needs attention"
      : result.overallRisk === "medium"
        ? "Needs work"
        : "Strong";

  const primaryFile = fileNames[0] ?? "AI ethics review";
  const shortFileName = primaryFile.length > 42 ? `${primaryFile.slice(0, 39)}…` : primaryFile;

  const heroMetrics = [
    { label: "Passed", value: String(passedCount) },
    { label: "To review", value: String(warningCount) },
    { label: "High risk", value: String(highRiskCount), valueCls: highRiskCount > 0 ? "text-badge-red-text" : "text-[#1a1a1a]" },
    { label: "Findings", value: String(findings.length) },
  ];

  const handleDownloadReport = () => {
    const reportData = adaptEthicsResult(result, fileNames);
    downloadReport(reportData, `AI_Ethics_Assessment_Report_${new Date().toISOString().split("T")[0]}`);
  };

  const handleCopy = () => {
    const summary = `AI Ethics Assessment Report\nFiles: ${fileNames.join(", ") || "N/A"}\nEthics Score: ${ethicsScore}/100\nRisk: ${result.overallRisk}\n\n${result.summary}`;
    navigator.clipboard.writeText(summary).catch(() => {});
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const handleSelectDimension = (id: EthicsDimensionId) => {
    const next = selectedDimensionId === id ? null : id;
    setSelectedDimensionId(next);
    setActiveView("dimensions");
    if (next) {
      const dim = dimensions.find((d) => d.dimension.id === next);
      setSelectedFindingId(dim?.findings[0]?.id ?? null);
      setTimeout(() => {
        detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    } else {
      setSelectedFindingId(null);
    }
  };

  const handleSelectFinding = (finding: EthicsFinding) => {
    setSelectedFindingId(finding.id);
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
            <span>AI Ethics</span>
            <span className="text-gray-300">/</span>
            <span className="inline-flex max-w-[280px] items-center gap-1.5 truncate text-[#1a1a1a]">
              <img src="/icons/info.svg" alt="" className="h-4 w-4 object-contain" />
              {shortFileName}
            </span>
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex cursor-pointer items-center rounded-full border border-gray-200 bg-white px-4 py-2 text-[13px] font-medium text-dark-200 hover:bg-[#F7F8FB]"
            >
              {copiedSummary ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={onReset}
              className="inline-flex cursor-pointer items-center rounded-full border border-gray-200 bg-white px-4 py-2 text-[13px] font-medium text-dark-200 hover:bg-[#F7F8FB]"
            >
              New assessment
            </button>
            <button
              type="button"
              onClick={handleDownloadReport}
              disabled={isGenerating}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full primary-gradient px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generating…</>
              ) : (
                "Export PDF"
              )}
            </button>
          </div>
        </div>

        <section className="mb-8 rounded-[24px] bg-white p-6 sm:p-8" style={{ boxShadow: CARD_SHADOW }}>
          <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.03em] text-[#1a1a1a] sm:text-[34px]">
            AI ethics report
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-dark-200">
            {result.summary || "Responsible AI evaluation across six ethics dimensions — scored, categorized, and ready for remediation."}
          </p>
          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.1fr)] lg:items-center">
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <EthicsRadialGauge score={ethicsScore} />
              <div className="min-w-0">
                <span className={`score-badge text-[12px] font-medium ${statusPill}`}>{statusLabel}</span>
                <p className="mt-3 text-[13px] leading-relaxed text-dark-200">
                  {ethicsScore >= 70 ? "Strong ethics posture." : ethicsScore >= 50 ? "Improvement needed." : "Significant gaps found."}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {heroMetrics.map((m) => (
                <div key={m.label} className="rounded-2xl bg-[#F7F8FB] px-4 py-4 sm:px-5 sm:py-5">
                  <p className="mb-2 text-[12px] font-medium text-dark-200">{m.label}</p>
                  <p className={`text-[24px] font-semibold leading-none tracking-tight tabular-nums ${m.valueCls ?? "text-[#1a1a1a]"}`}>
                    {m.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="segmented-control mb-6">
          <button
            type="button"
            onClick={() => setActiveView("dimensions")}
            className={`segmented-control-btn ${activeView === "dimensions" ? "is-active" : ""}`}
          >
            Dimensions
          </button>
          <button
            type="button"
            onClick={() => setActiveView("recommendations")}
            className={`segmented-control-btn ${activeView === "recommendations" ? "is-active" : ""}`}
          >
            Recommendations
          </button>
        </div>

        {activeView === "dimensions" && (
          <>
            <div className="mb-5">
              <h2 className="text-[22px] font-semibold tracking-tight text-[#1a1a1a]">Ethics dimensions</h2>
            </div>
            <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {dimensions.map((dim, i) => (
                <EthicsDimensionCard
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
                <section className="overflow-hidden rounded-[22px] bg-white" style={{ boxShadow: CARD_SHADOW }}>
                  <div className="flex items-start justify-between gap-4 bg-[#EEF2FF] px-5 py-4 sm:px-6">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[16px] font-semibold tracking-tight text-[#1a1a1a]">
                          {selectedDimension.dimension.title}
                        </h3>
                        <span className={`score-badge text-[11px] font-medium ${
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
                      { label: "Passed", value: selectedDimension.passedCount, cls: "bg-badge-green text-badge-green-text" },
                      { label: "Warnings", value: selectedDimension.warningCount, cls: "bg-badge-yellow text-badge-yellow-text" },
                      { label: "High risk", value: selectedDimension.missingCount, cls: "bg-badge-red text-badge-red-text" },
                    ].map((s) => (
                      <div key={s.label} className={`rounded-2xl px-3 py-3 text-center ${s.cls}`}>
                        <p className="text-[18px] font-bold leading-none tabular-nums">{s.value}</p>
                        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider opacity-80">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex min-h-[360px] flex-col bg-white xl:flex-row">
                    <div className="min-w-0 flex-1 border-t border-[#EEF2FF] p-3 sm:p-4 xl:border-r xl:border-t-0">
                      {selectedDimension.findings.length === 0 ? (
                        <div className="py-14 text-center">
                          <p className="text-[13px] text-dark-200">No findings mapped to this dimension.</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {selectedDimension.findings.map((finding) => (
                            <EthicsFindingRow
                              key={finding.id}
                              finding={finding}
                              selected={selectedFindingId === finding.id}
                              onSelect={handleSelectFinding}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="w-full shrink-0 xl:w-[400px]">
                      <EthicsFindingInspector finding={selectedFinding} />
                    </div>
                  </div>
                </section>
              ) : (
                <div className="rounded-[22px] bg-[#EEF2FF] px-6 py-12 text-center">
                  <p className="mb-1 text-[14px] font-semibold text-[#1a1a1a]">Select a dimension to open the workspace</p>
                  <p className="mx-auto max-w-md text-[13px] leading-relaxed text-dark-200">
                    Findings and AI remediation open in a split view — evidence on the left, analysis and copyable recommendations on the right.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {activeView === "recommendations" && (
          <div className="max-w-4xl space-y-4">
            {(result.recommendations ?? []).map((rec) => {
              const tone = recTone(rec.priority);
              return (
                <div key={rec.category} className="overflow-hidden rounded-[22px] bg-white" style={{ boxShadow: CARD_SHADOW }}>
                  <div className="flex items-center gap-3 bg-[#EEF2FF] px-5 py-3.5">
                    <img src={tone.icon} alt="" className="h-5 w-5" />
                    <h3 className="text-[14px] font-semibold text-[#1a1a1a]">{rec.category}</h3>
                    <span className={`score-badge text-[10px] font-medium uppercase ${tone.badge}`}>{rec.priority}</span>
                    <span className="ml-auto text-[12px] font-medium tabular-nums text-dark-200">
                      {rec.items.length} item{rec.items.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="divide-y divide-[#F2F4F7]">
                    {rec.items.map((item, i) => (
                      <div key={i} className="flex items-start gap-3 px-5 py-3.5">
                        <img src="/icons/warning.svg" alt="" className="mt-0.5 h-4 w-4 shrink-0" />
                        <p className="text-[13px] leading-relaxed text-dark-200">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {(result.recommendations ?? []).length === 0 && (
              <div className="rounded-[22px] bg-[#EEF2FF] px-6 py-12 text-center">
                <p className="text-[13px] text-dark-200">No recommendations generated for this review.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
