import type { SharedEvidenceItem } from "../../models/evidence-package.js";
import { executeEmbedding } from "../../../../llm/index.js";

/**
 * Semantic Retrieval plan (R1) — in-memory clause embedding index for one
 * analysis run. Built during PLAN/early ACT (overlaps other work, ~2-5s for
 * a 100-page doc) and never persisted; the persisted, glossed index for
 * follow-ups is a separate background job (plan R4), not this file.
 */
export interface ClauseIndex {
  /** ref -> embedding vector, or null when embedding failed for that item. */
  vectors: Map<string, number[] | null>;
}

/** What actually gets embedded per clause — heading path + type give the
 * embedding model semantic context beyond the bare text (plan §2, "Embed
 * text (hot path)"). No LLM gloss on this path — that's the background
 * persist path only (R4). */
function embedTextFor(item: SharedEvidenceItem): string {
  const heading = item.structuralPath ? `[${item.structuralPath} · ${item.clauseType}]` : `[${item.clauseType}]`;
  return `${heading} ${item.quotedText}`.trim();
}

/**
 * Embed every item in the pool. Never throws — a failed embedding leaves
 * that ref mapped to `null`, and callers (retrieve-candidates.ts) skip it
 * for the dense arm while it still participates in the lexical arm.
 */
export async function buildInMemoryIndex(pool: SharedEvidenceItem[]): Promise<ClauseIndex> {
  if (pool.length === 0) return { vectors: new Map() };
  const texts = pool.map(embedTextFor);
  const vectors = await executeEmbedding(texts);
  const map = new Map<string, number[] | null>();
  pool.forEach((item, i) => map.set(item.ref, vectors[i] ?? null));
  return { vectors: map };
}

/** Embed a single query string (proofStandard / hypothesis / follow-up question). */
export async function embedQuery(queryText: string): Promise<number[] | null> {
  if (!queryText.trim()) return null;
  const [vec] = await executeEmbedding([queryText]);
  return vec ?? null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
