/**
 * diff-detect.ts — Step 4 of the Compare pipeline
 *
 * Responsibility: classify the semantic difference for every aligned clause
 * pair and populate CompareState.differences.
 *
 * Strategy (deterministic-first, same philosophy as Phase 2):
 *
 *   Tier 1 — Identical text
 *     → UNCHANGED, confidence 1.0, no LLM call.
 *
 *   Tier 2 — High character similarity (≥ SIM_THRESHOLD)
 *     → NEUTRAL_REPHRASE, confidence proportional to similarity, no LLM call.
 *
 *   Tier 3 — ADDED / REMOVED pairs (null on one side)
 *     → Classified directly from alignment status, no LLM call.
 *
 *   Tier 4 — Genuine semantic diff required
 *     → LLM call (Gemini Flash, COMPARE_DIFF task).
 *     → Uses the difference-analysis AI Skill + difference-prompt.
 *     → Batched at LLM_BATCH_SIZE pairs per call.
 *     → Validated with Zod; fallback on failure.
 */

import {
  CompareState,
  AlignedPair,
  ExtractedClause,
  ClauseDifference,
  DiffClassification,
} from "../models/compare-state.js";
import {
  isConfirmedAdded,
  isConfirmedRemoved,
} from "../utils/alignment-contract.js";
import {
  extractNumericLabel,
  instrumentKey,
  isChangelogTitle,
  moduleKeysById,
} from "../utils/structural-scorer.js";
import { getSkill } from "../utils/knowledge-loader.js";
import {
  systemInstruction,
  buildDifferencePrompt,
  resolveClauseTexts,
  ResolvedPair,
} from "../prompts/difference-prompt.js";
import {
  DifferenceResponseSchema,
  DIFFERENCE_JSON_SCHEMA,
  DifferenceEntry,
} from "../schemas/difference-schema.js";
import { executeJsonCompletionWithMeta } from "../../drafting/llm/index.js";
import { LLMTask, LLMProvider } from "../../drafting/config/model-specs.js";
import { pipelineMetrics } from "../utils/pipeline-metrics.js";
import { diffSentences } from "diff";
import {
  applyGranularChanges,
  dedupeChangesAcrossPairs,
  emptyAtomicChanges,
} from "../utils/granular-diff.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Character-level Jaccard similarity threshold above which a pair is
 * classified NEUTRAL_REPHRASE without calling the LLM.
 * Set at 0.95: 5% of characters must differ for us to bother the model.
 */
const SIM_THRESHOLD = 0.95;

/** Max pairs sent to the LLM in one batch */
const LLM_BATCH_SIZE = 20;

/**
 * Minimum character count for a clause side to be considered "substantive".
 * Sides shorter than this are structural mismatches (e.g. empty vs full),
 * handled by the length-asymmetry guard before similarity is checked.
 */
const MIN_SUBSTANTIVE = 10;

// ─── Whitespace normalisation ──────────────────────────────────────────────────

/**
 * Collapse all whitespace runs (spaces, tabs, newlines) to a single space and
 * trim. Used ONLY to decide whether two clause texts carry a real content
 * difference vs. an extraction/reflow/pagination artifact (trailing newline,
 * different line-wrap join, double space at a page-break stitch point).
 *
 * Never used for the text actually rendered or quoted back to the user —
 * only for the isolation/substantive-change DECISION, so PDF extraction
 * formatting differences can never by themselves produce a material finding.
 */
function normalizeForComparison(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// ─── Similarity ───────────────────────────────────────────────────────────────

/**
 * Bigram-based character similarity (Dice coefficient).
 * Fast, language-agnostic, works well for legal text.
 *
 * Returns a score in [0, 1] where 1 = identical.
 */
function charSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const getBigrams = (s: string): Map<string, number> => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      map.set(bg, (map.get(bg) ?? 0) + 1);
    }
    return map;
  };

  const bigramsA = getBigrams(a);
  const bigramsB = getBigrams(b);

  let intersection = 0;
  for (const [bg, countA] of bigramsA) {
    const countB = bigramsB.get(bg) ?? 0;
    intersection += Math.min(countA, countB);
  }

  const totalA = a.length - 1;
  const totalB = b.length - 1;
  return (2 * intersection) / (totalA + totalB);
}

// ─── Isolated insertion / deletion detector ───────────────────────────────────

/**
 * Minimum character length for a sentence-level diff chunk to be considered a
 * standalone insertion or deletion rather than a minor rephrase artifact.
 *
 * 30 chars is roughly half a short sentence.  Changes smaller than this
 * (single words, punctuation, article drops) stay as NEUTRAL_REPHRASE.
 * The cat sentence ("there is a cat in the street...") is ~65 chars — well above.
 */
const MIN_ISOLATED_CHARS = 30;

/**
 * Return true when a high-similarity pair (≥ SIM_THRESHOLD) contains at
 * least one "isolated" addition or deletion — i.e. a chunk that:
 *
 *   1. Is added-only or removed-only (not shared text).
 *   2. Has ≥ MIN_ISOLATED_CHARS characters (long enough to be a sentence,
 *      not just a word or punctuation change).
 *   3. Is surrounded on BOTH sides by unchanged context in the diff output
 *      (i.e. it is a mid-body insertion, not just a leading/trailing change).
 *
 * When this returns true, the pair should bypass the NEUTRAL_REPHRASE tier
 * and be forwarded to the LLM for proper MODIFIED_* classification.
 *
 * When this returns false, all differences are small enough to remain a
 * legitimate NEUTRAL_REPHRASE (word swaps, punctuation, whitespace).
 *
 * NOTE: This function catches mid-body insertions only.  Tail insertions
 * (content appended at the end of a clause) are caught by the separate
 * hasSubstantialLengthDelta() check below.
 */
function hasIsolatedInsertion(textA: string, textB: string): boolean {
  const changes = diffSentences(textA, textB);

  for (let i = 0; i < changes.length; i++) {
    const ch = changes[i];

    // Only care about added or removed chunks
    if (!ch.added && !ch.removed) continue;

    // Must be long enough to be a sentence, not a word artifact
    if (ch.value.trim().length < MIN_ISOLATED_CHARS) continue;

    // Check for unchanged context on BOTH sides:
    //   - at least one prior unchanged chunk exists (something before it)
    //   - at least one subsequent unchanged chunk exists (something after it)
    // This distinguishes "sentence inserted in the middle" from "clause starts
    // differently" (which could be a legitimate rephrase of the opening).
    const hasContextBefore = changes.slice(0, i).some(
      (c) => !c.added && !c.removed && c.value.trim().length > 0
    );
    const hasContextAfter = changes.slice(i + 1).some(
      (c) => !c.added && !c.removed && c.value.trim().length > 0
    );

    if (hasContextBefore && hasContextAfter) {
      return true; // isolated mid-body insertion or deletion
    }
  }

  return false;
}

/**
 * Return true when a high-similarity pair (≥ SIM_THRESHOLD) has a
 * substantial raw character-length difference between the two sides.
 *
 * This catches TAIL insertions and TAIL removals — cases where one side
 * has extra content appended at the end (or prepended at the start) that
 * the diffSentences-based hasIsolatedInsertion() misses because there is
 * no unchanged context AFTER the added chunk.
 *
 * Real-document example:
 *   Original clause A = 243 chars (legal preamble only)
 *   Modified clause A = 309 chars (same preamble + cat sentence = +66 chars)
 *   charSimilarity = 0.955 (≥ 0.95, would be NEUTRAL_REPHRASE)
 *   diffSentences: EQUAL "A. " | REMOVED <old body> | ADDED <new body + cat>
 *   hasIsolatedInsertion = false (no context-after)
 *   BUT the trimmed length delta is +66 ≥ MIN_ISOLATED_CHARS=30 → material.
 *
 * Safety constraints:
 *  - Uses trimmed lengths so whitespace normalisation (extra spaces, newlines)
 *    does not trigger a false positive.
 *  - Threshold is MIN_ISOLATED_CHARS (30 chars), the same floor used for the
 *    sentence-level check.  Whitespace-only changes leave a delta near zero.
 *    A genuine extra sentence is ≥ 30 chars.
 *  - Only fires when the SHORTER side is ≥ MIN_SUBSTANTIVE (10 chars) — guards
 *    against the empty-vs-nonempty edge case already handled upstream.
 *  - Does NOT fire when both sides are small (< MIN_SUBSTANTIVE each) — those
 *    pairs are trivially short and the small delta is noise.
 */
function hasSubstantialLengthDelta(textA: string, textB: string): boolean {
  const lenA = textA.trim().length;
  const lenB = textB.trim().length;
  const shorter = Math.min(lenA, lenB);
  const delta   = Math.abs(lenA - lenB);

  // Both sides must have substantive content before we interpret a delta
  if (shorter < MIN_SUBSTANTIVE) return false;

  return delta >= MIN_ISOLATED_CHARS;
}

// ─── Deterministic tier handlers ─────────────────────────────────────────────

function makeResult(
  pair: AlignedPair,
  classification: DiffClassification,
  semanticSummary: string,
  confidence: number,
  detectionMethod: ClauseDifference["detectionMethod"]
): ClauseDifference {
  return {
    pairId: pair.id,
    clauseAId: pair.clauseAId,
    clauseBId: pair.clauseBId,
    classification,
    semanticSummary,
    confidence,
    detectionMethod,
    changes: emptyAtomicChanges(),
  };
}

/**
 * Return value from tryDeterministic:
 *   - ClauseDifference  → tier fired; classification is final, no LLM needed
 *   - { forwardToLLM: true; hasIsolation: boolean } → must go to LLM;
 *     hasIsolation=true means a confirmed mid-body insertion/removal was
 *     detected and the post-LLM safety guard must fire for this pair.
 */
export type DeterministicResult =
  | ClauseDifference
  | { forwardToLLM: true; hasIsolation: boolean };

function isInstrumentHeading(clause: ExtractedClause): boolean {
  return (
    instrumentKey(clause.title) !== null ||
    instrumentKey(clause.sectionPath[0] ?? "") !== null
  );
}

function isDescendantOfHeading(child: ExtractedClause, heading: ExtractedClause): boolean {
  if (child.id === heading.id) return false;
  const hp = heading.sectionPath;
  const cp = child.sectionPath;
  if (hp.length > 0 && cp.length > hp.length && hp.every((p, i) => cp[i] === p)) {
    return true;
  }
  const hLabel =
    extractNumericLabel(heading.title) ?? extractNumericLabel(hp.at(-1) ?? "");
  const cLabel =
    extractNumericLabel(child.title) ?? extractNumericLabel(cp.at(-1) ?? "");
  return Boolean(hLabel && cLabel && cLabel !== hLabel && cLabel.startsWith(`${hLabel}.`));
}

/**
 * Original clause IDs whose confirmed REMOVED alignment should not become a
 * material difference — they are children of an already-removed heading or
 * members of an absent module whose instrument heading is also REMOVED.
 */
export function collectRemovedRollupIds(
  alignment: AlignedPair[],
  allA: ExtractedClause[]
): Set<string> {
  const removedA = alignment
    .filter(isConfirmedRemoved)
    .map((p) => allA.find((c) => c.id === p.clauseAId))
    .filter((c): c is ExtractedClause => Boolean(c));
  const moduleMap = moduleKeysById(allA);
  const removedModuleHeadings = removedA.filter(isInstrumentHeading);
  const covered = new Set<string>();

  for (const child of removedA) {
    if (removedA.some((parent) => isDescendantOfHeading(child, parent))) {
      covered.add(child.id);
      continue;
    }
    if (isInstrumentHeading(child)) continue;
    const moduleKey = moduleMap.get(child.id);
    if (!moduleKey) continue;
    const moduleHeadingRemoved = removedModuleHeadings.some(
      (heading) => heading.id !== child.id && moduleMap.get(heading.id) === moduleKey
    );
    if (moduleHeadingRemoved) covered.add(child.id);
  }

  return covered;
}

const REPRESENTED_RELATIONSHIPS = new Set(["MATCH", "MOVED", "MERGED", "SPLIT"]);

export function collectRepresentedOriginals(
  alignment: AlignedPair[],
  allA: ExtractedClause[]
): ExtractedClause[] {
  const ids = new Set<string>();
  for (const p of alignment) {
    if (!p.clauseAId) continue;
    if (p.relationshipType && REPRESENTED_RELATIONSHIPS.has(p.relationshipType)) {
      ids.add(p.clauseAId);
    }
  }
  return allA.filter((c) => ids.has(c.id));
}

/** Changelog titles for diff only — alignment's helper plus reorganization headings. */
function isDiffChangelogTitle(title: string): boolean {
  return isChangelogTitle(title) || /\breorganization\b/i.test(title);
}

/**
 * Standalone VERSION stamp (Last Updated / Version:) with no operative duties.
 * Does not match clauses that merely mention a version or a date.
 */
function isStandaloneVersionMetadata(clause: ExtractedClause): boolean {
  const titleCore = clause.title.replace(/^\s*(?:\d+[.\s]*)+/, "").trim();
  if (!/^version$/i.test(titleCore)) return false;
  const blob = `${clause.title}\n${clause.text}`;
  if (!/\blast\s+updated\b|\bversion\s*:/i.test(blob)) return false;
  const body = clause.text.replace(/^\s*version\b/i, " ");
  if (/\b(shall|must|agrees\s+to|warrants)\b/i.test(body) && body.trim().length > 160) {
    return false;
  }
  return true;
}

/** Change-summary appendix row whose body is a test tally, not an operative term. */
function isChangeSummaryTallyEntry(clause: ExtractedClause): boolean {
  return /\btotal\s+changes\s*:/i.test(`${clause.title}\n${clause.text}`);
}

function isMidSentenceContinuationTitle(title: string): boolean {
  const t = title.trim();
  if (/^(and|or|if|provided that)\b/i.test(t)) return true;
  if (/^section\s+\d/i.test(t)) return true;
  if (/^annex\s+(?:[ivxlcdm]+|\d+)\s+of\b/i.test(t)) return true;
  return false;
}

function normalizeForOverlap(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function citedSectionLabel(title: string): string | null {
  const m = title.trim().match(/^section\s+(\d+(?:[\s.]+\d+)*)/i);
  if (!m) return null;
  const label = m[1].replace(/\s+/g, ".").replace(/\.+/g, ".");
  return label.length > 0 ? label : null;
}

function hasSharedSpan(frag: string, hay: string, min = 48): boolean {
  if (hay.includes(frag.slice(0, Math.min(100, frag.length)))) return true;
  for (let i = 0; i + min <= Math.min(frag.length, 240); i += 8) {
    if (hay.includes(frag.slice(i, i + min))) return true;
  }
  return false;
}

/**
 * Mid-sentence extraction fragment whose span already lives in a
 * MATCH/MOVED/MERGED Original clause. Not a generic short-clause rule.
 */
function isCoveredExtractionFragment(
  removed: ExtractedClause,
  represented: ExtractedClause[]
): boolean {
  if (represented.length === 0) return false;
  if (!isMidSentenceContinuationTitle(removed.title)) return false;
  const cited = citedSectionLabel(removed.title);
  if (cited) {
    for (const parent of represented) {
      const pLabel =
        extractNumericLabel(parent.title) ??
        extractNumericLabel((parent.sectionPath.at(-1) ?? "").replace(/\s+/g, ""));
      if (!pLabel) continue;
      if (pLabel === cited || cited.startsWith(`${pLabel}.`) || pLabel.startsWith(`${cited}.`)) {
        return true;
      }
    }
  }
  const frag = normalizeForOverlap(`${removed.title} ${removed.text}`);
  if (frag.length < 48) return false;
  for (const parent of represented) {
    const hay = normalizeForOverlap(`${parent.title} ${parent.text}`);
    if (hasSharedSpan(frag, hay)) return true;
  }
  return false;
}

/**
 * Confidence threshold below which a semantic (LLM) alignment match is
 * considered low-confidence.  Diff confidence and risk level are capped
 * for pairs below this threshold (P0-3 fix).
 */
const LOW_ALIGNMENT_CONFIDENCE_THRESHOLD = 0.75;

function isUncertainPair(pair: AlignedPair): boolean {
  if (pair.relationshipType === "UNCERTAIN") return true;
  if (pair.alignmentMethod === "fallback") return true;
  // Legacy LLM-unavailable pairs: unmatched with confidence 0.
  // "no counterpart" from a live LLM is NOT this — those now have UNCERTAIN
  // or confirmed ADDED/REMOVED relationship types.
  return (
    pair.relationshipType === undefined &&
    pair.alignmentType === "unmatched" &&
    pair.matchConfidence === 0
  );
}

/**
 * Apply deterministic tiers to a single pair.
 * Returns a ClauseDifference when the tier fires, or a forward descriptor
 * when the pair must go to the LLM (with an isolation flag when relevant).
 */
export function tryDeterministic(
  pair: AlignedPair,
  clauseMapA: Map<string, ExtractedClause>,
  clauseMapB: Map<string, ExtractedClause>,
  removedRollupIds: Set<string> = new Set(),
  representedOriginals: ExtractedClause[] = []
): DeterministicResult {
  // Uncertain correspondence is NOT a legal add/remove. Emit a non-material
  // fallback row so the pair stays traceable without inflating changes.
  if (isUncertainPair(pair)) {
    return makeResult(
      pair,
      "UNCHANGED",
      pair.alignmentReason ||
        "Correspondence could not be established — flagged for review, not counted as a confirmed change.",
      Math.min(pair.matchConfidence || 0.2, 0.4),
      "fallback"
    );
  }

  // MERGED is structural correspondence into an already-diffed MATCH/MOVED pair.
  if (pair.relationshipType === "MERGED") {
    return makeResult(
      pair,
      "UNCHANGED",
      "structural merge into already-diffed counterpart",
      0,
      "fallback"
    );
  }

  if (isConfirmedAdded(pair) || (pair.clauseAId === null && pair.relationshipType === "ADDED")) {
    const added = pair.clauseBId ? clauseMapB.get(pair.clauseBId) : undefined;
    const addedTitle = added?.title ?? "";
    if (
      isDiffChangelogTitle(addedTitle) ||
      (added && (isStandaloneVersionMetadata(added) || isChangeSummaryTallyEntry(added)))
    ) {
      return makeResult(
        pair,
        "UNCHANGED",
        "administrative changelog content",
        0,
        "fallback"
      );
    }
    return makeResult(pair, "ADDED", "", pair.matchConfidence || 1.0, "identical");
  }
  if (isConfirmedRemoved(pair) || (pair.clauseBId === null && pair.relationshipType === "REMOVED")) {
    if (pair.clauseAId && removedRollupIds.has(pair.clauseAId)) {
      return makeResult(
        pair,
        "UNCHANGED",
        "covered by parent/module removal",
        0,
        "fallback"
      );
    }
    const removed = pair.clauseAId ? clauseMapA.get(pair.clauseAId) : undefined;
    if (removed && isCoveredExtractionFragment(removed, representedOriginals)) {
      return makeResult(
        pair,
        "UNCHANGED",
        "extraction fragment already represented by a matched counterpart",
        0,
        "fallback"
      );
    }
    return makeResult(pair, "REMOVED", "", pair.matchConfidence || 1.0, "identical");
  }

  // One-sided pair without a confirmed relationship — treat as uncertain.
  if (pair.clauseAId === null || pair.clauseBId === null) {
    return makeResult(
      pair,
      "UNCHANGED",
      pair.alignmentReason ||
        "One-sided alignment without confirmed ADDED/REMOVED evidence.",
      Math.min(pair.matchConfidence || 0.2, 0.4),
      "fallback"
    );
  }

  const textA = clauseMapA.get(pair.clauseAId)?.text ?? "";
  const textB = clauseMapB.get(pair.clauseBId)?.text ?? "";

  // Tier 1: Exact text match → UNCHANGED
  if (textA === textB) {
    return makeResult(pair, "UNCHANGED", "", 1.0, "identical");
  }

  // Tier 1b: Whitespace-normalised equality → UNCHANGED.
  // Extraction/reflow/pagination differences (trailing newline, a double
  // space at a page-break stitch point, a different line-wrap join) are not
  // content changes. If the two clauses are identical once whitespace is
  // collapsed, there is nothing to classify — never let this reach the
  // isolation/length-delta guards below.
  if (normalizeForComparison(textA) === normalizeForComparison(textB)) {
    return makeResult(pair, "UNCHANGED", "", 1.0, "identical");
  }

  // Sanity guard: if one side is empty or very short while the other has
  // substantive content, the pair is a structural mismatch — send to LLM
  // rather than risking a spurious NEUTRAL_REPHRASE classification.
  // "Very short" means fewer than MIN_SUBSTANTIVE characters of actual content.
  const aShort = textA.trim().length < MIN_SUBSTANTIVE;
  const bShort = textB.trim().length < MIN_SUBSTANTIVE;
  if (aShort !== bShort) {
    // One side is near-empty, the other is not — cannot be a rephrase
    return { forwardToLLM: true, hasIsolation: false };
  }

  // Tier 2: High similarity → NEUTRAL_REPHRASE (no LLM needed)
  //
  // Tier 2b guards: even within high-similarity pairs, two distinct structural
  // signals indicate a real material change that the aggregate similarity score
  // obscures:
  //
  //   Guard A — hasIsolatedInsertion:
  //     A diff sentence is added/removed in the MIDDLE of the clause body,
  //     with unchanged context on both sides.  Example: cat sentence inserted
  //     between sentence-1 and sentence-3 of a clause.
  //
  //   Guard B — hasSubstantialLengthDelta:
  //     One side has substantially more characters than the other (Δ ≥ 30).
  //     Catches TAIL insertions/removals where the extra content is at the
  //     end (no unchanged context-after for Guard A to detect).
  //     Real-document case: clause A original=243 chars, modified=309 chars,
  //     Δ=+66 (the cat sentence).  diffSentences shows REMOVED<old body> |
  //     ADDED<new body+cat> with no context-after, so Guard A misses it.
  //     Guard B fires because 66 ≥ MIN_ISOLATED_CHARS.
  //
  // Either guard firing → forward to LLM with hasIsolation=true so the
  // post-LLM safety guard can reject any NEUTRAL_REPHRASE the LLM returns.
  const sim = charSimilarity(textA, textB);
  if (sim >= SIM_THRESHOLD) {
    // Normalise before isolation detection so a reflow/pagination artifact
    // mid-clause (not just a trailing one, already caught by Tier 1b above)
    // cannot itself register as an "isolated" addition/removal or a length
    // delta — both checks operate on real word content either way.
    const normA = normalizeForComparison(textA);
    const normB = normalizeForComparison(textB);
    const isolation =
      hasIsolatedInsertion(normA, normB) ||
      hasSubstantialLengthDelta(normA, normB);

    if (isolation) {
      // Structural evidence of a real addition or removal — send to LLM.
      // Flag this pair so the post-LLM guard can enforce the final classification.
      return { forwardToLLM: true, hasIsolation: true };
    }
    return makeResult(
      pair,
      "NEUTRAL_REPHRASE",
      `Clause wording changed slightly (${Math.round(sim * 100)}% character similarity) with no apparent change in legal meaning.`,
      sim,
      "similarity"
    );
  }

  return { forwardToLLM: true, hasIsolation: false };
}

// ─── LLM normaliser ───────────────────────────────────────────────────────────

/**
 * Normalise one LLM difference entry into a ClauseDifference.
 *
 * IMPORTANT — clause ID sourcing:
 *   The LLM prompt includes the pairId and clause text but NOT the raw clause
 *   IDs (doc-a-clause-N / doc-b-clause-N).  The model therefore returns null
 *   for clauseAId / clauseBId in virtually every response.  If we trust the
 *   LLM's null values, applyIsolationGuard cannot look up the clause text to
 *   check hasSubstantialLengthDelta, and the guard silently becomes a no-op.
 *
 *   Fix: always fill clauseAId / clauseBId from the authoritative AlignedPair
 *   (looked up via pairId).  The LLM-returned IDs are ignored — they carry no
 *   reliable information and can only be null or hallucinated.
 */
function normaliseLLMEntry(
  entry: DifferenceEntry,
  pairMap: Map<string, AlignedPair>,
  clauseMapA: Map<string, ExtractedClause>,
  clauseMapB: Map<string, ExtractedClause>
): ClauseDifference {
  const pair = pairMap.get(entry.pairId);
  const clauseAId = pair?.clauseAId ?? null;
  const clauseBId = pair?.clauseBId ?? null;
  const textA = clauseAId ? (clauseMapA.get(clauseAId)?.text ?? "") : "";
  const textB = clauseBId ? (clauseMapB.get(clauseBId)?.text ?? "") : "";
  const { changes, rollup } = applyGranularChanges(
    entry.changes,
    textA,
    textB,
    entry.confidence
  );
  return {
    pairId: entry.pairId,
    // Use the pair's authoritative IDs, not the LLM's (always-null) echo
    clauseAId,
    clauseBId,
    classification: rollup.classification,
    semanticSummary: rollup.semanticSummary,
    confidence: rollup.confidence,
    detectionMethod: "llm",
    changes,
  };
}

// ─── Post-LLM isolation safety guard ─────────────────────────────────────────

/**
 * Determine whether the substantive change in a diff sentence is an addition
 * (Modified B has more) or a removal (Original A had more).
 *
 * Uses diffSentences to check the character balance of added vs removed chunks.
 * Returns "added" when B contains a net new isolated sentence,
 * "removed" when A contained a net removed isolated sentence,
 * or "added" as a safe default when the balance is equal (shouldn't happen if
 * hasIsolatedInsertion already confirmed the pair).
 */
function detectIsolationDirection(textA: string, textB: string): "added" | "removed" {
  const changes = diffSentences(textA, textB);
  let addedChars = 0;
  let removedChars = 0;
  for (const ch of changes) {
    if (ch.added)   addedChars   += ch.value.trim().length;
    if (ch.removed) removedChars += ch.value.trim().length;
  }
  return addedChars >= removedChars ? "added" : "removed";
}

/** The actual added (or removed) text for a pair, per detectIsolationDirection. */
function extractIsolatedDeltaText(textA: string, textB: string, direction: "added" | "removed"): string {
  const changes = diffSentences(textA, textB);
  return changes
    .filter((ch) => (direction === "added" ? ch.added : ch.removed))
    .map((ch) => ch.value)
    .join(" ");
}

/**
 * Evidence that a diff chunk carries an actual substantive legal-effect
 * change — a real change to an obligation, prohibition, permission, scope,
 * deadline, threshold, liability, consent/approval requirement, termination
 * right, or entitlement.
 *
 * A bare date, number, currency symbol, or a generic legal-sounding word
 * ("written", "notice", "day(s)") is NOT sufficient on its own — those occur
 * constantly in cosmetic edits (e.g. inserting an effective date, reformatting
 * party names into bullets). Requiring an OBLIGATION_TERM (a modal/rights verb
 * that itself names a contractual effect) or a THRESHOLD_PATTERN (a number
 * bound to a concrete deadline/quantity/currency unit, not a lone digit) means
 * length or isolation structure alone can never promote NEUTRAL_REPHRASE to
 * BROADER/NARROWER (see applyIsolationGuard).
 */
const OBLIGATION_TERM =
  /\b(shall(?:\s+not)?|must(?:\s+not)?|may\s+not|is\s+(?:not\s+)?required\s+to|are\s+(?:not\s+)?required\s+to|is\s+entitled\s+to|are\s+entitled\s+to|has\s+the\s+right\s+to|have\s+the\s+right\s+to|prohibited\s+from|obligat(?:ion|ed|es)|liab(?:le|ility)|indemnif\w*|terminat(?:e|ion|ing)\s+(?:this|the|immediately|for|upon|right)|consent\s+(?:of|from|is\s+required)|prior\s+written\s+consent|written\s+authoriz\w*|approval\s+(?:of|from|is\s+required)|breach\w*|penalt\w*|damages|warrant(?:s|y|ies)|represents?\s+and\s+warrants?|waive[sd]?|suspend(?:s|ed|ing)?|revoke[sd]?|entitled\s+to)\b/i;

const THRESHOLD_PATTERN =
  /\b\d+(?:\.\d+)?\s*(?:day|days|month|months|year|years|hour|hours|%|percent)\b|\b(?:within|at\s+least|no\s+more\s+than|no\s+later\s+than|not\s+less\s+than|in\s+excess\s+of|up\s+to)\s+\d|[$€£]\s?\d+(?:[.,]\d+)?|\b\d+(?:[.,]\d+)?\s*[$€£]/i;

function hasLegalSubstance(deltaText: string): boolean {
  return OBLIGATION_TERM.test(deltaText) || THRESHOLD_PATTERN.test(deltaText);
}

/**
 * Post-LLM safety guard.
 *
 * Fires when either of two conditions indicates the LLM cannot have correctly
 * returned NEUTRAL_REPHRASE:
 *
 * Condition 1 — Isolation-flagged pair (hasIsolation=true):
 *   The deterministic pass confirmed a mid-body isolated sentence insertion or
 *   deletion (hasIsolatedInsertion).  The LLM was given the pair specifically
 *   to get a rich semantic summary, but if it returned NEUTRAL_REPHRASE the
 *   structural evidence overrides it.
 *
 * Condition 2 — Substantial length delta (hasSubstantialLengthDelta):
 *   One side has ≥ MIN_ISOLATED_CHARS more characters than the other.
 *   This catches TAIL insertions/removals that arrive at the LLM via the
 *   ordinary low-similarity path (sim < SIM_THRESHOLD) rather than the
 *   isolation path.  Real-document case: clause A original=243 chars,
 *   modified=309 chars (Δ=+66, the cat sentence).  The cat sentence pushes
 *   sim below 0.95, so the pair is not isolation-flagged, but the LLM still
 *   returns NEUTRAL_REPHRASE and the guard must fire.
 *
 * Rationale:
 *  - MODIFIED_BROADER = B gained new content (net addition in B).
 *  - MODIFIED_NARROWER = B lost content that A had (net removal from A).
 *  - The LLM's semanticSummary is preserved and augmented with a guard note.
 *
 * Pairs where neither condition applies are returned unchanged.
 */
function applyIsolationGuard(
  diff: ClauseDifference,
  isolationPairIds: Set<string>,
  clauseMapA: Map<string, ExtractedClause>,
  clauseMapB: Map<string, ExtractedClause>
): ClauseDifference {
  // Only override NEUTRAL_REPHRASE — all other LLM classifications are correct
  if (diff.classification !== "NEUTRAL_REPHRASE") return diff;

  const textA = diff.clauseAId ? (clauseMapA.get(diff.clauseAId)?.text ?? "") : "";
  const textB = diff.clauseBId ? (clauseMapB.get(diff.clauseBId)?.text ?? "") : "";

  // Whitespace-normalised throughout this guard — see normalizeForComparison.
  // A trailing newline, a reflow-join double space, or any other extraction
  // formatting artifact must never itself count as isolation/length evidence.
  const normA = normalizeForComparison(textA);
  const normB = normalizeForComparison(textB);

  // If the clauses are equivalent once whitespace is collapsed, there is no
  // content difference at all — never override to a material classification.
  if (normA === normB) return diff;

  // Check both conditions
  const isIsolationPair = isolationPairIds.has(diff.pairId);
  const hasDelta        = hasSubstantialLengthDelta(normA, normB);

  if (!isIsolationPair && !hasDelta) return diff;

  const direction = detectIsolationDirection(normA, normB);

  // Item 2 fix: length/isolation structure alone is not evidence of a legal
  // scope/obligation change. The LLM already reviewed the full clause and
  // returned NEUTRAL_REPHRASE — only override that judgment when the actual
  // differing text contains a number, duration, currency, or an
  // obligation/rights-bearing term. Pure rephrasing, reordering, or added
  // wording with no substantive legal effect (e.g. a purely descriptive
  // filler sentence) stays NEUTRAL_REPHRASE rather than becoming a material
  // BROADER/NARROWER finding.
  const deltaText = extractIsolatedDeltaText(normA, normB, direction);
  if (!hasLegalSubstance(deltaText)) {
    return diff;
  }

  const overrideClassification: DiffClassification =
    direction === "added" ? "MODIFIED_BROADER" : "MODIFIED_NARROWER";

  // Wording note: this message must describe only what the deterministic
  // signal actually observed (added/removed wording, or a length change) —
  // never assert a legal effect ("substantive", "obligation") that has not
  // been separately evidenced. The LLM's own NEUTRAL_REPHRASE reasoning is
  // deliberately NOT appended here: it explains why the LLM thought there was
  // no change, which directly contradicts overriding to BROADER/NARROWER and
  // produced a self-contradictory message. This guardNote is the complete,
  // conservative summary on its own.
  const guardNote = isIsolationPair
    ? (direction === "added"
        ? "The modified version contains additional wording, not present in the original, inserted within the body of this clause. This is a deterministic structural signal — a specific legal effect has not been separately confirmed."
        : "The original version contains wording, absent from the modified version, that was removed from within the body of this clause. This is a deterministic structural signal — a specific legal effect has not been separately confirmed.")
    : (direction === "added"
        ? "The modified version of this clause is meaningfully longer than the original, consistent with added wording. This is a deterministic length-based signal — a specific legal effect has not been separately confirmed."
        : "The modified version of this clause is meaningfully shorter than the original, consistent with removed wording. This is a deterministic length-based signal — a specific legal effect has not been separately confirmed.");

  const augmentedSummary = guardNote;

  console.log(
    `[diffDetectStep] Isolation guard fired for ${diff.pairId}: ` +
      `LLM returned NEUTRAL_REPHRASE → overriding to ${overrideClassification} ` +
      `(reason=${isIsolationPair ? "isolation-flag" : "length-delta"}, direction=${direction})`
  );

  return {
    ...diff,
    classification: overrideClassification,
    semanticSummary: augmentedSummary,
    detectionMethod: "llm",
  };
}

// ─── LLM fallback ─────────────────────────────────────────────────────────────

/**
 * When the LLM fails for a batch, produce safe fallback results so the
 * pipeline does not hard-fail. Mirrors heuristicFallback in DPAReviewAgent.
 */
function buildFallbackResults(pairs: AlignedPair[]): ClauseDifference[] {
  return pairs.map((p) => ({
    pairId: p.id,
    clauseAId: p.clauseAId,
    clauseBId: p.clauseBId,
    // Correspondence is known; semantic classification is not. Never invent
    // ADDED/REMOVED/MODIFIED_* from an LLM outage.
    classification: "NEUTRAL_REPHRASE" as DiffClassification,
    semanticSummary:
      "Semantic classification unavailable — LLM call failed. Flagged for review, not counted as a confirmed material change.",
    confidence: 0.1,
    detectionMethod: "fallback" as ClauseDifference["detectionMethod"],
    changes: emptyAtomicChanges(),
  }));
}

// ─── LLM semantic batch ───────────────────────────────────────────────────────

async function runSemanticDiff(
  pairs: AlignedPair[],
  clauseMapA: Map<string, ExtractedClause>,
  clauseMapB: Map<string, ExtractedClause>,
  isolationPairIds: Set<string>
): Promise<ClauseDifference[]> {
  if (pairs.length === 0) return [];

  // Build a pairId → AlignedPair map so normaliseLLMEntry can fill clause IDs
  // authoritatively instead of trusting the LLM's null-returned values.
  const pairMap = new Map<string, AlignedPair>(pairs.map((p) => [p.id, p]));

  const skill = getSkill("difference-analysis");
  const fullSystemInstruction = `${skill}\n\n---\n\n${systemInstruction}`;

  const results: ClauseDifference[] = [];

  for (let i = 0; i < pairs.length; i += LLM_BATCH_SIZE) {
    const batch = pairs.slice(i, i + LLM_BATCH_SIZE);
    const resolved: ResolvedPair[] = resolveClauseTexts(
      batch,
      clauseMapA,
      clauseMapB
    );
    const prompt = buildDifferencePrompt(resolved);

    console.log(
      `[diffDetectStep] LLM batch ${Math.floor(i / LLM_BATCH_SIZE) + 1}: ` +
        `${batch.length} pair(s) → semantic classification`
    );

    let rawEntries: DifferenceEntry[];
    try {
      const { result, usage } = await executeJsonCompletionWithMeta<DifferenceEntry[]>(
        prompt,
        fullSystemInstruction,
        DIFFERENCE_JSON_SCHEMA,
        LLMTask.COMPARE_DIFF,
        LLMProvider.GEMINI
      );
      rawEntries = result;
      pipelineMetrics.record("diffDetect", {
        llmRequests: 1,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        llmItems: batch.length,
      });
    } catch (llmErr: any) {
      console.warn(
        `[diffDetectStep] LLM call failed for batch ${Math.floor(i / LLM_BATCH_SIZE) + 1}: ` +
          llmErr.message +
          " — applying fallback."
      );
      pipelineMetrics.record("diffDetect", {
        llmRequests: 1,
        fallbackItems: batch.length,
      });
      results.push(...buildFallbackResults(batch));
      continue;
    }

    const parsed = DifferenceResponseSchema.safeParse(rawEntries);
    if (!parsed.success) {
      console.warn(
        `[diffDetectStep] Zod validation failed — applying fallback. ` +
          `Errors: ${JSON.stringify(parsed.error.issues)}`
      );
      results.push(...buildFallbackResults(batch));
      continue;
    }

    // Normalise LLM entries, then apply the isolation safety guard:
    // Any pair that was flagged as hasIsolation=true cannot have its
    // confirmed mid-body insertion/removal hidden as NEUTRAL_REPHRASE.
    // NOTE: normaliseLLMEntry fills clauseAId/clauseBId from pairMap because
    // the LLM always returns null for these fields (they are not in the prompt).
    const normalised = parsed.data.map((e) =>
      normaliseLLMEntry(e, pairMap, clauseMapA, clauseMapB)
    );
    results.push(...normalised);
  }

  const deduped = dedupeChangesAcrossPairs(results);
  return deduped.map((d) =>
    applyIsolationGuard(d, isolationPairIds, clauseMapA, clauseMapB)
  );
}

// ─── Main step ────────────────────────────────────────────────────────────────

/**
 * diffDetectStep — Stage 4 of the compare pipeline.
 *
 * Requires state.alignment to be populated (clauseAlignStep must have run).
 * Returns an enriched CompareState with state.differences populated.
 */
export async function diffDetectStep(
  state: CompareState
): Promise<CompareState> {
  if (!state.alignment) {
    throw new Error(
      "[diffDetectStep] state.alignment is null — clauseAlignStep must run before difference detection."
    );
  }
  if (!state.structure) {
    throw new Error(
      "[diffDetectStep] state.structure is null — structureExtractStep must run before difference detection."
    );
  }

  // Build O(1) lookup maps from clause ID → ExtractedClause
  const clauseMapA = new Map<string, ExtractedClause>(
    state.structure.clausesA.map((c) => [c.id, c])
  );
  const clauseMapB = new Map<string, ExtractedClause>(
    state.structure.clausesB.map((c) => [c.id, c])
  );

  const deterministic: ClauseDifference[] = [];
  const llmQueue: AlignedPair[] = [];
  // Track pairIds where the deterministic pass confirmed a mid-body isolated
  // insertion/removal.  These pairs are forwarded to LLM for a rich summary,
  // but the post-LLM guard will refuse to accept NEUTRAL_REPHRASE for them.
  const isolationPairIds = new Set<string>();

  const removedRollupIds = collectRemovedRollupIds(
    state.alignment,
    state.structure.clausesA
  );
  const representedOriginals = collectRepresentedOriginals(
    state.alignment,
    state.structure.clausesA
  );

  // ── Deterministic pass ───────────────────────────────────────────────────
  for (const pair of state.alignment) {
    const result = tryDeterministic(
      pair,
      clauseMapA,
      clauseMapB,
      removedRollupIds,
      representedOriginals
    );
    if ("forwardToLLM" in result) {
      // Must go to LLM — record whether isolation was the reason
      if (result.hasIsolation) {
        isolationPairIds.add(pair.id);
      }
      llmQueue.push(pair);
    } else {
      deterministic.push(result);
    }
  }

  const unchanged = deterministic.filter((d) => d.classification === "UNCHANGED").length;
  const rephrase  = deterministic.filter((d) => d.classification === "NEUTRAL_REPHRASE").length;
  const addedRem  = deterministic.filter(
    (d) => d.classification === "ADDED" || d.classification === "REMOVED"
  ).length;

  console.log(
    `[diffDetectStep] Deterministic: ${deterministic.length} classified ` +
      `(unchanged=${unchanged}, rephrase=${rephrase}, added/removed=${addedRem}) | ` +
      `${llmQueue.length} pair(s) → LLM` +
      (isolationPairIds.size > 0 ? ` (${isolationPairIds.size} isolation-flagged)` : "")
  );

  pipelineMetrics.record("diffDetect", {
    deterministicItems: deterministic.length,
  });

  // ── LLM semantic pass (only residual pairs) ──────────────────────────────
  const semantic = await runSemanticDiff(llmQueue, clauseMapA, clauseMapB, isolationPairIds);

  const broader  = semantic.filter((d) => d.classification === "MODIFIED_BROADER").length;
  const narrower = semantic.filter((d) => d.classification === "MODIFIED_NARROWER").length;

  console.log(
    `[diffDetectStep] Semantic: ${semantic.length} classified ` +
      `(broader=${broader}, narrower=${narrower}, fallback=${
        semantic.filter((d) => d.detectionMethod === "fallback").length
      })`
  );

  // ── Merge ────────────────────────────────────────────────────────────────
  // Preserve original alignment order so downstream stages can iterate
  // alignment and differences in lockstep.
  const pairOrder = new Map(
    state.alignment.map((p, i) => [p.id, i])
  );

  // ── P0-3: Cap diff confidence for low-confidence semantic alignment pairs ─
  //
  // A pair matched by the LLM with matchConfidence < LOW_ALIGNMENT_CONFIDENCE_THRESHOLD
  // should not produce a diff that looks as trustworthy as a Tier-1 exact match.
  // Cap the resulting ClauseDifference.confidence to the alignment confidence
  // so downstream stages (risk, UI) can see the uncertainty.
  //
  // Only applies to semantic alignment — deterministic matches (exact text,
  // exact title, numeric label, etc.) are never capped regardless of confidence.
  const pairAlignmentMap = new Map(
    state.alignment.map((p) => [p.id, p])
  );

  const allDiffs = [...deterministic, ...semantic];
  const capNote = "(low alignment confidence — manual review recommended)";
  const cappedDiffs: ClauseDifference[] = allDiffs.map((diff) => {
    const pair = pairAlignmentMap.get(diff.pairId);
    if (!pair) return diff;

    // Only cap semantic (LLM-produced) alignments below the threshold
    if (
      pair.alignmentType !== "semantic" ||
      pair.matchConfidence >= LOW_ALIGNMENT_CONFIDENCE_THRESHOLD
    ) {
      return diff;
    }

    // Cap diff confidence to the alignment confidence
    const cappedConfidence = Math.min(diff.confidence, pair.matchConfidence);

    // Append a note to the semantic summary so it's visible in reviews
    const cappedSummary = diff.semanticSummary
      ? `${diff.semanticSummary} ${capNote}`
      : capNote;

    console.log(
      `[diffDetectStep] P0-3 confidence cap applied to ${diff.pairId}: ` +
        `diff.confidence ${diff.confidence.toFixed(2)} → ${cappedConfidence.toFixed(2)} ` +
        `(alignment matchConfidence=${pair.matchConfidence.toFixed(2)})`
    );

    return {
      ...diff,
      confidence: cappedConfidence,
      semanticSummary: cappedSummary,
    };
  });

  const differences: ClauseDifference[] = cappedDiffs.sort(
    (a, b) => (pairOrder.get(a.pairId) ?? 0) - (pairOrder.get(b.pairId) ?? 0)
  );

  console.log(
    `[diffDetectStep] Final differences: ${differences.length} total ` +
      `(confirmed material=${
        differences.filter(
          (d) =>
            d.detectionMethod !== "fallback" &&
            d.classification !== "UNCHANGED" &&
            d.classification !== "NEUTRAL_REPHRASE"
        ).length
      } ` +
      `uncertain=${differences.filter((d) => d.detectionMethod === "fallback").length} ` +
      `neutral=${differences.filter((d) => d.classification === "NEUTRAL_REPHRASE" && d.detectionMethod !== "fallback").length})`
  );

  return {
    ...state,
    differences,
  };
}
