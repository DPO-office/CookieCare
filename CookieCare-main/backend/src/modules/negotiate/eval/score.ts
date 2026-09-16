/**
 * Pure metric computation from a set of gold findings + a set of v1 findings.
 * Preserves finding-level matches so every TP/FP/miss is auditable.
 */
import type { GoldFinding, V1Finding, SeverityBand } from "./types.js";
import { findingMatchesGold } from "./match.js";

const BAND_INDEX: Record<SeverityBand, number> = { GREEN: 0, YELLOW: 1, RED: 2, NONE: -1 };

export interface GoldMatchDetail {
  goldId: string;
  issueTag: string;
  kind: GoldFinding["kind"];
  importance: GoldFinding["importance"];
  expectedSeverityBand: SeverityBand;
  dupGroup?: string;
  caught: boolean;
  matchedClauseIds: string[];
  matchedRiskLevels: SeverityBand[];
  reason: string;
}

export interface Ratio { num: number; den: number; value: number | null; }
function ratio(num: number, den: number): Ratio {
  return { num, den, value: den === 0 ? null : num / den };
}

export interface DocScore {
  docFixtureId: string;
  totalV1Findings: number;
  goldMatchDetails: GoldMatchDetail[];
  // core metrics
  recallMustCatchIssues: Ratio;
  recallMustCatchAbsence: Ratio;
  primaryPrecision: Ratio;          // matched-non-trap / total v1 findings (lower bound; gold not exhaustive)
  fpTrapRateHard: Ratio;            // must_not_flag traps surfaced / total hard traps
  fpTrapRateSoft: Ratio;            // should_not_flag traps surfaced / total soft traps
  severityExactBand: Ratio;
  severityWithinOneBand: Ratio;
  dedupCorrect: Ratio;              // dupGroups collapsed to exactly ONE finding / total dupGroups
  // audit aids
  unmatchedV1ClauseIds: string[];   // v1 findings matching no gold (could be valid-but-unlabeled OR noise)
  trapHits: { goldId: string; clauseIds: string[] }[];
  dedupDetail: { dupGroup: string; distinctV1Findings: number; collapsedCorrectly: boolean; clauseIds: string[] }[];
  // Related golds on the same clause that ONE merged finding may satisfy (e.g. a2 + g3).
  mergeGroupDetail: {
    mergeGroup: string;
    memberGoldIds: string[];
    caughtMemberGoldIds: string[];
    allMembersCaught: boolean;
    distinctFindingsCovering: number;
    satisfiedBySingleFinding: boolean; // ideal: one finding matches every member
    coveringClauseIds: string[];
  }[];
}

/** Group gold findings by issueTag within a kind, so multi-location dup golds count once for recall. */
function distinctIssueGolds(golds: GoldFinding[], predicate: (g: GoldFinding) => boolean): Map<string, GoldFinding[]> {
  const m = new Map<string, GoldFinding[]>();
  for (const g of golds) {
    if (!predicate(g)) continue;
    const key = g.kind + "::" + g.issueTag;
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(g);
  }
  return m;
}

export function scoreDocument(docFixtureId: string, golds: GoldFinding[], findings: V1Finding[]): DocScore {
  // ── Per-gold match detail ──────────────────────────────────────────────
  const details: GoldMatchDetail[] = golds.map((g) => {
    const matched = findings.filter((f) => findingMatchesGold(g, f));
    return {
      goldId: g.id,
      issueTag: g.issueTag,
      kind: g.kind,
      importance: g.importance,
      expectedSeverityBand: g.expectedSeverityBand,
      dupGroup: g.dupGroup,
      caught: matched.length > 0,
      matchedClauseIds: matched.map((m) => m.clauseId),
      matchedRiskLevels: matched.map((m) => m.riskLevel),
      reason:
        matched.length > 0
          ? `matched ${matched.length} v1 finding(s) via anchor+keyword`
          : g.kind === "absence"
            ? "no v1 finding asserts this absence (v1 has no absence detection)"
            : "no v1 finding overlaps this anchor with the issue keywords",
    };
  });

  const caughtByGoldId = new Map(details.map((d) => [d.goldId, d.caught]));

  // ── Recall (dedup golds by issueTag so a dup-group issue counts once) ──
  const mustIssue = distinctIssueGolds(golds, (g) => g.kind === "issue" && g.importance === "must_catch");
  let mcIssueCaught = 0;
  for (const [, group] of mustIssue) if (group.some((g) => caughtByGoldId.get(g.id))) mcIssueCaught++;

  const mustAbsence = distinctIssueGolds(golds, (g) => g.kind === "absence" && g.importance === "must_catch");
  let mcAbsCaught = 0;
  for (const [, group] of mustAbsence) if (group.some((g) => caughtByGoldId.get(g.id))) mcAbsCaught++;

  // ── Traps ──────────────────────────────────────────────────────────────
  const hardTraps = golds.filter((g) => g.kind === "trap" && g.importance === "must_not_flag");
  const softTraps = golds.filter((g) => g.kind === "trap" && g.importance === "should_not_flag");
  const trapHits: { goldId: string; clauseIds: string[] }[] = [];
  const countTrapSurfaced = (traps: GoldFinding[]) => {
    let n = 0;
    for (const t of traps) {
      const matched = findings.filter((f) => findingMatchesGold(t, f));
      if (matched.length > 0) { n++; trapHits.push({ goldId: t.id, clauseIds: matched.map((m) => m.clauseId) }); }
    }
    return n;
  };
  const hardSurfaced = countTrapSurfaced(hardTraps);
  const softSurfaced = countTrapSurfaced(softTraps);

  // ── Precision (lower bound) ──────────────────────────────────────────────
  // A v1 finding "counts" if it satisfies at least one NON-trap gold.
  const nonTrapGolds = golds.filter((g) => g.kind !== "trap");
  const matchedFindingIds = new Set<string>();
  for (const f of findings) if (nonTrapGolds.some((g) => findingMatchesGold(g, f))) matchedFindingIds.add(f.clauseId);
  const unmatched = findings.filter((f) => {
    return !golds.some((g) => findingMatchesGold(g, f));
  }).map((f) => f.clauseId);

  // ── Severity accuracy (over caught issue/severity_check golds with a band) ──
  let sevExact = 0, sevWithin = 0, sevDen = 0;
  for (const d of details) {
    if (d.expectedSeverityBand === "NONE") continue;
    if (d.kind === "absence") continue; // v1 never catches these
    if (!d.caught) continue;
    sevDen++;
    // Use the first matched finding's band as the assigned severity.
    const assigned = d.matchedRiskLevels[0];
    if (assigned === d.expectedSeverityBand) { sevExact++; sevWithin++; }
    else if (Math.abs(BAND_INDEX[assigned] - BAND_INDEX[d.expectedSeverityBand]) <= 1) sevWithin++;
  }

  // ── Dedup correctness ────────────────────────────────────────────────────
  const dupGroups = new Map<string, GoldFinding[]>();
  for (const g of golds) if (g.dupGroup) {
    if (!dupGroups.has(g.dupGroup)) dupGroups.set(g.dupGroup, []);
    dupGroups.get(g.dupGroup)!.push(g);
  }
  let dedupOk = 0;
  const dedupDetail: DocScore["dedupDetail"] = [];
  for (const [grp, gs] of dupGroups) {
    const clauseIds = new Set<string>();
    for (const g of gs) for (const f of findings) if (findingMatchesGold(g, f)) clauseIds.add(f.clauseId);
    const collapsed = clauseIds.size === 1;
    if (collapsed) dedupOk++;
    dedupDetail.push({ dupGroup: grp, distinctV1Findings: clauseIds.size, collapsedCorrectly: collapsed, clauseIds: [...clauseIds] });
  }

  // ── Merge groups (related golds on one clause; one merged finding may satisfy all) ──
  const mergeGroups = new Map<string, GoldFinding[]>();
  for (const g of golds) if (g.mergeGroup) {
    if (!mergeGroups.has(g.mergeGroup)) mergeGroups.set(g.mergeGroup, []);
    mergeGroups.get(g.mergeGroup)!.push(g);
  }
  const mergeGroupDetail: DocScore["mergeGroupDetail"] = [];
  for (const [grp, members] of mergeGroups) {
    const caughtMembers = members.filter((g) => caughtByGoldId.get(g.id));
    const covering = new Set<string>();
    for (const g of members) for (const f of findings) if (findingMatchesGold(g, f)) covering.add(f.clauseId);
    // A single finding that matches EVERY member is the ideal correctly-merged finding.
    const single = findings.find((f) => members.every((g) => findingMatchesGold(g, f)));
    mergeGroupDetail.push({
      mergeGroup: grp,
      memberGoldIds: members.map((g) => g.id),
      caughtMemberGoldIds: caughtMembers.map((g) => g.id),
      allMembersCaught: caughtMembers.length === members.length,
      distinctFindingsCovering: covering.size,
      satisfiedBySingleFinding: !!single,
      coveringClauseIds: [...covering],
    });
  }

  return {
    docFixtureId,
    totalV1Findings: findings.length,
    goldMatchDetails: details,
    mergeGroupDetail,
    recallMustCatchIssues: ratio(mcIssueCaught, mustIssue.size),
    recallMustCatchAbsence: ratio(mcAbsCaught, mustAbsence.size),
    primaryPrecision: ratio(matchedFindingIds.size, findings.length),
    fpTrapRateHard: ratio(hardSurfaced, hardTraps.length),
    fpTrapRateSoft: ratio(softSurfaced, softTraps.length),
    severityExactBand: ratio(sevExact, sevDen),
    severityWithinOneBand: ratio(sevWithin, sevDen),
    dedupCorrect: ratio(dedupOk, dupGroups.size),
    unmatchedV1ClauseIds: unmatched,
    trapHits,
    dedupDetail,
  };
}
