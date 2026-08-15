import React, { useState } from "react";
import { Finding } from "../types";
import { DPAStatusBadge } from "./DPAStatusBadge";

interface DPAFindingInspectorProps {
  finding: Finding | null;
}

function analysisBullets(finding: Finding): string[] {
  const article = finding.article ?? finding.articleReference;
  const bullets: string[] = [];

  if (finding.status === "missing") {
    bullets.push("Required contractual language is absent from the agreement.");
  } else if (finding.status === "warning") {
    bullets.push("Clause is present but incomplete, ambiguous, or insufficiently specific for GDPR.");
  } else {
    bullets.push("Clause meets baseline GDPR requirements with limited residual risk.");
  }

  if (finding.severity) {
    bullets.push(`Assessed severity: ${finding.severity}.`);
  }
  if (article) {
    bullets.push(`Mapped against ${article}.`);
  }

  const fromDescription = finding.description
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);

  return [...bullets.slice(0, 2), ...fromDescription.slice(0, 4)];
}

function snippetTone(status: Finding["status"]) {
  if (status === "compliant") return "bg-badge-green text-badge-green-text";
  if (status === "warning") return "bg-badge-yellow text-badge-yellow-text";
  return "bg-badge-red text-badge-red-text";
}

export function DPAFindingInspector({ finding }: DPAFindingInspectorProps) {
  const [copiedRec, setCopiedRec] = useState(false);

  if (!finding) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center px-5 py-10 text-center">
        <img src="/icons/info.svg" alt="" className="mb-3 h-10 w-10 opacity-70" />
        <p className="mb-1 text-sm font-semibold text-gray-900">Select a finding</p>
        <p className="max-w-[230px] text-xs leading-relaxed text-dark-200">
          Choose a clause to inspect the legal snippet, AI analysis, and remediation guidance.
        </p>
      </div>
    );
  }

  const article = finding.article ?? finding.articleReference;
  const bullets = analysisBullets(finding);

  const handleCopyRecommendation = () => {
    navigator.clipboard.writeText(finding.recommendation).catch(() => {});
    setCopiedRec(true);
    setTimeout(() => setCopiedRec(false), 1800);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 border-b border-light-blue-200 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-gray-900">
            {finding.clause}
          </h3>
          <DPAStatusBadge status={finding.status} />
        </div>
        {article && (
          <p className="text-xs font-medium text-dark-200">{article}</p>
        )}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-200">
            Clause snippet
          </p>
          <div className={`rounded-2xl p-3.5 text-[13px] leading-relaxed ${snippetTone(finding.status)}`}>
            {finding.description}
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-200">
            AI analysis
          </p>
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
          <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-200">
            Suggested remediation
          </p>
          <div className="overflow-hidden rounded-2xl bg-light-blue-100 inset-shadow">
            <p className="p-3.5 text-[13px] leading-relaxed text-gray-800">
              {finding.recommendation}
            </p>
            <div className="flex items-center gap-2 border-t border-light-blue-200 px-3 py-2.5">
              <button
                type="button"
                onClick={handleCopyRecommendation}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-dark-200 transition-colors hover:bg-light-blue-100"
              >
                <img src={copiedRec ? "/icons/check.svg" : "/icons/info.svg"} alt="" className="h-3 w-3" />
                {copiedRec ? "Copied" : "Copy recommendation"}
              </button>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-dark-200">
                {finding.status === "compliant" ? "Optional polish" : "Action required"}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
