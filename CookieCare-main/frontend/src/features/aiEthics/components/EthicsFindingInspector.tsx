import { useState } from "react";
import type { EthicsFinding } from "../types";
import { EthicsBadge } from "./EthicsBadge";

interface EthicsFindingInspectorProps {
  finding: EthicsFinding | null;
}

function analysisBullets(finding: EthicsFinding): string[] {
  const bullets: string[] = [];
  if (finding.status === "high-risk") {
    bullets.push("This control presents a material ethics or governance gap.");
  } else if (finding.status === "warning") {
    bullets.push("The practice is present but incomplete or insufficiently evidenced.");
  } else if (finding.status === "needs-improvement") {
    bullets.push("Baseline coverage exists, with room to strengthen documentation or process.");
  } else {
    bullets.push("This area meets responsible AI expectations with limited residual risk.");
  }
  if (finding.severity) bullets.push(`Assessed severity: ${finding.severity}.`);
  if (finding.category) bullets.push(`Mapped to ${finding.category}.`);

  const fromDescription = finding.description
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);

  return [...bullets.slice(0, 2), ...fromDescription.slice(0, 4)];
}

function snippetTone(status: EthicsFinding["status"]) {
  if (status === "passed") return "bg-badge-green text-badge-green-text";
  if (status === "warning" || status === "needs-improvement") return "bg-badge-yellow text-badge-yellow-text";
  return "bg-badge-red text-badge-red-text";
}

export function EthicsFindingInspector({ finding }: EthicsFindingInspectorProps) {
  const [copiedRec, setCopiedRec] = useState(false);

  if (!finding) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center px-5 py-10 text-center">
        <img src="/icons/info.svg" alt="" className="mb-3 h-10 w-10 opacity-70" />
        <p className="mb-1 text-sm font-semibold text-[#1a1a1a]">Select a finding</p>
        <p className="max-w-[230px] text-xs leading-relaxed text-dark-200">
          Choose an item to inspect evidence, AI analysis, and remediation guidance.
        </p>
      </div>
    );
  }

  const title = finding.title ?? finding.category;
  const bullets = analysisBullets(finding);

  const handleCopy = () => {
    navigator.clipboard.writeText(finding.recommendation).catch(() => {});
    setCopiedRec(true);
    setTimeout(() => setCopiedRec(false), 1800);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 border-b border-[#EEF2FF] px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-[#1a1a1a]">{title}</h3>
          <EthicsBadge status={finding.status} />
        </div>
        {finding.title && finding.category && finding.title !== finding.category && (
          <p className="text-xs font-medium text-dark-200">{finding.category}</p>
        )}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-200">Evidence</p>
          <div className={`rounded-2xl p-3.5 text-[13px] leading-relaxed ${snippetTone(finding.status)}`}>
            {finding.evidence || finding.description}
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-200">AI analysis</p>
          <ul className="space-y-2">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-dark-200">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#8e98ff]" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-200">Suggested remediation</p>
          <div className="overflow-hidden rounded-2xl bg-[#EEF2FF]">
            <p className="p-3.5 text-[13px] leading-relaxed text-[#1a1a1a]">{finding.recommendation}</p>
            <div className="flex items-center gap-2 border-t border-white/70 px-3 py-2.5">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-dark-200"
              >
                <img src={copiedRec ? "/icons/check.svg" : "/icons/info.svg"} alt="" className="h-3 w-3" />
                {copiedRec ? "Copied" : "Copy recommendation"}
              </button>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-dark-200">
                {finding.status === "passed" ? "Optional polish" : "Action required"}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
