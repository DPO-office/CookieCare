import type { SharedEvidenceItem } from "../../models/evidence-package.js";
import { type ClauseIndex, cosineSimilarity, embedQuery } from "./clause-index.js";

/**
 * Semantic Retrieval plan (R1) — the generic hybrid retriever.
 *
 * THIS FILE MUST STAY TOPIC-AGNOSTIC. No "duration", "confidentiality",
 * clause-type branches, or any other per-concept logic belongs here — ever.
 * `queryText` is opaque (a proofStandard, a PLAN hypothesis, a follow-up
 * question); `lexicalScore` is an injected scorer so this file never needs
 * to know what "scoring evidence" even means for a given caller. If a future
 * change needs an `if (topic === …)` in this file, the design has regressed
 * to the thing it replaced (plan §6) — stop and fix it elsewhere.
 */

/**
 * One row of the retrieval trace — per pool item, the raw scores and ranks
 * from each arm plus the fused result. Purely diagnostic; the retriever
 * computes it only when a `trace` callback is supplied and never uses it to
 * decide anything, so it cannot change ranking behavior.
 */
export interface RetrievalTraceRow {
  ref: string;
  clauseType: string;
  structuralPath?: string;
  denseScore: number | null;
  denseRank: number | null;
  lexScore: number;
  lexRank: number | null;
  fused: number;
  kept: boolean;
}

export interface RetrieveCandidatesArgs {
  /** Opaque text to embed for the dense arm — proofStandard, hypothesis, or a user question. */
  queryText: string;
  /** Full candidate pool for this package/document. */
  pool: SharedEvidenceItem[];
  /** In-memory (or persisted) embedding index for the same pool. Omit/empty to skip the dense arm. */
  index?: ClauseIndex;
  /** Lexical scorer, e.g. scoreEvidenceItem from isolate-requirement-evidence.ts. Higher = more relevant. */
  lexicalScore: (item: SharedEvidenceItem) => number;
  /** How many fused candidates to return. */
  cap: number;
  /** How many items each arm ranks before fusion (recall width). */
  armWidth?: number;
  /** RRF constant. */
  rrfK?: number;
  /** Fusion weights; need not sum to 1. */
  denseWeight?: number;
  lexicalWeight?: number;
  /** Diagnostic only — receives the full per-item scoring breakdown. Never affects ranking. */
  trace?: (rows: RetrievalTraceRow[]) => void;
}

const DEFAULT_ARM_WIDTH = 20;
const DEFAULT_RRF_K = 60;
const DEFAULT_DENSE_WEIGHT = 0.5;
const DEFAULT_LEXICAL_WEIGHT = 0.5;

function rank<T>(items: T[], score: (item: T) => number): T[] {
  return [...items].sort((a, b) => score(b) - score(a));
}

/** Reciprocal Rank Fusion — same formula as RAG/ragService.ts's searchHybrid. */
function rrfFuse(
  denseRanked: SharedEvidenceItem[],
  lexicalRanked: SharedEvidenceItem[],
  k: number,
  denseWeight: number,
  lexicalWeight: number
): { ordered: SharedEvidenceItem[]; scores: Map<string, number> } {
  const scores = new Map<string, number>();
  const byRef = new Map<string, SharedEvidenceItem>();
  denseRanked.forEach((item, i) => {
    byRef.set(item.ref, item);
    scores.set(item.ref, (scores.get(item.ref) ?? 0) + denseWeight * (1 / (k + i + 1)));
  });
  lexicalRanked.forEach((item, i) => {
    byRef.set(item.ref, item);
    scores.set(item.ref, (scores.get(item.ref) ?? 0) + lexicalWeight * (1 / (k + i + 1)));
  });
  const ordered = [...byRef.values()].sort(
    (a, b) => (scores.get(b.ref) ?? 0) - (scores.get(a.ref) ?? 0)
  );
  return { ordered, scores };
}

/**
 * Hybrid dense + lexical candidate retrieval, fused via RRF. Falls back to
 * pure lexical ranking when the index is absent, empty, or the query embed
 * fails — retrieval never blocks or errors, it only ever degrades.
 */
export async function retrieveCandidates(args: RetrieveCandidatesArgs): Promise<SharedEvidenceItem[]> {
  const {
    queryText,
    pool,
    index,
    lexicalScore,
    cap,
    armWidth = DEFAULT_ARM_WIDTH,
    rrfK = DEFAULT_RRF_K,
    denseWeight = DEFAULT_DENSE_WEIGHT,
    lexicalWeight = DEFAULT_LEXICAL_WEIGHT,
  } = args;

  const nonEmpty = pool.filter((item) => item.quotedText.trim().length > 0);
  const lexicalSorted = rank(nonEmpty, lexicalScore);
  const lexicalRanked = lexicalSorted.slice(0, armWidth);

  if (!index || index.vectors.size === 0) {
    const result = lexicalRanked.slice(0, cap);
    emitTrace(args.trace, nonEmpty, result, {
      lexScore: lexicalScore,
      lexRankByRef: rankMap(lexicalRanked),
      denseScoreByRef: new Map(),
      denseRankByRef: new Map(),
      fusedByRef: new Map(),
    });
    return result;
  }

  const queryVec = await embedQuery(queryText);
  if (!queryVec) {
    const result = lexicalRanked.slice(0, cap);
    emitTrace(args.trace, nonEmpty, result, {
      lexScore: lexicalScore,
      lexRankByRef: rankMap(lexicalRanked),
      denseScoreByRef: new Map(),
      denseRankByRef: new Map(),
      fusedByRef: new Map(),
    });
    return result;
  }

  const denseScored = nonEmpty
    .map((item) => {
      const vec = index.vectors.get(item.ref);
      return vec ? { item, score: cosineSimilarity(queryVec, vec) } : null;
    })
    .filter((x): x is { item: SharedEvidenceItem; score: number } => x !== null);

  if (denseScored.length === 0) {
    const result = lexicalRanked.slice(0, cap);
    emitTrace(args.trace, nonEmpty, result, {
      lexScore: lexicalScore,
      lexRankByRef: rankMap(lexicalRanked),
      denseScoreByRef: new Map(),
      denseRankByRef: new Map(),
      fusedByRef: new Map(),
    });
    return result;
  }

  const denseSorted = rank(denseScored, (x) => x.score);
  const denseRanked = denseSorted.slice(0, armWidth).map((x) => x.item);
  const { ordered, scores } = rrfFuse(denseRanked, lexicalRanked, rrfK, denseWeight, lexicalWeight);
  const result = ordered.slice(0, cap);

  emitTrace(args.trace, nonEmpty, result, {
    lexScore: lexicalScore,
    lexRankByRef: rankMap(lexicalRanked),
    denseScoreByRef: new Map(denseScored.map((d) => [d.item.ref, d.score])),
    denseRankByRef: rankMap(denseRanked),
    fusedByRef: scores,
  });
  return result;
}

/** ref -> 1-based rank within a ranked list (only items present in the list). */
function rankMap(ranked: SharedEvidenceItem[]): Map<string, number> {
  const m = new Map<string, number>();
  ranked.forEach((item, i) => m.set(item.ref, i + 1));
  return m;
}

function emitTrace(
  trace: RetrieveCandidatesArgs["trace"],
  pool: SharedEvidenceItem[],
  kept: SharedEvidenceItem[],
  data: {
    lexScore: (item: SharedEvidenceItem) => number;
    lexRankByRef: Map<string, number>;
    denseScoreByRef: Map<string, number>;
    denseRankByRef: Map<string, number>;
    fusedByRef: Map<string, number>;
  }
): void {
  if (!trace) return;
  const keptRefs = new Set(kept.map((i) => i.ref));
  const rows: RetrievalTraceRow[] = pool.map((item) => ({
    ref: item.ref,
    clauseType: item.clauseType,
    structuralPath: item.structuralPath,
    denseScore: data.denseScoreByRef.get(item.ref) ?? null,
    denseRank: data.denseRankByRef.get(item.ref) ?? null,
    lexScore: data.lexScore(item),
    lexRank: data.lexRankByRef.get(item.ref) ?? null,
    fused: data.fusedByRef.get(item.ref) ?? 0,
    kept: keptRefs.has(item.ref),
  }));
  rows.sort((a, b) => b.fused - a.fused || b.lexScore - a.lexScore);
  trace(rows);
}
