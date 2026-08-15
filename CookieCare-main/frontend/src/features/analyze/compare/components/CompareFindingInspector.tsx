import type { ReactNode } from "react";
import { CATEGORY_LABELS, DIFF_LABELS, ALIGN_LABELS, RISK_BADGE } from "../constants";
import type {
  CompareRiskFinding,
  CompareClauseDifference,
  CompareAlignedPair,
} from "../../../randtrustAI/types";

export type CompareInspectTarget =
  | { kind: "risk"; item: CompareRiskFinding }
  | { kind: "diff"; item: CompareClauseDifference }
  | { kind: "align"; item: CompareAlignedPair };

function EmptyInspector({ hint }: { hint: string }) {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center px-5 py-10 text-center">
      <img src="/icons/info.svg" alt="" className="mb-3 h-10 w-10 opacity-70" />
      <p className="mb-1 text-sm font-semibold text-gray-900">Select a row</p>
      <p className="max-w-[230px] text-xs leading-relaxed text-dark-200">{hint}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-200">{label}</p>
      {children}
    </section>
  );
}

function RiskDetail({ item }: { item: CompareRiskFinding }) {
  const tone = RISK_BADGE[item.level] ?? RISK_BADGE.MEDIUM;
  return (
    <>
      <div className="space-y-2.5 border-b border-light-blue-200 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-gray-900">
            {CATEGORY_LABELS[item.category] ?? item.category}
          </h3>
          <span className={`score-badge shrink-0 text-[10px] font-semibold ${tone.badge}`}>
            {tone.label}
          </span>
        </div>
        <p className="text-xs font-medium text-dark-200">
          {Math.round(item.confidence * 100)}% confidence · {item.source === "llm" ? "Model review" : "Rule-based"}
        </p>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <Field label="Finding">
          <div className={`rounded-2xl p-3.5 text-[13px] leading-relaxed ${tone.badge}`}>
            {item.rationale}
          </div>
        </Field>
        <Field label="Review notes">
          <ul className="space-y-2">
            <li className="flex items-start gap-2.5 text-[13px] leading-relaxed text-dark-200">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#8e98ff]" />
              <span>
                Treat this as a {item.level.toLowerCase()}-severity commercial or legal delta between the two agreements.
              </span>
            </li>
            {item.pairId ? (
              <li className="flex items-start gap-2.5 text-[13px] leading-relaxed text-dark-200">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#8e98ff]" />
                <span>Linked clause pair: {item.pairId}</span>
              </li>
            ) : null}
          </ul>
        </Field>
      </div>
    </>
  );
}

function DiffDetail({ item }: { item: CompareClauseDifference }) {
  const meta = DIFF_LABELS[item.classification] ?? DIFF_LABELS.NEUTRAL_REPHRASE;
  return (
    <>
      <div className="space-y-2.5 border-b border-light-blue-200 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-gray-900">
            Clause change
          </h3>
          <span className={`score-badge shrink-0 text-[10px] font-semibold ${meta.badge}`}>
            {meta.label}
          </span>
        </div>
        <p className="text-xs font-medium text-dark-200">
          {Math.round(item.confidence * 100)}% confidence
        </p>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <Field label="What changed">
          <div className="rounded-2xl bg-light-blue-100 p-3.5 text-[13px] leading-relaxed text-gray-800">
            {item.semanticSummary || "No semantic summary was returned for this pair."}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-[#F7F8FB] px-3.5 py-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-dark-200">Original</p>
            <p className="truncate text-[13px] font-medium text-[#1a1a1a]">{item.clauseAId ?? "Not present"}</p>
          </div>
          <div className="rounded-2xl bg-[#F7F8FB] px-3.5 py-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-dark-200">Revised</p>
            <p className="truncate text-[13px] font-medium text-[#1a1a1a]">{item.clauseBId ?? "Not present"}</p>
          </div>
        </div>
      </div>
    </>
  );
}

function AlignDetail({ item }: { item: CompareAlignedPair }) {
  const meta = ALIGN_LABELS[item.status] ?? ALIGN_LABELS.matched;
  return (
    <>
      <div className="space-y-2.5 border-b border-light-blue-200 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-gray-900">
            Clause alignment
          </h3>
          <span className={`score-badge shrink-0 text-[10px] font-semibold ${meta.badge}`}>
            {meta.label}
          </span>
        </div>
        <p className="text-xs font-medium text-dark-200">
          {item.alignmentType} match · {Math.round(item.matchConfidence * 100)}%
        </p>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <Field label="Alignment note">
          <div className="rounded-2xl bg-light-blue-100 p-3.5 text-[13px] leading-relaxed text-gray-800">
            {item.alignmentReason || "No alignment note was returned."}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-[#F7F8FB] px-3.5 py-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-dark-200">Original</p>
            <p className="truncate text-[13px] font-medium text-[#1a1a1a]">{item.clauseAId ?? "—"}</p>
          </div>
          <div className="rounded-2xl bg-[#F7F8FB] px-3.5 py-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-dark-200">Revised</p>
            <p className="truncate text-[13px] font-medium text-[#1a1a1a]">{item.clauseBId ?? "—"}</p>
          </div>
        </div>
      </div>
    </>
  );
}

export function CompareFindingInspector({
  target,
  emptyHint,
}: {
  target: CompareInspectTarget | null;
  emptyHint: string;
}) {
  if (!target) return <EmptyInspector hint={emptyHint} />;

  return (
    <div className="flex h-full flex-col">
      {target.kind === "risk" && <RiskDetail item={target.item} />}
      {target.kind === "diff" && <DiffDetail item={target.item} />}
      {target.kind === "align" && <AlignDetail item={target.item} />}
    </div>
  );
}
