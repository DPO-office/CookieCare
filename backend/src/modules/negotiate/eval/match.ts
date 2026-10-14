/**
 * Deterministic, text-tolerant matching between gold findings and v1 findings.
 * Pure functions only (no DB, no LLM) so they are unit-testable.
 *
 * Approved matching rule: a v1 finding matches a gold finding when
 *   (anchor overlap)  AND  (issueTag/keyword confirmation)
 * and — for absence golds — the v1 finding must also ASSERT an absence.
 * Exact generated wording is never required.
 */
import type { GoldFinding, V1Finding } from "./types.js";

const STOPWORDS = new Set([
  "the", "and", "for", "any", "shall", "with", "that", "this", "from", "will",
  "not", "are", "such", "which", "under", "into", "than", "then", "have", "has",
  "its", "his", "her", "our", "their", "may", "must", "who", "was", "were",
]);

export function norm(s: string): string {
  return (s || "")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[–—―]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Significant tokens (len > 3, not a stopword). */
export function sigTokens(s: string): string[] {
  return norm(s)
    .replace(/[^a-z0-9()\-/ ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3 && !STOPWORDS.has(t));
}

/**
 * Fraction of the anchor quote's significant tokens present in the v1 finding
 * text. Returns 1 when the quote is empty (doc-level anchors rely on keywords).
 */
export function anchorTokenContainment(quote: string | undefined, findingText: string): number {
  if (!quote || !quote.trim()) return 1;
  const anchorToks = sigTokens(quote);
  if (anchorToks.length === 0) return 1;
  const hay = " " + norm(findingText) + " ";
  let hits = 0;
  for (const t of anchorToks) if (hay.includes(t)) hits++;
  return hits / anchorToks.length;
}

export const ANCHOR_THRESHOLD = 0.6;

export function anchorMatches(gold: GoldFinding, f: V1Finding): boolean {
  // v1 `original` is verbatim document text; the gold quote is verbatim too.
  const containment = anchorTokenContainment(gold.anchor.quote, f.original);
  return containment >= ANCHOR_THRESHOLD;
}

export function keywordMatches(gold: GoldFinding, f: V1Finding): boolean {
  const hay = norm(f.original + " " + f.reasoning);
  const need = gold.keywordMinHits ?? 1;
  let hits = 0;
  for (const kw of gold.matchKeywords) if (hay.includes(norm(kw))) hits++;
  return hits >= need;
}

const ABSENCE_ASSERTION =
  /\b(no |not |does not|do not|absent|missing|lacks?|without (a|an|any)|fails to|there is no|omits?|silent on|no explicit|no fixed|no specific)\b/;

export function assertsAbsence(f: V1Finding): boolean {
  return ABSENCE_ASSERTION.test(norm(f.original + " " + f.reasoning));
}

/** Core predicate: does v1 finding `f` satisfy gold `g`? */
export function findingMatchesGold(g: GoldFinding, f: V1Finding): boolean {
  if (!anchorMatches(g, f)) return false;
  if (!keywordMatches(g, f)) return false;
  // Absence golds require an absence signal: either an explicit isAbsence flag
  // (V2) or an absence-assertion phrase in the text (V1 free-text).
  if (g.kind === "absence" && !(f.isAbsence === true || assertsAbsence(f))) return false;
  return true;
}
