/**
 * deterministic-matcher.ts
 *
 * Fast, zero-cost pre-matching pass that runs before the LLM is involved.
 *
 * Returns a set of high-confidence AlignedPairs that do not need semantic
 * reasoning, and a residual set of unmatched clauses that the LLM must handle.
 *
 * Match tiers (tried in order, first hit wins):
 *
 *   Tier 1 — Exact text match     (confidence 1.0, type "exact")
 *   Tier 2 — Exact heading match  (confidence 0.97, type "exact")
 *   Tier 3 — Numeric label match  (confidence 0.93, type "exact")
 *   Tier 3b— Composite structural key  (confidence 0.90, type "exact")
 *             e.g. sectionPath ["1","(a)"] → key "1.(a)"
 *             Only fires when BOTH sides have a 2-element sectionPath whose
 *             second element is a lettered/roman sub-clause label.
 *   Tier 4 — Normalised heading   (confidence 0.88, type "exact")
 *   Tier 5 — Synonym group        (confidence 0.85, type "semantic")
 *
 * After all hash-map tiers, a sequence-aware LCS pass runs over the remaining
 * residual clauses from both sides.  This prevents one insertion or deletion
 * from cascading into a wave of false MODIFIED findings: the LCS identifies
 * the longest subsequence of clauses that appear in the same order in both
 * documents, pairs them, and leaves only true orphans for the LLM.
 */

import type { ExtractedClause, AlignedPair, AlignmentType, AlignmentStatus } from "../models/compare-state.js";

// ─── Normalisation helpers ────────────────────────────────────────────────────

/** Lowercase, collapse whitespace, strip punctuation. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract a numeric section label from a heading, e.g. "3.2. Payment Terms" → "3.2" */
function extractNumericLabel(heading: string): string | null {
  const m = heading.match(/^(\d+(?:\.\d+)*)[.)]/);
  return m ? m[1] : null;
}

/**
 * Jaccard similarity on normalised word-token sets of two clause headings.
 *
 * Used as a content-plausibility guard for Tier 3 (numeric label) and LCS
 * spine matching.  A shared section number is necessary but never sufficient
 * to establish clause correspondence; this check ensures both sides have
 * meaningfully overlapping title text before the match is accepted.
 *
 * Tokens shorter than 2 characters are excluded so punctuation residue
 * ("s", "a", "1") produced by normalise() does not inflate the score.
 *
 * Threshold in use: ≥ 0.25
 *   - Identical or near-identical titles score ≥ 0.50 in practice.
 *   - A leading article drop ("The Supplier" → "Supplier") leaves
 *     all content words intact, so score stays well above 0.25.
 *   - A fragment heading ("themselves, in writing…") vs a correct title
 *     ("The Supplier shall ensure its Employees…") shares zero tokens → 0.00.
 */
export const TITLE_JACCARD_THRESHOLD = 0.25;

function titleJaccard(headingA: string, headingB: string): number {
  const tokens = (h: string): Set<string> =>
    new Set(normalise(h).split(" ").filter((w) => w.length > 1));
  const a = tokens(headingA);
  const b = tokens(headingB);
  if (a.size === 0 && b.size === 0) return 1; // both empty — treat as identical
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

// ─── Composite structural key ─────────────────────────────────────────────────

/**
 * Build a composite key from a clause's sectionPath for Tier 3b matching.
 *
 * A composite key is emitted ONLY when:
 *   - sectionPath has exactly 2 elements (parent + sub-clause label).
 *   - The second element looks like a lettered or Roman-numeral sub-clause,
 *     i.e. matches /^\([a-z]{1,4}\)$/i  (covers (a)–(z), (i)–(xiv), etc.)
 *   - The first element is non-empty (some actual parent context exists).
 *
 * This deliberately excludes:
 *   - Bare single-element paths like ["(a)"] — no parent, not safe to match.
 *   - Deeply-nested 3-element paths — deferred to a later step.
 *   - Numeric paths like ["1","1.2"] — already handled by Tier 3.
 *
 * Examples:
 *   ["1", "(a)"]      → "1.(a)"
 *   ["1.2", "(b)"]    → "1.2.(b)"
 *   ["2", "(iii)"]    → "2.(iii)"
 *   ["(a)"]           → null  (no parent — unsafe)
 *   ["1", "1.2"]      → null  (Tier 3 handles this)
 */
function compositeKey(sectionPath: string[]): string | null {
  if (sectionPath.length !== 2) return null;
  const [parent, sub] = sectionPath;
  if (!parent) return null;
  if (!/^\([a-z]{1,4}\)$/.test(sub)) return null;
  return `${parent}.${sub.toLowerCase()}`;
}

// ─── Synonym groups ───────────────────────────────────────────────────────────

const SYNONYM_GROUPS: string[][] = [
  ["limitation", "liability"],
  ["liability", "cap"],
  ["aggregate", "liability"],
  ["maximum", "liability"],
  ["indemnif"],
  ["hold", "harmless"],
  ["confidential"],
  ["non-disclosure"],
  ["nda"],
  ["intellectual", "property"],
  ["ip", "ownership"],
  ["proprietary", "rights"],
  ["term", "termination"],
  ["duration", "expir"],
  ["payment", "terms"],
  ["fees", "compensation"],
  ["governing", "law"],
  ["choice", "law"],
  ["jurisdiction"],
  ["dispute", "resolution"],
  ["data", "protection"],
  ["data", "processing"],
  ["privacy"],
  ["force", "majeure"],
  ["warranties"],
  ["representations"],
  ["assignment"],
  ["entire", "agreement"],
  ["notices"],
  ["amendments"],
  ["definitions"],
  ["defined", "terms"],
];

function synonymGroupIndex(heading: string): number {
  const norm = normalise(heading);
  for (let i = 0; i < SYNONYM_GROUPS.length; i++) {
    const tokens = SYNONYM_GROUPS[i];
    if (tokens.every((token) => norm.includes(token))) return i;
  }
  return -1;
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface DeterministicMatchResult {
  matched: AlignedPair[];
  residualA: ExtractedClause[];
  residualB: ExtractedClause[];
  /** The pair counter value at the end of this run, for hand-off to the LLM pass. */
  nextPairSeq: number;
}

// ─── Pair factory ─────────────────────────────────────────────────────────────

let pairCounter = 0;

function makePair(
  clauseAId: string,
  clauseBId: string,
  confidence: number,
  type: AlignmentType,
  reason: string
): AlignedPair {
  pairCounter += 1;
  return {
    id: `pair-${pairCounter}`,
    clauseAId,
    clauseBId,
    matchConfidence: confidence,
    alignmentType: type,
    alignmentReason: reason,
    status: "matched" as AlignmentStatus,
    relationshipType: "MATCH",
    alignmentMethod: "structural",
    alignmentReasons: [reason],
  };
}

// ─── LCS sequence-aware fallback ─────────────────────────────────────────────

/**
 * Produce a normalised "match key" for a clause used by the LCS comparison.
 *
 * Priority order:
 *   1. Composite structural key (if available) — most reliable.
 *   2. Numeric label from title — e.g. "1.2" from "1.2. Payment Terms".
 *   3. Normalised title string — lowercase + stripped punctuation.
 *
 * Using the composite key first means the LCS sequence correctly treats
 * "1.(a)" in both documents as the same node even if their body text differs.
 */
function lcsKey(clause: ExtractedClause): string {
  const ck = compositeKey(clause.sectionPath);
  if (ck) return ck;

  const nl = extractNumericLabel(clause.title);
  if (nl) return nl;

  return normalise(clause.title).slice(0, 80);
}

/**
 * Standard O(n·m) LCS on an array of keys.
 * Returns the indices (in A and B respectively) that form the longest common
 * subsequence, i.e. the "spine" of clauses present in both documents in order.
 *
 * For typical DPA clause counts (10–80 residual), n·m ≤ 6400 — negligible.
 */
function computeLCS(
  keysA: string[],
  keysB: string[]
): Array<{ ai: number; bi: number }> {
  const n = keysA.length;
  const m = keysB.length;

  // dp[i][j] = length of LCS for keysA[0..i-1] and keysB[0..j-1]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (keysA[i - 1] === keysB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find the actual matched index pairs
  const pairs: Array<{ ai: number; bi: number }> = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (keysA[i - 1] === keysB[j - 1]) {
      pairs.push({ ai: i - 1, bi: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return pairs.reverse(); // restore document order
}

/**
 * Sequence-aware matching on residual clauses using LCS.
 *
 * The LCS spine identifies clause pairs that appear in the same relative order
 * in both documents.  Each spine candidate is then validated with a content
 * plausibility check (titleJaccard ≥ TITLE_JACCARD_THRESHOLD).
 *
 * Accepted candidates  → AlignedPair at confidence 0.82, both sides claimed.
 * Rejected candidates  → neither side is claimed; both remain in residualA /
 *                        remainingB so the LLM semantic pass can decide.
 *
 * This means a shared numeric section label alone (the LCS key) is still only
 * a *candidate* signal — not sufficient proof of correspondence.
 */
function runLCSMatching(
  residualA: ExtractedClause[],
  residualB: ExtractedClause[],
  claimedBIds: Set<string>
): { matched: AlignedPair[]; removedA: ExtractedClause[]; remainingB: ExtractedClause[] } {
  if (residualA.length === 0 || residualB.length === 0) {
    return { matched: [], removedA: residualA, remainingB: residualB };
  }

  const keysA = residualA.map(lcsKey);
  const keysB = residualB.map(lcsKey);

  const spine = computeLCS(keysA, keysB);

  // Track only the indices of ACCEPTED pairs so that rejected candidates are
  // not excluded from removedA / remainingB.
  const acceptedAIndices = new Set<number>();
  const acceptedBIndices = new Set<number>();

  const matched: AlignedPair[] = [];
  for (const { ai, bi } of spine) {
    const a = residualA[ai];
    const b = residualB[bi];
    if (claimedBIds.has(b.id)) continue; // already claimed by a hash-map tier

    // Content plausibility: require minimum title-token overlap.
    // A shared section number (the LCS key) is a candidate signal, not proof.
    // Pairs that fail remain in residualA / remainingB for the LLM to resolve.
    if (titleJaccard(a.title, b.title) < TITLE_JACCARD_THRESHOLD) continue;

    pairCounter += 1;
    const lcsReason = `Sequence-aware match: clause "${lcsKey(a)}" appears in the same relative order in both documents.`;
    matched.push({
      id: `pair-${pairCounter}`,
      clauseAId: a.id,
      clauseBId: b.id,
      matchConfidence: 0.82,
      alignmentType: "exact",
      alignmentReason: lcsReason,
      status: "matched",
      relationshipType: "MATCH",
      alignmentMethod: "structural",
      alignmentReasons: [lcsReason, "order-consistent"],
    });
    claimedBIds.add(b.id);
    acceptedAIndices.add(ai);
    acceptedBIndices.add(bi);
  }

  // Clauses whose spine candidate was rejected (or absent from the spine) are
  // passed to the LLM as true residuals.
  const removedA  = residualA.filter((_, i) => !acceptedAIndices.has(i));
  const remainingB = residualB.filter((_, i) => !acceptedBIndices.has(i));

  return { matched, removedA, remainingB };
}

// ─── Main matcher ─────────────────────────────────────────────────────────────

/**
 * Attempt deterministic matching for all clauses in A against all clauses in B.
 *
 * Each clause in B can only be claimed once (greedy left-to-right for
 * hash-map tiers; LCS-optimal for the sequence-aware pass).
 *
 * @param startSeq  The pair sequence number to start from (default 0).
 *                  Pass the value returned by a previous call's nextPairSeq
 *                  to ensure globally unique pair IDs across deterministic
 *                  and LLM alignment phases.
 */
export function runDeterministicMatching(
  clausesA: ExtractedClause[],
  clausesB: ExtractedClause[],
  startSeq = 0
): DeterministicMatchResult {
  pairCounter = startSeq;

  const matched: AlignedPair[] = [];
  const residualA: ExtractedClause[] = [];
  const claimedBIds = new Set<string>();

  // ── Pre-build lookup maps for B clauses ──────────────────────────────────
  const bByExactText        = new Map<string, ExtractedClause>();
  const bByExactTitle       = new Map<string, ExtractedClause>();
  const bByNumericLabel     = new Map<string, ExtractedClause>();
  const bByCompositeKey     = new Map<string, ExtractedClause>(); // Tier 3b
  const bByNormTitle        = new Map<string, ExtractedClause>();
  const bBySynonymGroup     = new Map<number, ExtractedClause>();

  for (const b of clausesB) {
    if (!bByExactText.has(b.text))   bByExactText.set(b.text, b);
    if (!bByExactTitle.has(b.title)) bByExactTitle.set(b.title, b);

    const label = extractNumericLabel(b.title);
    if (label && !bByNumericLabel.has(label)) bByNumericLabel.set(label, b);

    // Tier 3b: composite structural key
    const ck = compositeKey(b.sectionPath);
    if (ck && !bByCompositeKey.has(ck)) bByCompositeKey.set(ck, b);

    const norm = normalise(b.title);
    if (norm && !bByNormTitle.has(norm)) bByNormTitle.set(norm, b);

    const groupIdx = synonymGroupIndex(b.title);
    if (groupIdx >= 0 && !bBySynonymGroup.has(groupIdx)) bBySynonymGroup.set(groupIdx, b);
  }

  // ── Per-A-clause hash-map tiers ──────────────────────────────────────────
  for (const a of clausesA) {
    let pair: AlignedPair | null = null;

    // Tier 1: Exact text
    const byText = bByExactText.get(a.text);
    if (byText && !claimedBIds.has(byText.id)) {
      pair = makePair(a.id, byText.id, 1.0, "exact",
        "Clause text is character-for-character identical.");
    }

    // Tier 2: Exact heading title
    if (!pair) {
      const byTitle = bByExactTitle.get(a.title);
      if (byTitle && !claimedBIds.has(byTitle.id)) {
        pair = makePair(a.id, byTitle.id, 0.97, "exact",
          `Heading title is identical: "${a.title}".`);
      }
    }

    // Tier 3: Numeric section label
    if (!pair) {
      const aLabel = extractNumericLabel(a.title);
      if (aLabel) {
        const byLabel = bByNumericLabel.get(aLabel);
        if (byLabel && !claimedBIds.has(byLabel.id)) {
          // Guard: shared section number is necessary but not sufficient.
          // Require minimum title-token overlap so a fragment heading produced
          // by extraction corruption cannot match the correct clause on label alone.
          if (titleJaccard(a.title, byLabel.title) >= TITLE_JACCARD_THRESHOLD) {
            pair = makePair(a.id, byLabel.id, 0.93, "exact",
              `Both clauses share section number "${aLabel}".`);
          }
        }
      }
    }

    // Tier 3b: Composite structural key (parent + sub-clause letter)
    if (!pair) {
      const ack = compositeKey(a.sectionPath);
      if (ack) {
        const byCK = bByCompositeKey.get(ack);
        if (byCK && !claimedBIds.has(byCK.id)) {
          // Guard: a shared structural position ("3.(a)" in both documents) is
          // still only a positional coincidence, not proof of correspondence —
          // the same guard Tier 3 already applies to numeric labels. Without
          // this, a reorganized document where "(a)" was reused for an
          // unrelated sub-clause would be matched on position alone.
          if (titleJaccard(a.title, byCK.title) >= TITLE_JACCARD_THRESHOLD) {
            pair = makePair(a.id, byCK.id, 0.90, "exact",
              `Both clauses share structural key "${ack}" (parent section + sub-clause label).`);
          }
        }
      }
    }

    // Tier 4: Normalised heading
    if (!pair) {
      const aNorm = normalise(a.title);
      if (aNorm) {
        const byNorm = bByNormTitle.get(aNorm);
        if (byNorm && !claimedBIds.has(byNorm.id)) {
          pair = makePair(a.id, byNorm.id, 0.88, "exact",
            `Heading titles are identical after normalisation: "${aNorm}".`);
        }
      }
    }

    // Tier 5: Synonym group
    if (!pair) {
      const aGroupIdx = synonymGroupIndex(a.title);
      if (aGroupIdx >= 0) {
        const bySynonym = bBySynonymGroup.get(aGroupIdx);
        if (bySynonym && !claimedBIds.has(bySynonym.id)) {
          // Shared synonym group is not enough — titles must still overlap
          // so "data protection" cannot pair an SCC fragment with a DSR portal.
          if (titleJaccard(a.title, bySynonym.title) >= TITLE_JACCARD_THRESHOLD) {
            pair = makePair(a.id, bySynonym.id, 0.85, "semantic",
              `Heading "${a.title}" and "${bySynonym.title}" are recognised synonyms for the same legal concept.`);
          }
        }
      }
    }

    if (pair) {
      claimedBIds.add(pair.clauseBId!);
      matched.push(pair);
    } else {
      residualA.push(a);
    }
  }

  // Residual B after hash-map tiers
  const residualBAfterHashMap = clausesB.filter((b) => !claimedBIds.has(b.id));

  // ── Sequence-aware LCS pass on residual ──────────────────────────────────
  const { matched: lcsMatched, removedA, remainingB } =
    runLCSMatching(residualA, residualBAfterHashMap, claimedBIds);

  matched.push(...lcsMatched);

  // Non-spine A clauses (removedA) are returned as residualA so they continue
  // to runSemanticMatching together with residualB. We do NOT eagerly emit
  // REMOVED pairs here — only the LLM (or its fallback) has enough semantic
  // context to confirm a clause was truly deleted vs edited. Emitting REMOVED
  // pre-LLM risks false deletion findings for clauses that were merely
  // rephrased or whose LCS key did not match cleanly.
  //
  // The LCS spine matches (lcsMatched) are kept — those pairs are reliable
  // and prevent cascade without making deletion judgements.

  console.log(
    `[deterministicMatcher] ` +
    `tier1-exact=${matched.filter(p => p.matchConfidence === 1.0 && p.status === "matched").length} ` +
    `tier2-title=${matched.filter(p => p.matchConfidence === 0.97).length} ` +
    `tier3-numeric=${matched.filter(p => p.matchConfidence === 0.93).length} ` +
    `tier3b-composite=${matched.filter(p => p.matchConfidence === 0.90 && p.status === "matched").length} ` +
    `tier4-norm=${matched.filter(p => p.matchConfidence === 0.88).length} ` +
    `tier5-synonym=${matched.filter(p => p.matchConfidence === 0.85).length} ` +
    `lcs-sequence=${lcsMatched.length} ` +
    `llm-residualA=${removedA.length} ` +
    `llm-residualB=${remainingB.length}`
  );

  return { matched, residualA: removedA, residualB: remainingB, nextPairSeq: pairCounter };
}
