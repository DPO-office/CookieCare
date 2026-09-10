import type { AnalysisStep } from "../types";

interface EthicsAnalyzingStateProps {
  fileNames: string[];
  steps: AnalysisStep[];
}

const CARD_SHADOW = "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)";

export function EthicsAnalyzingState({ fileNames, steps }: EthicsAnalyzingStateProps) {
  const active = steps.find((s) => s.status === "active") ?? steps.find((s) => s.status === "pending");
  const doneCount = steps.filter((s) => s.status === "done").length;
  const pct = Math.round((doneCount / Math.max(steps.length, 1)) * 100);
  const primaryName = fileNames[0] ?? "Website scan";
  const extra = fileNames.length > 1 ? ` + ${fileNames.length - 1} more` : "";

  return (
    <div className="dpa-results-bg flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full rounded-[24px] bg-white px-6 py-10 sm:px-10" style={{ boxShadow: CARD_SHADOW }}>
          <img
            src="/images/resume-scan.gif"
            alt="Scanning documents"
            className="mx-auto mb-6 h-[180px] w-auto object-contain sm:h-[220px]"
          />
          <h1 className="text-center text-[26px] font-semibold tracking-[-0.03em] text-[#1a1a1a] sm:text-[30px]">
            Evaluating AI ethics
          </h1>
          <p className="mx-auto mt-2 max-w-md text-center text-[14px] leading-relaxed text-dark-200">
            Reviewing your system against responsible AI principles. This usually takes 15–45 seconds.
          </p>

          <div className="mx-auto mt-6 flex max-w-md items-center gap-3 rounded-2xl bg-[#F7F8FB] px-4 py-3">
            <img src="/icons/info.svg" alt="" className="h-8 w-8 shrink-0 object-contain" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-[#1a1a1a]">
                {primaryName}
                {extra}
              </p>
              <p className="text-[11px] text-dark-200">{active?.label ?? "Preparing review…"}</p>
            </div>
            <span className="score-badge bg-badge-yellow text-[11px] font-medium text-badge-yellow-text">
              Scanning
            </span>
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
            {steps.map((step) => (
              <li key={step.id} className="flex items-center gap-2.5">
                {step.status === "done" ? (
                  <img src="/icons/check.svg" alt="" className="h-3.5 w-3.5 shrink-0" />
                ) : step.status === "active" ? (
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
                    step.status === "done"
                      ? "text-dark-200"
                      : step.status === "active"
                        ? "font-medium text-[#1a1a1a]"
                        : "text-[#98A2B3]"
                  }`}
                >
                  {step.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
