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
 *   Tier 4 — Normalised heading   (confidence 0.88, type "exact")
 *
 * If none of these tiers fire for a given A clause, it is placed in the
 * residual set and forwarded to the LLM semantic matcher.
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

// ─── Synonym groups ───────────────────────────────────────────────────────────

/**
 * Tier 5: well-known legal clause synonym groups.
 * Each group is a set of normalised keyword tokens. A clause heading matches
 * a group when its normalised text contains ALL tokens in the group (any entry).
 * Two clauses match when they resolve to the SAME group index.
 *
 * This catches common renames like "Limitation of Liability" → "Liability Cap",
 * "Term and Termination" → "Duration and Expiry", etc. — without an LLM call.
 */
const SYNONYM_GROUPS: string[][] = [
  // Limitation of liability
  ["limitation", "liability"],
  ["liability", "cap"],
  ["aggregate", "liability"],
  ["maximum", "liability"],
  // Indemnification
  ["indemnif"],
  ["hold", "harmless"],
  // Confidentiality / NDA
  ["confidential"],
  ["non-disclosure"],
  ["nda"],
  // Intellectual property
  ["intellectual", "property"],
  ["ip", "ownership"],
  ["proprietary", "rights"],
  // Term & termination
  ["term", "termination"],
  ["duration", "expir"],
  // Payment / fees
  ["payment", "terms"],
  ["fees", "compensation"],
  // Governing law / jurisdiction
  ["governing", "law"],
  ["choice", "law"],
  ["jurisdiction"],
  ["dispute", "resolution"],
  // Data protection / privacy
  ["data", "protection"],
  ["data", "processing"],
  ["privacy"],
  // Force majeure
  ["force", "majeure"],
  // Warranties / representations
  ["warranties"],
  ["representations"],
  // Assignment
  ["assignment"],
  // Entire agreement / merger
  ["entire", "agreement"],
  // Notices
  ["notices"],
  // Amendments
  ["amendments"],
  // Definitions
  ["definitions"],
  ["defined", "terms"],
];

/**
 * Return the synonym group index (0-based) that the heading belongs to,
 * or -1 if it doesn't match any group.
 */
function synonymGroupIndex(heading: string): number {
  const norm = normalise(heading);
  for (let i = 0; i < SYNONYM_GROUPS.length; i++) {
    const tokens = SYNONYM_GROUPS[i];
    if (tokens.every((token) => norm.includes(token))) {
      return i;
    }
  }
  return -1;
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface DeterministicMatchResult {
  /** Pairs matched with high confidence — skip LLM for these */
  matched: AlignedPair[];
  /** Clauses from A with no deterministic match — send to LLM */
  residualA: ExtractedClause[];
  /** Clauses from B not yet claimed by a deterministic match — send to LLM */
  residualB: ExtractedClause[];
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
  };
}

// ─── Main matcher ─────────────────────────────────────────────────────────────

/**
 * Attempt deterministic matching for all clauses in A against all clauses in B.
 *
 * Each clause in B can only be claimed once (greedy left-to-right).
 */
export function runDeterministicMatching(
  clausesA: ExtractedClause[],
  clausesB: ExtractedClause[]
): DeterministicMatchResult {
  // Reset counter for a clean run
  pairCounter = 0;

  const matched: AlignedPair[] = [];
  const residualA: ExtractedClause[] = [];

  // Track which B clause IDs have already been claimed
  const claimedBIds = new Set<string>();

  // Pre-build lookup maps for B clauses
  const bByExactText = new Map<string, ExtractedClause>();
  const bByExactTitle = new Map<string, ExtractedClause>();
  const bByNumericLabel = new Map<string, ExtractedClause>();
  const bByNormTitle = new Map<string, ExtractedClause>();
  const bBySynonymGroup = new Map<number, ExtractedClause>();

  for (const b of clausesB) {
    // Tier 1: exact text (first occurrence wins when duplicates exist)
    if (!bByExactText.has(b.text)) bByExactText.set(b.text, b);

    // Tier 2: exact title
    if (!bByExactTitle.has(b.title)) bByExactTitle.set(b.title, b);

    // Tier 3: numeric label
    const label = extractNumericLabel(b.title);
    if (label && !bByNumericLabel.has(label)) bByNumericLabel.set(label, b);

    // Tier 4: normalised title
    const norm = normalise(b.title);
    if (norm && !bByNormTitle.has(norm)) bByNormTitle.set(norm, b);

    // Tier 5: synonym group
    const groupIdx = synonymGroupIndex(b.title);
    if (groupIdx >= 0 && !bBySynonymGroup.has(groupIdx))
      bBySynonymGroup.set(groupIdx, b);
  }

  for (const a of clausesA) {
    let pair: AlignedPair | null = null;

    // ── Tier 1: Exact text ───────────────────────────────────────────────
    const byText = bByExactText.get(a.text);
    if (byText && !claimedBIds.has(byText.id)) {
      pair = makePair(
        a.id,
        byText.id,
        1.0,
        "exact",
        `Clause text is character-for-character identical.`
      );
    }

    // ── Tier 2: Exact heading title ──────────────────────────────────────
    if (!pair) {
      const byTitle = bByExactTitle.get(a.title);
      if (byTitle && !claimedBIds.has(byTitle.id)) {
        pair = makePair(
          a.id,
          byTitle.id,
          0.97,
          "exact",
          `Heading title is identical: "${a.title}".`
        );
      }
    }

    // ── Tier 3: Numeric section label ────────────────────────────────────
    if (!pair) {
      const aLabel = extractNumericLabel(a.title);
      if (aLabel) {
        const byLabel = bByNumericLabel.get(aLabel);
        if (byLabel && !claimedBIds.has(byLabel.id)) {
          pair = makePair(
            a.id,
            byLabel.id,
            0.93,
            "exact",
            `Both clauses share section number "${aLabel}".`
          );
        }
      }
    }

    // ── Tier 4: Normalised heading ───────────────────────────────────────
    if (!pair) {
      const aNorm = normalise(a.title);
      if (aNorm) {
        const byNorm = bByNormTitle.get(aNorm);
        if (byNorm && !claimedBIds.has(byNorm.id)) {
          pair = makePair(
            a.id,
            byNorm.id,
            0.88,
            "exact",
            `Heading titles are identical after normalisation: "${aNorm}".`
          );
        }
      }
    }

    // ── Tier 5: Synonym group ─────────────────────────────────────────────
    if (!pair) {
      const aGroupIdx = synonymGroupIndex(a.title);
      if (aGroupIdx >= 0) {
        const bySynonym = bBySynonymGroup.get(aGroupIdx);
        if (bySynonym && !claimedBIds.has(bySynonym.id)) {
          pair = makePair(
            a.id,
            bySynonym.id,
            0.85,
            "semantic",
            `Heading "${a.title}" and "${bySynonym.title}" are recognised synonyms for the same legal concept.`
          );
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

  // Residual B = clauses not claimed by any deterministic match
  const residualB = clausesB.filter((b) => !claimedBIds.has(b.id));

  return { matched, residualA, residualB };
}
