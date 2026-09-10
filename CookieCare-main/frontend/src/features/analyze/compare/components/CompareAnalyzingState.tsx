import { COMPARE_PROGRESS_STAGES } from "../hooks/useCompare";

const CARD_SHADOW = "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)";

interface CompareAnalyzingStateProps {
  originalName: string;
  revisedName: string;
  currentLabel?: string;
}

export function CompareAnalyzingState({
  originalName,
  revisedName,
  currentLabel,
}: CompareAnalyzingStateProps) {
  const activeIndex = Math.max(
    0,
    COMPARE_PROGRESS_STAGES.findIndex((s) => s === currentLabel),
  );
  const pct = Math.round(((activeIndex + 1) / COMPARE_PROGRESS_STAGES.length) * 100);

  return (
    <div className="dpa-results-bg flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full rounded-[24px] bg-white px-6 py-10 sm:px-10" style={{ boxShadow: CARD_SHADOW }}>
          <img
            src="/images/resume-scan.gif"
            alt="Comparing agreements"
            className="mx-auto mb-6 h-[180px] w-auto object-contain sm:h-[220px]"
          />
          <h1 className="text-center text-[26px] font-semibold tracking-[-0.03em] text-[#1a1a1a] sm:text-[30px]">
            Comparing agreements
          </h1>
          <p className="mx-auto mt-2 max-w-md text-center text-[14px] leading-relaxed text-dark-200">
            Aligning clauses, scoring risk, and preparing a structured redline report.
          </p>

          <div className="mx-auto mt-6 max-w-md space-y-2">
            <div className="flex items-center gap-3 rounded-2xl bg-[#F7F8FB] px-4 py-3">
              <img src="/icons/info.svg" alt="" className="h-8 w-8 shrink-0 object-contain" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[#1a1a1a]">{originalName}</p>
                <p className="truncate text-[11px] text-dark-200">vs {revisedName}</p>
              </div>
              <span className="score-badge bg-badge-yellow text-[11px] font-medium text-badge-yellow-text">
                Scanning
              </span>
            </div>
          </div>

          <div className="mx-auto mt-5 h-[5px] max-w-md overflow-hidden rounded-full bg-[#F2F4F7]">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${Math.max(pct, 8)}%`,
                background: "linear-gradient(to bottom, #8e98ff, #606beb)",
              }}
            />
          </div>

          <ul className="mx-auto mt-8 max-w-md space-y-2.5">
            {COMPARE_PROGRESS_STAGES.map((stage, i) => {
              const status = i < activeIndex ? "done" : i === activeIndex ? "active" : "pending";
              return (
                <li key={stage} className="flex items-center gap-2.5">
                  {status === "done" ? (
                    <img src="/icons/check.svg" alt="" className="h-3.5 w-3.5 shrink-0" />
                  ) : status === "active" ? (
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#606beb]" />
                    </span>
                  ) : (
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#D0D5DD]" />
                    </span>
                  )}
                  <span
                    className={`text-[13px] ${
                      status === "done"
                        ? "text-dark-200"
                        : status === "active"
                          ? "font-medium text-[#1a1a1a]"
                          : "text-[#98A2B3]"
                    }`}
                  >
                    {stage.replace("…", "")}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
