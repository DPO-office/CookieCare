/**
 * granular-diff.ts
 *
 * Pure helpers for atomic semantic changes inside one aligned pair.
 * Parent ClauseDifference stays 1:1 with AlignedPair; this module only
 * sanitises, deduplicates, and rolls up `changes`.
 */

import type {
  AtomicChange,
  AtomicChangeClassification,
  ClauseDifference,
  DiffClassification,
} from "../models/compare-state.js";

const MIN_SNIPPET_CHARS = 6;

export function normalizeTopic(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

export function normalizeEvidence(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function snippetInText(snippet: string, text: string): boolean {
  const snip = normalizeEvidence(snippet);
  if (snip.length < MIN_SNIPPET_CHARS) return false;
  return normalizeEvidence(text).includes(snip);
}

function restatesWholeClause(snippet: string, text: string): boolean {
  const snip = snippet.trim();
  const body = text.trim();
  if (body.length <= 60) return false;
  return snip.length >= 0.8 * body.length;
}

/**
 * Keep only changes that quote distinct, in-source spans on both sides.
 * Wording drift without a quotable independent edit is dropped.
 */
export function sanitizeAtomicChanges(
  raw: AtomicChange[] | undefined,
  textA: string,
  textB: string
): AtomicChange[] {
  if (!raw || raw.length === 0) return [];
  const kept: AtomicChange[] = [];
  for (const change of raw) {
    const topic = normalizeTopic(change.topic);
    if (!topic) continue;
    const originalSnippet = change.originalSnippet.trim();
    const modifiedSnippet = change.modifiedSnippet.trim();
    const summary = change.summary.trim();
    if (!originalSnippet || !modifiedSnippet || !summary) continue;
    if (normalizeEvidence(originalSnippet) === normalizeEvidence(modifiedSnippet)) continue;
    if (!snippetInText(originalSnippet, textA)) continue;
    if (!snippetInText(modifiedSnippet, textB)) continue;
    if (restatesWholeClause(originalSnippet, textA)) continue;
    if (restatesWholeClause(modifiedSnippet, textB)) continue;
    const classification = change.classification;
    if (
      classification !== "MODIFIED_BROADER" &&
      classification !== "MODIFIED_NARROWER" &&
      classification !== "NEUTRAL_REPHRASE"
    ) {
      continue;
    }
    kept.push({
      topic,
      classification,
      summary,
      originalSnippet,
      modifiedSnippet,
      confidence: Math.min(1, Math.max(0, change.confidence)),
    });
  }
  return kept;
}

export function dedupeTopicsWithinPair(changes: AtomicChange[]): AtomicChange[] {
  const seen = new Set<string>();
  const out: AtomicChange[] = [];
  for (const change of changes) {
    if (seen.has(change.topic)) continue;
    seen.add(change.topic);
    out.push(change);
  }
  return out;
}

export function changeFingerprint(change: AtomicChange): string {
  return [
    change.topic,
    normalizeEvidence(change.originalSnippet),
    normalizeEvidence(change.modifiedSnippet),
  ].join("|");
}

export interface ParentRollup {
  classification: DiffClassification;
  semanticSummary: string;
  confidence: number;
}

/**
 * Parent row is derived from evidenced atomic changes, not from the LLM
 * envelope classification. Empty changes → non-material rephrase (caller
 * may still apply the isolation guard).
 */
export function rollupParentFromChanges(
  changes: AtomicChange[],
  fallbackConfidence: number
): ParentRollup {
  if (changes.length === 0) {
    return {
      classification: "NEUTRAL_REPHRASE",
      semanticSummary:
        "No independent evidenced obligation change was identified in the clause text.",
      confidence: Math.min(1, Math.max(0, fallbackConfidence)),
    };
  }

  const material = changes.filter((c) => c.classification !== "NEUTRAL_REPHRASE");
  let classification: DiffClassification = "NEUTRAL_REPHRASE";
  if (material.some((c) => c.classification === "MODIFIED_BROADER")) {
    classification = "MODIFIED_BROADER";
  } else if (material.some((c) => c.classification === "MODIFIED_NARROWER")) {
    classification = "MODIFIED_NARROWER";
  }

  const summarySource = material.length > 0 ? material : changes;
  const semanticSummary = summarySource.map((c) => c.summary.replace(/\.+$/, "")).join("; ") + ".";
  const confidence = Math.max(...changes.map((c) => c.confidence), 0);

  return { classification, semanticSummary, confidence };
}

export function applyGranularChanges(
  raw: AtomicChange[] | undefined,
  textA: string,
  textB: string,
  fallbackConfidence: number
): { changes: AtomicChange[]; rollup: ParentRollup } {
  const changes = dedupeTopicsWithinPair(sanitizeAtomicChanges(raw, textA, textB));
  return { changes, rollup: rollupParentFromChanges(changes, fallbackConfidence) };
}

/**
 * If the same evidenced edit appears on two pairs, keep the higher-confidence
 * copy and re-roll the loser. Deterministic ADDED/REMOVED/UNCERTAIN rows
 * have empty changes and are left untouched.
 */
export function dedupeChangesAcrossPairs(diffs: ClauseDifference[]): ClauseDifference[] {
  const winner = new Map<string, { pairId: string; confidence: number }>();
  for (const diff of diffs) {
    for (const change of diff.changes ?? []) {
      const fp = changeFingerprint(change);
      const prev = winner.get(fp);
      if (!prev || change.confidence > prev.confidence) {
        winner.set(fp, { pairId: diff.pairId, confidence: change.confidence });
      }
    }
  }

  return diffs.map((diff) => {
    const original = diff.changes ?? [];
    if (original.length === 0) return diff;
    const next = original.filter((change) => {
      const keep = winner.get(changeFingerprint(change));
      return keep?.pairId === diff.pairId;
    });
    if (next.length === original.length) return { ...diff, changes: original };
    const rollup = rollupParentFromChanges(next, diff.confidence);
    return {
      ...diff,
      changes: next,
      classification: rollup.classification,
      semanticSummary: rollup.semanticSummary,
      confidence: rollup.confidence,
    };
  });
}

export function emptyAtomicChanges(): AtomicChange[] {
  return [];
}

export type { AtomicChangeClassification };
