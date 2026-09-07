/**
 * normalizeFindings.ts
 *
 * Transforms the raw CompareResult (risks, differences, alignment, clausesA/B)
 * into flat, sorted view-model structures consumed by:
 *   - CompareFindingsRail   (left panel findings list)
 *   - CompareEvidencePane   (right panel clause evidence)
 *   - CompareWorkspaceHeader (summary bar counts)
 *
 * Design goals:
 *   - Pure function, no side effects — safe to call in useMemo / render
 *   - All cross-references resolved here so components never need to join
 *   - Stable IDs for React keys and selection state
 *
 * Routing by relationshipType (when available):
 *   MATCH / MOVED  → normal material/drafting/unchanged routing based on diff
 *                    (MOVED carries isMoved=true on the FindingViewModel)
 *   MERGED         → mergedClauses[] group — structural consolidations shown
 *                    separately, never as independent material findings
 *   UNCERTAIN      → uncertainClauses[] group — not presented as confirmed changes
 *   ADDED / REMOVED → normal routing (diff.classification drives these)
 *   undefined      → legacy path — diff.classification only (backwards compat)
 */

import type {
  CompareResult,
  CompareRiskFinding,
  CompareClauseDifference,
  CompareAlignedPair,
} from "../../../randtrustAI/types";

// ─── ClauseRecord ─────────────────────────────────────────────────────────────

/**
 * Lightweight clause record passed to EvidencePane.
 * Contains exactly what's needed for rendering text evidence.
 */
export interface ClauseRecord {
  id: string;
  title: string;
  text: string;
  /** Zero-based char offset in the full extracted text — used for ordering */
  position?: number;
  sectionPath?: string[];
}

// ─── FindingViewModel ─────────────────────────────────────────────────────────

/**
 * A single row in the findings rail plus its linked evidence.
 *
 * kind = "risk"     → finding has a linked RiskFinding and usually a diff
 * kind = "no-risk"  → change detected but risk engine did not flag a risk
 * kind = "drafting" → NEUTRAL_REPHRASE — surfaced separately, collapsed by default
 */
export type FindingKind = "risk" | "no-risk" | "drafting";

export interface FindingViewModel {
  /** Stable unique ID for React keys / selection */
  id: string;
  kind: FindingKind;

  /** Linked risk finding, if any */
  risk: CompareRiskFinding | null;
  /** Linked diff record, if any */
  diff: CompareClauseDifference | null;
  /** Linked alignment pair */
  pair: CompareAlignedPair | null;

  /** Display helpers */
  clauseTitle: string | null;
  /** "§ 3.2" style label, derived from sectionPath */
  sectionLabel: string | null;

  /**
   * True when the alignment relationship is MOVED — the clause exists in both
   * documents but at a different structural position. Shown as a subtle
   * "Moved" indicator on the card without changing the change-type badge.
   */
  isMoved: boolean;

  /**
   * Ordering position — derived from the position of clauseA in the original
   * document. Used for "document order" sort. Falls back to pair index.
   */
  docPosition: number;
}

// ─── DraftingFinding ─────────────────────────────────────────────────────────

/** NEUTRAL_REPHRASE entries are segmented from main findings */
export interface DraftingFinding {
  id: string;
  kind: "drafting";
  diff: CompareClauseDifference;
  pair: CompareAlignedPair | null;
  clauseTitle: string | null;
  sectionLabel: string | null;
  docPosition: number;
  isMoved: boolean;
}

// ─── UnchangedEntry ───────────────────────────────────────────────────────────

export interface UnchangedEntry {
  id: string;
  clauseTitle: string | null;
  sectionLabel: string | null;
}

// ─── MergedEntry ──────────────────────────────────────────────────────────────

/**
 * A MERGED alignment pair — one Modified clause that structurally absorbed
 * content from one or more Original clauses. These are NOT independent material
 * findings; they are shown as structural context only.
 */
export interface MergedEntry {
  id: string;
  /** ID of the Original clause that was absorbed */
  clauseAId: string | null;
  /** ID of the Modified clause it was merged into */
  clauseBId: string | null;
  clauseTitle: string | null;
  sectionLabel: string | null;
}

// ─── UncertainEntry ───────────────────────────────────────────────────────────

/**
 * An UNCERTAIN alignment — correspondence could not be established.
 * Shown only as a count/indicator, never as a confirmed material change.
 */
export interface UncertainEntry {
  id: string;
  clauseTitle: string | null;
  sectionLabel: string | null;
}

// ─── NormalizedCompareData ────────────────────────────────────────────────────

/**
 * The top-level view model produced by normalizeCompareData().
 * Passed down to all Compare workspace components.
 */
export interface NormalizedCompareData {
  /** Primary findings list (risks + no-risk changes, excluding NEUTRAL_REPHRASE) */
  findings: FindingViewModel[];
  /** NEUTRAL_REPHRASE diffs — shown in a collapsed group */
  draftingChanges: DraftingFinding[];
  /** UNCHANGED aligned pairs — shown in a separate collapsed group */
  unchangedClauses: UnchangedEntry[];
  /**
   * MERGED alignment pairs — Original clauses structurally consolidated into
   * Modified clauses. Shown as structural context, not independent findings.
   */
  mergedClauses: MergedEntry[];
  /**
   * UNCERTAIN alignment pairs — correspondence could not be established.
   * Shown only as a count indicator; never as confirmed changes.
   */
  uncertainClauses: UncertainEntry[];

  /** Clause records indexed by ID — handed to EvidencePane */
  clausesA: ClauseRecord[];
  clausesB: ClauseRecord[];

  /** Aggregate counts for the header summary bar */
  counts: {
    high: number;
    medium: number;
    low: number;
    noRisk: number;
    /** Number of unique material pair IDs (not FindingViewModel count) */
    materialPairs: number;
    /** Total number of risk findings */
    riskFindings: number;
    affectedClauses: number;
    unchanged: number;
    merged: number;
    uncertain: number;
    totalClauses: number;
    /** The full findings list (one per risk per pair — for iteration) */
    total: FindingViewModel[];
  };
}

// ─── Filter / sort types ──────────────────────────────────────────────────────

export type ChangeTypeFilter =
  | "all"
  | "ADDED"
  | "REMOVED"
  | "MODIFIED_BROADER"
  | "MODIFIED_NARROWER"
  | "NEUTRAL_REPHRASE";

export type SeverityFilter = "all" | "HIGH" | "MEDIUM" | "LOW" | "none";
export type CategoryFilter = string; // "all" | any RiskCategory value
export type DetectionFilter = "all" | "deterministic" | "llm" | "identical" | "similarity";
export type SortOrder = "severity" | "position" | "category";

export interface FindingFilters {
  search: string;
  changeType: ChangeTypeFilter;
  severity: SeverityFilter;
  category: CategoryFilter;
  detection: DetectionFilter;
  sort: SortOrder;
}

export const DEFAULT_FILTERS: FindingFilters = {
  search: "",
  changeType: "all",
  severity: "all",
  category: "all",
  detection: "all",
  sort: "severity",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive a readable section label from sectionPath array */
function sectionLabel(sectionPath: string[] | undefined): string | null {
  if (!sectionPath || sectionPath.length === 0) return null;
  const deepest = sectionPath[sectionPath.length - 1];
  return deepest ? `§ ${deepest}` : null;
}

/** Build a ClauseRecord map from the raw clause arrays */
function buildClauseMap(clauses: ClauseRecord[]): Map<string, ClauseRecord> {
  const map = new Map<string, ClauseRecord>();
  for (const c of clauses) map.set(c.id, c);
  return map;
}

const SEVERITY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const CATEGORY_ORDER: Record<string, number> = {
  liability: 0,
  indemnity: 1,
  ip: 2,
  termination: 3,
  data_protection: 4,
  payment: 5,
  confidentiality: 6,
  governing_law: 7,
  audit_rights: 8,
  other: 9,
};

// ─── Main normalizer ──────────────────────────────────────────────────────────

/**
 * Produces NormalizedCompareData from a completed CompareResult.
 *
 * Called once inside a useMemo when a compare result is available.
 * Input validation is defensive — all arrays default to [] if absent.
 */
export function normalizeCompareData(result: CompareResult): NormalizedCompareData {
  const risks: CompareRiskFinding[] = result.risks ?? [];
  const differences: CompareClauseDifference[] = result.differences ?? [];
  const alignment: CompareAlignedPair[] = result.alignment ?? [];
  const rawClausesA: ClauseRecord[] = result.clausesA ?? [];
  const rawClausesB: ClauseRecord[] = result.clausesB ?? [];

  const clauseMapA = buildClauseMap(rawClausesA);
  const clauseMapB = buildClauseMap(rawClausesB);

  // Build pair map for quick lookup
  const pairMap = new Map<string, CompareAlignedPair>();
  for (const p of alignment) pairMap.set(p.id, p);

  // Build diff map keyed by pairId — there is at most one diff per pair
  const diffByPairId = new Map<string, CompareClauseDifference>();
  for (const d of differences) {
    if (d.pairId) diffByPairId.set(d.pairId, d);
  }

  // Build risk map keyed by pairId — risks reference pairs via pairId
  const riskByPairId = new Map<string, CompareRiskFinding[]>();
  for (const r of risks) {
    if (!r.pairId) continue;
    const existing = riskByPairId.get(r.pairId) ?? [];
    existing.push(r);
    riskByPairId.set(r.pairId, existing);
  }

  const findings: FindingViewModel[] = [];
  const draftingChanges: DraftingFinding[] = [];
  const unchangedClauses: UnchangedEntry[] = [];
  const mergedClauses: MergedEntry[] = [];
  const uncertainClauses: UncertainEntry[] = [];

  // Iterate pairs in alignment order — each pair is the unit of display
  alignment.forEach((pair, pairIndex) => {
    const rel = pair.relationshipType;
    const diff = diffByPairId.get(pair.id) ?? null;
    const riskList = riskByPairId.get(pair.id) ?? [];

    // Derive position from clause A (baseline) if available
    const clauseA = pair.clauseAId ? clauseMapA.get(pair.clauseAId) ?? null : null;
    const clauseB = pair.clauseBId ? clauseMapB.get(pair.clauseBId) ?? null : null;
    const docPosition = clauseA?.position ?? clauseB?.position ?? pairIndex * 1000;

    const clauseTitle = clauseA?.title ?? clauseB?.title ?? null;
    const secLabel =
      sectionLabel(clauseA?.sectionPath) ??
      sectionLabel(clauseB?.sectionPath) ??
      null;

    // ── Structural routing by relationshipType ────────────────────────────
    //
    // MERGED: one Modified clause absorbed multiple Original clauses.
    //   The backend emits UNCHANGED diffs for these — they are already
    //   accounted for in the MATCH/MOVED pair that absorbed their content.
    //   Route to mergedClauses[] so the UI can show structural context
    //   without presenting them as independent material findings.
    if (rel === "MERGED") {
      mergedClauses.push({
        id: `merged-${pair.id}`,
        clauseAId: pair.clauseAId,
        clauseBId: pair.clauseBId,
        clauseTitle,
        sectionLabel: secLabel,
      });
      return;
    }

    // UNCERTAIN: correspondence could not be established.
    //   The backend emits UNCHANGED/fallback diffs — not confirmed changes.
    //   Route to uncertainClauses[] (shown only as a count, never as findings).
    if (rel === "UNCERTAIN") {
      uncertainClauses.push({
        id: `uncertain-${pair.id}`,
        clauseTitle,
        sectionLabel: secLabel,
      });
      return;
    }

    // MOVED: present in both documents but at a different position.
    //   Falls through to normal diff routing — the diff classification
    //   (MODIFIED_BROADER, MODIFIED_NARROWER, NEUTRAL_REPHRASE, UNCHANGED)
    //   is still meaningful. We carry isMoved=true on the FindingViewModel.
    const isMoved = rel === "MOVED";

    // ── Normal diff-based routing ─────────────────────────────────────────

    // UNCHANGED or no diff → collapsed unchanged group
    if (!diff || diff.classification === "UNCHANGED") {
      unchangedClauses.push({
        id: `unchanged-${pair.id}`,
        clauseTitle,
        sectionLabel: secLabel,
      });
      return;
    }

    // NEUTRAL_REPHRASE → drafting-changes collapsed group
    if (diff.classification === "NEUTRAL_REPHRASE") {
      draftingChanges.push({
        id: `drafting-${pair.id}`,
        kind: "drafting",
        diff,
        pair,
        clauseTitle,
        sectionLabel: secLabel,
        docPosition,
        isMoved,
      });
      return;
    }

    // Material change — produce one FindingViewModel per risk if there are
    // risks, or one "no-risk" finding if the diff has no associated risk.
    if (riskList.length === 0) {
      findings.push({
        id: `norisk-${pair.id}`,
        kind: "no-risk",
        risk: null,
        diff,
        pair,
        clauseTitle,
        sectionLabel: secLabel,
        docPosition,
        isMoved,
      });
    } else {
      // Multiple risks on the same pair: emit one FindingViewModel per risk.
      // The count of unique material pairs is tracked separately (counts.materialPairs).
      riskList.forEach((risk, ri) => {
        findings.push({
          id: `finding-${pair.id}-${ri}`,
          kind: "risk",
          risk,
          diff,
          pair,
          clauseTitle,
          sectionLabel: secLabel,
          docPosition,
          isMoved,
        });
      });
    }
  });

  // Also surface any diffs that have no alignment pair (defensive guard —
  // should not occur in practice)
  for (const diff of differences) {
    if (
      diff.pairId &&
      !pairMap.has(diff.pairId) &&
      diff.classification !== "UNCHANGED" &&
      diff.classification !== "NEUTRAL_REPHRASE"
    ) {
      findings.push({
        id: `orphan-${diff.pairId}`,
        kind: "no-risk",
        risk: null,
        diff,
        pair: null,
        clauseTitle: diff.clauseAId ?? diff.clauseBId ?? null,
        sectionLabel: null,
        docPosition: Number.MAX_SAFE_INTEGER,
        isMoved: false,
      });
    }
  }

  // Default sort: severity HIGH → MEDIUM → LOW → no-risk
  findings.sort((a, b) => {
    const aLevel = a.risk?.level ?? "NONE";
    const bLevel = b.risk?.level ?? "NONE";
    const aOrd = SEVERITY_ORDER[aLevel] ?? 3;
    const bOrd = SEVERITY_ORDER[bLevel] ?? 3;
    if (aOrd !== bOrd) return aOrd - bOrd;
    return a.docPosition - b.docPosition;
  });

  // ── Counts ────────────────────────────────────────────────────────────────
  //
  // materialPairs = unique pair IDs among material findings (not VM count).
  // This correctly represents "N clause changes" even when one pair has
  // multiple risk findings producing multiple FindingViewModels.
  const materialPairIds = new Set(findings.map((f) => f.pair?.id ?? f.id));
  const materialPairs = materialPairIds.size;
  const riskFindings = findings.filter((f) => f.kind === "risk").length;

  const high = findings.filter((f) => f.risk?.level === "HIGH").length;
  const medium = findings.filter((f) => f.risk?.level === "MEDIUM").length;
  const low = findings.filter((f) => f.risk?.level === "LOW").length;
  const noRisk = findings.filter((f) => f.kind === "no-risk").length;

  const affectedPairIds = new Set<string>();
  for (const d of differences) {
    if (d.classification !== "UNCHANGED") {
      affectedPairIds.add(d.pairId);
    }
  }

  return {
    findings,
    draftingChanges,
    unchangedClauses,
    mergedClauses,
    uncertainClauses,
    clausesA: rawClausesA,
    clausesB: rawClausesB,
    counts: {
      high,
      medium,
      low,
      noRisk,
      materialPairs,
      riskFindings,
      affectedClauses: affectedPairIds.size,
      unchanged: unchangedClauses.length,
      merged: mergedClauses.length,
      uncertain: uncertainClauses.length,
      totalClauses: alignment.length,
      total: findings,
    },
  };
}

// ─── Filter function ──────────────────────────────────────────────────────────

/**
 * Applies FindingFilters to a FindingViewModel list.
 * Returns a new sorted array — does not mutate the input.
 */
export function filterFindings(
  findings: FindingViewModel[],
  filters: FindingFilters
): FindingViewModel[] {
  let result = findings;

  // Search (case-insensitive substring on title, section, summary, rationale)
  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    result = result.filter((f) => {
      const haystack = [
        f.clauseTitle,
        f.sectionLabel,
        f.diff?.semanticSummary,
        f.risk?.rationale,
        f.risk?.category,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  // Change type filter
  if (filters.changeType !== "all") {
    result = result.filter((f) => f.diff?.classification === filters.changeType);
  }

  // Severity filter
  if (filters.severity !== "all") {
    if (filters.severity === "none") {
      result = result.filter((f) => f.kind !== "risk");
    } else {
      result = result.filter((f) => f.risk?.level === filters.severity);
    }
  }

  // Category filter
  if (filters.category !== "all") {
    result = result.filter((f) => f.risk?.category === filters.category);
  }

  // Detection filter
  if (filters.detection !== "all") {
    result = result.filter((f) => {
      if (filters.detection === "deterministic" || filters.detection === "llm") {
        return f.risk?.source === filters.detection;
      }
      return f.diff?.detectionMethod === filters.detection;
    });
  }

  // Sort
  const sorted = [...result];
  switch (filters.sort) {
    case "severity":
      sorted.sort((a, b) => {
        const aOrd = SEVERITY_ORDER[a.risk?.level ?? "NONE"] ?? 3;
        const bOrd = SEVERITY_ORDER[b.risk?.level ?? "NONE"] ?? 3;
        if (aOrd !== bOrd) return aOrd - bOrd;
        return a.docPosition - b.docPosition;
      });
      break;
    case "position":
      sorted.sort((a, b) => a.docPosition - b.docPosition);
      break;
    case "category":
      sorted.sort((a, b) => {
        const aOrd = CATEGORY_ORDER[a.risk?.category ?? "other"] ?? 9;
        const bOrd = CATEGORY_ORDER[b.risk?.category ?? "other"] ?? 9;
        if (aOrd !== bOrd) return aOrd - bOrd;
        return a.docPosition - b.docPosition;
      });
      break;
  }

  return sorted;
}
