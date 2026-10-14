/**
 * Clause retrieval for the structural pass (V2 Stage 3 support).
 *
 * Embeds all segment texts + all rule queries in ONE batch and ranks by cosine
 * when embeddings are available; degrades to lexical token-overlap when
 * embeddings fail or return nulls (mirrors executeEmbedding's null-fallback).
 * Never throws.
 */
import { executeEmbedding } from "../../../llm/index.js";
import { ClauseSegment } from "./types.js";
import { RubricRule } from "./rubric.js";

function tokens(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 3));
}
function lexicalScore(queryToks: Set<string>, seg: string): number {
  if (queryToks.size === 0) return 0;
  const s = tokens(seg); let hits = 0;
  for (const t of queryToks) if (s.has(t)) hits++;
  return hits / queryToks.size;
}
function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
function ruleQuery(rule: RubricRule): string {
  return [rule.label, rule.question, ...(rule.textSynonyms ?? []), ...(rule.appliesToClauseTypes ?? [])].join(" ");
}

export interface RetrievalIndex {
  usedEmbeddings: boolean;
  embedCalls: number;
  retrieveForRule(rule: RubricRule, topK: number): ClauseSegment[];
}

export async function buildRetrievalIndex(segments: ClauseSegment[], rules: RubricRule[]): Promise<RetrievalIndex> {
  const ruleQueries = rules.map(ruleQuery);
  let vectors: Array<number[] | null> = [];
  let embedCalls = 0;
  try {
    vectors = await executeEmbedding([...segments.map((s) => s.text.slice(0, 2000)), ...ruleQueries]);
    embedCalls = 1;
  } catch { vectors = []; }

  const nSeg = segments.length;
  const segVecs = vectors.slice(0, nSeg);
  const ruleVecs = vectors.slice(nSeg);
  const haveEmb = vectors.length === nSeg + rules.length && segVecs.some((v) => v !== null) && ruleVecs.some((v) => v !== null);
  const ruleIdx = new Map(rules.map((r, i) => [r.ruleId, i]));

  return {
    usedEmbeddings: haveEmb,
    embedCalls,
    retrieveForRule(rule: RubricRule, topK: number): ClauseSegment[] {
      const qToks = tokens(ruleQuery(rule));
      let scored: { seg: ClauseSegment; score: number }[];
      if (haveEmb && ruleVecs[ruleIdx.get(rule.ruleId)!]) {
        const rv = ruleVecs[ruleIdx.get(rule.ruleId)!]!;
        scored = segments.map((seg, i) => {
          const sv = segVecs[i];
          const emb = sv ? cosine(rv, sv) : 0;
          const lex = lexicalScore(qToks, seg.text);
          return { seg, score: 0.7 * emb + 0.3 * lex }; // blend: semantic + lexical
        });
      } else {
        scored = segments.map((seg) => ({ seg, score: lexicalScore(qToks, seg.text) }));
      }
      return scored.filter((x) => x.score > 0.05).sort((a, b) => b.score - a.score).slice(0, topK).map((x) => x.seg);
    },
  };
}
