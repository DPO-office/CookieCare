/**
 * CompareFindingsRail
 *
 * Left panel of the Compare workspace (report/fallback view):
 * summary header → search → filters → sorted finding rows.
 *
 * Visual rules:
 *  - Change type  → color-coded badge  (CHANGE_TYPE_STYLE)
 *  - Risk severity → neutral badge     (COMPARE_RISK_BADGE)
 *  - These two systems never share colors
 *  - Drafting changes collapsed by default
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Search, ChevronDown, ChevronUp, X,
} from "lucide-react";
import {
  COMPARE_RISK_BADGE, CHANGE_TYPE_STYLE, CATEGORY_LABELS,
} from "../constants";
import {
  filterFindings,
  DEFAULT_FILTERS,
  type FindingViewModel,
  type DraftingFinding,
  type UnchangedEntry,
  type NormalizedCompareData,
  type FindingFilters,
  type ChangeTypeFilter,
  type SeverityFilter,
  type CategoryFilter,
  type DetectionFilter,
  type SortOrder,
} from "../utils/normalizeFindings";

interface CompareFindingsRailProps {
  data: NormalizedCompareData;
  selectedId: string | null;
  onSelect: (finding: FindingViewModel) => void;
  onFilteredListChange?: (list: FindingViewModel[]) => void;
}

// ─── Filter option lists ──────────────────────────────────────────────────────

const CHANGE_TYPE_FILTER_OPTIONS: { value: ChangeTypeFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "ADDED", label: "Added" },
  { value: "REMOVED", label: "Removed" },
  { value: "MODIFIED_BROADER", label: "Broader" },
  { value: "MODIFIED_NARROWER", label: "Narrower" },
  { value: "NEUTRAL_REPHRASE", label: "Rephrased" },
];

const SEVERITY_FILTER_OPTIONS: { value: SeverityFilter; label: string }[] = [
  { value: "all", label: "All severity" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
  { value: "none", label: "No risk" },
];

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "severity", label: "Severity" },
  { value: "position", label: "Document order" },
  { value: "category", label: "Category" },
];

// ─── Main component ───────────────────────────────────────────────────────────

export function CompareFindingsRail({
  data,
  selectedId,
  onSelect,
  onFilteredListChange,
}: CompareFindingsRailProps) {
  const [filters, setFilters] = useState<FindingFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [draftingOpen, setDraftingOpen] = useState(false);
  const [unchangedOpen, setUnchangedOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const setFilter = useCallback(<K extends keyof FindingFilters>(key: K, val: FindingFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: val }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const filteredFindings = filterFindings(data.findings, filters);

  useEffect(() => {
    onFilteredListChange?.(filteredFindings);
  }, [filteredFindings, onFilteredListChange]);

  const hasActiveFilters =
    filters.search !== "" ||
    filters.changeType !== "all" ||
    filters.severity !== "all" ||
    filters.category !== "all" ||
    filters.detection !== "all" ||
    filters.sort !== "severity";

  const categoryOptions = Array.from(
    new Set(data.findings.filter((f) => f.kind === "risk").map((f) => (f as any).risk.category))
  ) as string[];

  // ── Summary counts from live data ────────────────────────────────────────
  const { high, medium, low } = data.counts;
  const riskTotal = high + medium + low;

  // ── FIX 3: counts use correct terminology ────────────────────────────────
  //
  // materialPairs = unique clause pairs with material diffs (not VM count).
  // riskFindings  = total risk findings (may be > materialPairs).
  const { materialPairs, riskFindings, merged, uncertain } = data.counts;
  const { high, medium, low } = data.counts;
  const riskTotal = high + medium + low;
  const hasStructuralContext = merged > 0 || uncertain > 0;

  const materialByType = useMemo(() => {
    const seen = new Set<string>();
    const byType: Record<string, number> = {
      REMOVED: 0, ADDED: 0, MODIFIED_BROADER: 0, MODIFIED_NARROWER: 0,
    };
    for (const f of data.findings) {
      const key = f.pair?.id ?? f.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const cls = f.diff?.classification;
      if (cls && cls in byType) byType[cls] += 1;
    }
    return byType;
  }, [data.findings]);

  return (
    <div className="flex h-full flex-col bg-white">

      {/* ── Summary header: Material Changes + Risks ── */}
      <div className="shrink-0 border-b border-[#E4E4E7] px-3 pt-3 pb-2.5 space-y-2.5">

        {/* Material changes — unique pair count */}
        <div>
          <div className="flex items-baseline justify-between">
            <p className="text-[11.5px] font-semibold text-[#111827]">Material Changes</p>
            <span className="text-[11px] font-bold tabular-nums text-[#111827]">
              {materialPairs}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {(
              [
                ["REMOVED", "Removed"],
                ["ADDED", "Added"],
                ["MODIFIED_BROADER", "Broader"],
                ["MODIFIED_NARROWER", "Narrower"],
              ] as const
            ).map(([key, label]) => {
              const n = materialByType[key];
              if (!n) return null;
              const style = CHANGE_TYPE_STYLE[key];
              return (
                <span key={key} className={`rounded px-1.5 py-0.5 text-[9.5px] font-semibold ${style.badge}`}>
                  {n} {label}
                </span>
              );
            })}
            {materialPairs === 0 && (
              <span className="text-[10px] text-[#9CA3AF]">None detected</span>
            )}
          </div>
        </div>

        <div className="border-t border-[#F3F4F6]" />

        {/* Risks — actual risk finding count */}
        <div>
          <div className="flex items-baseline justify-between">
            <p className="text-[11.5px] font-semibold text-[#111827]">Risks</p>
            <span className="text-[11px] font-bold tabular-nums text-[#111827]">{riskFindings}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {high > 0 && (
              <span className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold ${COMPARE_RISK_BADGE.HIGH.badge}`}>
                {high} HIGH
              </span>
            )}
            {medium > 0 && (
              <span className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold ${COMPARE_RISK_BADGE.MEDIUM.badge}`}>
                {medium} MEDIUM
              </span>
            )}
            {low > 0 && (
              <span className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold ${COMPARE_RISK_BADGE.LOW.badge}`}>
                {low} LOW
              </span>
            )}
            {riskFindings === 0 && (
              <span className="text-[10px] text-[#9CA3AF]">None scored</span>
            )}
          </div>
        </div>

        {/* FIX 5: Structural context — MERGED / UNCERTAIN */}
        {hasStructuralContext && (
          <>
            <div className="border-t border-[#F3F4F6]" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                Structural context
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {merged > 0 && (
                  <span className="rounded bg-[#F5F3FF] px-1.5 py-0.5 text-[9.5px] font-medium text-[#6D28D9]">
                    {merged} consolidated
                  </span>
                )}
                {uncertain > 0 && (
                  <span className="rounded bg-[#F3F4F6] px-1.5 py-0.5 text-[9.5px] font-medium text-[#6B7280]">
                    {uncertain} uncertain
                  </span>
                )}
              </div>
              <p className="mt-1 text-[9.5px] text-[#C4C9D4] leading-snug">
                {merged > 0 && uncertain > 0
                  ? "Some clauses were structurally consolidated or could not be matched — not counted as confirmed changes."
                  : merged > 0
                  ? "Some Original clauses were structurally consolidated into the Modified version."
                  : "Some clause correspondences could not be established — not counted as confirmed changes."}
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Search ── */}
      <div className="border-b border-[#F0F0F2] px-3 py-2.5">
        <div className="flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] bg-[#F9FAFB] px-3 py-2 focus-within:border-[#2175D9] focus-within:bg-white transition-colors">
          <Search className="h-3.5 w-3.5 shrink-0 text-[#9CA3AF]" aria-hidden />
          <input
            ref={searchRef}
            value={filters.search}
            onChange={(e) => setFilter("search", e.target.value)}
            placeholder="Search clauses, findings…"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[#111827] outline-none placeholder:text-[#9CA3AF]"
            aria-label="Search findings"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => setFilter("search", "")}
              className="shrink-0 text-[#9CA3AF] hover:text-[#374151]"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="border-b border-[#F0F0F2] px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <SelectChip
            value={filters.changeType}
            options={CHANGE_TYPE_FILTER_OPTIONS}
            onChange={(v) => setFilter("changeType", v as ChangeTypeFilter)}
            activeLabel={
              filters.changeType !== "all"
                ? CHANGE_TYPE_FILTER_OPTIONS.find((o) => o.value === filters.changeType)?.label
                : undefined
            }
          />
          <SelectChip
            value={filters.severity}
            options={SEVERITY_FILTER_OPTIONS}
            onChange={(v) => setFilter("severity", v as SeverityFilter)}
            activeLabel={
              filters.severity !== "all"
                ? SEVERITY_FILTER_OPTIONS.find((o) => o.value === filters.severity)?.label
                : undefined
            }
          />
          {categoryOptions.length > 0 && (
            <SelectChip
              value={filters.category}
              options={[
                { value: "all", label: "All categories" },
                ...categoryOptions.map((c) => ({ value: c, label: CATEGORY_LABELS[c] ?? c })),
              ]}
              onChange={(v) => setFilter("category", v as CategoryFilter)}
              activeLabel={
                filters.category !== "all"
                  ? (CATEGORY_LABELS[filters.category] ?? filters.category)
                  : undefined
              }
            />
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <SelectChip
              value={filters.sort}
              options={SORT_OPTIONS}
              onChange={(v) => setFilter("sort", v as SortOrder)}
              prefix="Sort:"
              activeLabel={SORT_OPTIONS.find((o) => o.value === filters.sort)?.label}
              small
            />
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-md px-1.5 py-1 text-[11px] font-medium text-[#6B7280] hover:text-[#374151] hover:bg-[#F3F4F6] transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Finding list ── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {filteredFindings.length === 0 && !hasActiveFilters ? (
          <EmptyState message="No findings to display." />
        ) : filteredFindings.length === 0 ? (
          <EmptyState message="No findings match the current filters." onClear={clearFilters} />
        ) : (
          <div className="py-1">
            <div className="px-3 pb-1.5 pt-1">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                {filteredFindings.length} finding{filteredFindings.length !== 1 ? "s" : ""}
                {hasActiveFilters ? " (filtered)" : ""}
              </p>
            </div>

            {filteredFindings.map((finding, idx) => (
              <FindingRow
                key={finding.id}
                finding={finding}
                index={idx}
                selected={finding.id === selectedId}
                onSelect={() => onSelect(finding)}
              />
            ))}
          </div>
        )}

        {/* Drafting / Non-material changes (collapsed by default) */}
        {data.draftingChanges.length > 0 && (
          <CollapsibleGroup
            open={draftingOpen}
            onToggle={() => setDraftingOpen((v) => !v)}
            label={`Drafting / Non-material (${data.draftingChanges.length})`}
            sublabel="Neutral rephrases · no material impact"
          >
            {data.draftingChanges.map((f) => (
              <DraftingRow
                key={f.id}
                finding={f}
                selected={f.id === selectedId}
                onSelect={() => onSelect(f)}
              />
            ))}
          </CollapsibleGroup>
        )}

        {/* Unchanged clauses (collapsed) */}
        {data.unchangedClauses.length > 0 && (
          <CollapsibleGroup
            open={unchangedOpen}
            onToggle={() => setUnchangedOpen((v) => !v)}
            label={`${data.unchangedClauses.length} clauses unchanged`}
            sublabel="No differences detected"
            muted
          >
            {data.unchangedClauses.map((f) => (
              <UnchangedRow key={f.id} entry={f} />
            ))}
          </CollapsibleGroup>
        )}
      </div>
    </div>
  );
}

// ─── Finding row ──────────────────────────────────────────────────────────────

/**
 * Hierarchy: section → change type badge (color) → risk badge (neutral) → title → snippet
 * Change type and risk are visually distinct systems.
 */
function FindingRow({
  finding,
  index,
  selected,
  onSelect,
}: {
  finding: FindingViewModel;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const risk = finding.kind === "risk" ? finding.risk : null;
  const diff = finding.diff;

  // Risk → neutral badge (HIGH=dark, MEDIUM=outlined, LOW=muted)
  const riskMeta = risk ? (COMPARE_RISK_BADGE[risk.level] ?? COMPARE_RISK_BADGE.MEDIUM) : null;
  // Change type → color badge
  const changeMeta =
    diff && diff.classification !== "UNCHANGED"
      ? (CHANGE_TYPE_STYLE[diff.classification] ?? null)
      : null;

  const sectionLabel = finding.sectionLabel;
  const title =
    finding.clauseTitle ??
    (risk ? (CATEGORY_LABELS[risk.category] ?? risk.category) : null) ??
    `Finding ${index + 1}`;

  // FIX 4: Build a meaningful snippet for ADDED/REMOVED when semanticSummary is "".
  const isAdded = diff?.classification === "ADDED";
  const isRemoved = diff?.classification === "REMOVED";
  const hasSummary = diff?.semanticSummary && diff.semanticSummary.trim().length > 0;

  const snippet: string | null | undefined = (() => {
    if (hasSummary) return diff!.semanticSummary.slice(0, 90);
    if (risk?.rationale) return risk.rationale.slice(0, 90);
    if (isAdded) return "Present in Modified — no counterpart in Original.";
    if (isRemoved) return "Present in Original — absent from Modified.";
    return undefined;
  })();

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group w-full border-b border-[#F0F0F2] px-3 py-2.5 text-left transition-colors last:border-b-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2175D9] ${
        selected
          ? "bg-[#EBF2FD] border-l-2 border-l-[#2175D9]"
          : "hover:bg-[#F9FAFB]"
      }`}
    >
      <div className="flex min-w-0 items-start gap-2">
        {/* Severity indicator dot */}
        <div className="mt-[5px] shrink-0">
          {riskMeta ? (
            <span
              className="block h-2 w-2 rounded-full"
              style={{
                background:
                  risk?.level === "HIGH"
                    ? "#111827"
                    : risk?.level === "MEDIUM"
                    ? "#6B7280"
                    : "#D1D5DB",
              }}
              aria-label={`${risk!.level} severity`}
            />
          ) : (
            <span className="block h-2 w-2 rounded-full bg-[#E5E7EB]" aria-label="No risk" />
          )}
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {/* Section label */}
          {sectionLabel && (
            <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-[#9CA3AF]">
              {sectionLabel}
            </p>
          )}

          {/* Title */}
          <p className="text-[12.5px] font-semibold leading-snug text-[#111827]">
            {title.length > 72 ? `${title.slice(0, 72)}…` : title}
          </p>

          {/* Badges row — change type (color) then risk (neutral), clearly separated */}
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {changeMeta && diff?.classification !== "NEUTRAL_REPHRASE" && (
              <span className={`rounded px-1.5 py-0.5 text-[9.5px] font-semibold ${changeMeta.badge}`}>
                {changeMeta.label}
              </span>
            )}
            {/* FIX 5: MOVED indicator */}
            {finding.isMoved && (
              <span className="rounded border border-[#E5E7EB] bg-white px-1.5 py-0.5 text-[9px] font-medium text-[#6B7280]">
                Moved
              </span>
            )}
            {changeMeta && riskMeta && diff?.classification !== "NEUTRAL_REPHRASE" && (
              <span className="text-[#D1D5DB]" aria-hidden>·</span>
            )}
            {riskMeta && (
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${riskMeta.badge}`}>
                {riskMeta.label}
              </span>
            )}
            {finding.kind === "no-risk" && !riskMeta && (
              <span className="rounded bg-[#F3F4F6] px-1.5 py-0.5 text-[9px] font-medium text-[#9CA3AF]">
                No risk scored
              </span>
            )}
          </div>

          {snippet && (
            <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-[#6B7280]">
              {snippet}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Drafting row ─────────────────────────────────────────────────────────────

function DraftingRow({
  finding,
  selected,
  onSelect,
}: {
  finding: DraftingFinding;
  selected: boolean;
  onSelect: () => void;
}) {
  const changeMeta = CHANGE_TYPE_STYLE.NEUTRAL_REPHRASE;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full border-b border-[#F0F0F2] px-3 py-2 text-left transition-colors last:border-b-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2175D9] ${
        selected ? "bg-[#EBF2FD]" : "hover:bg-[#F9FAFB]"
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-[5px] block h-1.5 w-1.5 shrink-0 rounded-full bg-[#D1D5DB]" />
        <div className="min-w-0 flex-1">
          {finding.sectionLabel && (
            <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-[#C4C9D4]">
              {finding.sectionLabel}
            </p>
          )}
          <div className="flex items-start justify-between gap-2">
            <span className="text-[12px] text-[#6B7280]">
              {finding.clauseTitle ?? finding.diff.semanticSummary?.slice(0, 56) ?? "Drafting change"}
              {/* FIX 5: MOVED indicator */}
              {finding.isMoved && (
                <span className="ml-1.5 inline-block rounded border border-[#E5E7EB] bg-white px-1 py-0.5 text-[9px] font-medium text-[#6B7280] align-middle">
                  Moved
                </span>
              )}
            </span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${changeMeta.badge}`}>
              {changeMeta.label}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Unchanged row ────────────────────────────────────────────────────────────

function UnchangedRow({ entry }: { entry: UnchangedEntry }) {
  return (
    <div className="flex items-start gap-2 border-b border-[#F0F0F2] px-3 py-2 last:border-b-0">
      <span className="mt-[5px] block h-1.5 w-1.5 shrink-0 rounded-full bg-[#E5E7EB]" />
      <div className="min-w-0 flex-1">
        {entry.sectionLabel && (
          <span className="mr-1.5 text-[10px] font-medium uppercase tracking-wide text-[#C4C9D4]">
            {entry.sectionLabel}
          </span>
        )}
        <span className="text-[12px] text-[#9CA3AF]">
          {entry.clauseTitle ?? "Unchanged clause"}
        </span>
      </div>
    </div>
  );
}

// ─── Collapsible group ────────────────────────────────────────────────────────

function CollapsibleGroup({
  open,
  onToggle,
  label,
  sublabel,
  muted,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  sublabel?: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-[#E4E4E7]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-[#F9FAFB] transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2175D9]"
      >
        <div>
          <p className={`text-[11.5px] font-semibold ${muted ? "text-[#9CA3AF]" : "text-[#6B7280]"}`}>
            {label}
          </p>
          {sublabel && (
            <p className="text-[10.5px] text-[#C4C9D4]">{sublabel}</p>
          )}
        </div>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[#C4C9D4]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#C4C9D4]" />
        )}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

// ─── Select chip filter ───────────────────────────────────────────────────────

function SelectChip({
  value,
  options,
  onChange,
  prefix,
  activeLabel,
  small,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (val: string) => void;
  prefix?: string;
  activeLabel?: string;
  small?: boolean;
}) {
  const isActive = value !== "all" && value !== "severity";
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`cursor-pointer appearance-none rounded-md border py-1 pr-5 pl-2.5 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2175D9] ${
          isActive
            ? "border-[#2175D9] bg-[#EBF2FD] text-[#1A5BAD]"
            : "border-[#E4E4E7] bg-white text-[#374151] hover:border-[#D1D5DB]"
        } ${small ? "pr-4" : ""}`}
        aria-label={prefix ?? "Filter"}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {prefix ? `${prefix} ${o.label}` : o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-[#9CA3AF]" />
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ message, onClear }: { message: string; onClear?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <p className="text-[13px] text-[#6B7280]">{message}</p>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="mt-2 text-[12px] font-medium text-[#2175D9] hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
