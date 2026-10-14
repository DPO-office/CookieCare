import { hashRevision, hashText, KB_SCHEMA_VERSION } from "../schemas/common.js";
import { SearchEntrySchema, type SearchEntry } from "../schemas/publication.js";

export interface SearchRecord {
  kind: "provision" | "requirement" | "profile";
  id: string;
  revision: number;
  sourceVersionId: string;
  citation: string;
  text: string;
  proofElementId?: string;
}
export interface SearchTextDraft {
  id: string;
  indexVersion: string;
  sourceVersionId: string;
  recordKind: SearchRecord["kind"];
  record: { id: string; revision: number };
  purpose: "legal_passage" | "rule_discovery" | "evidence_query";
  proofElementId: string | null;
  text: string;
  textHash: string;
  sourceStart: number;
  sourceEnd: number;
}
export interface EmbeddingBatchProvider {
  model: string;
  dimensions: number;
  configurationVersion: string;
  documentTask: string;
  queryTask: string;
  embed(texts: string[], task: string): Promise<number[][]>;
}

/** Covers every character of a long record; a chunk still points to the whole record revision. */
export function buildSearchTextDrafts(indexVersion: string, records: SearchRecord[],
  maxCharacters = 4000): SearchTextDraft[] {
  if (!indexVersion || !Number.isInteger(maxCharacters) || maxCharacters < 100) {
    throw new Error("Invalid search text configuration");
  }
  const drafts: SearchTextDraft[] = [];
  for (const record of records) {
    if (!record.id || !record.sourceVersionId || !record.text.trim() || !record.citation.trim()) {
      throw new Error("Search record lacks identity, citation or text");
    }
    const purpose = record.kind === "provision" ? "legal_passage" :
      record.kind === "requirement" ? "rule_discovery" : "evidence_query";
    if (purpose === "evidence_query" && !record.proofElementId) {
      throw new Error("Evidence queries need a proof element");
    }
    const prefix = `${record.citation.trim()}\n`;
    const capacity = maxCharacters - prefix.length;
    if (capacity < 1) throw new Error("Citation exceeds search entry limit");
    for (let start = 0; start < record.text.length;) {
      let end = Math.min(record.text.length, start + capacity);
      if (end < record.text.length && /[\uD800-\uDBFF]/.test(record.text[end - 1]!) &&
          /[\uDC00-\uDFFF]/.test(record.text[end]!)) end--;
      if (end <= start) throw new Error("Search chunk cannot hold a Unicode code point");
      const text = prefix + record.text.slice(start, end);
      drafts.push({ id: hashRevision({ indexVersion, kind: record.kind, recordId: record.id,
        revision: record.revision, start, end, textHash: hashText(text) }),
        indexVersion, sourceVersionId: record.sourceVersionId, recordKind: record.kind,
        record: { id: record.id, revision: record.revision }, purpose,
        proofElementId: record.proofElementId ?? null, text, textHash: hashText(text),
        sourceStart: start, sourceEnd: end });
      start = end;
    }
  }
  return drafts;
}

/** Requires an explicit provider; rejects partial or malformed batches before storage. */
export async function embedSearchDrafts(drafts: SearchTextDraft[], provider: EmbeddingBatchProvider,
  batchSize = 8): Promise<SearchEntry[]> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 32 ||
      !Number.isInteger(provider.dimensions) || provider.dimensions < 1) {
    throw new Error("Invalid embedding configuration");
  }
  const entries: SearchEntry[] = [];
  for (let start = 0; start < drafts.length; start += batchSize) {
    const batch = drafts.slice(start, start + batchSize);
    const vectors = await provider.embed(batch.map(item => item.text), provider.documentTask);
    if (vectors.length !== batch.length) throw new Error("Embedding provider returned an incomplete batch");
    for (let index = 0; index < batch.length; index++) {
      const draft = batch[index]!;
      entries.push(SearchEntrySchema.parse({ schemaVersion: KB_SCHEMA_VERSION,
        id: draft.id, indexVersion: draft.indexVersion, sourceVersionId: draft.sourceVersionId,
        recordKind: draft.recordKind, record: draft.record, purpose: draft.purpose,
        proofElementId: draft.proofElementId, text: draft.text, textHash: draft.textHash,
        embedding: { model: provider.model, dimensions: provider.dimensions,
          configurationVersion: provider.configurationVersion,
          documentTask: provider.documentTask, queryTask: provider.queryTask,
          vector: vectors[index] } }));
    }
  }
  return entries;
}
