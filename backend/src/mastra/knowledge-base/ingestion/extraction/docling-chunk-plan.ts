import { existsSync } from "node:fs";
import path from "node:path";
import { chunkWithDoclingService, doclingServiceConfigured } from "../../../../services/docling-client.js";
import type { SourceMap } from "./source-map.js";
import { materialize, type StructureChunkPlan, type StructureSourceUnit } from "./structure-chunk-plan.js";
import { LLM_MAX_INPUT_CHARACTERS, LLM_TARGET_INPUT_CHARACTERS } from "./structure-provider.js";

export interface NativeChunk { text: string; docItems: string[]; headings?: string[] }
export const NATIVE_CHUNK_TOKENS = 2048;

export async function nativeDoclingChunks(document: unknown): Promise<NativeChunk[]> {
  if (doclingServiceConfigured()) return chunkWithDoclingService(document, NATIVE_CHUNK_TOKENS);
  if (process.env.NODE_ENV === "production") throw new Error("Docling chunk service is required in production");
  const tokenizer = process.env.DOCLING_CHUNK_TOKENIZER ?? [process.cwd(), path.resolve(process.cwd(), "..")]
    .map(root => path.join(root, ".models", "chunk", "tokenizer.json")).find(file => existsSync(file));
  if (!tokenizer) throw new Error("Docling HybridChunker tokenizer is missing; set DOCLING_CHUNK_TOKENIZER");
  const { chunkDocumentAsync } = await import("docling.rs");
  return chunkDocumentAsync(JSON.stringify(document), { chunker: "hybrid", tokenizer,
    maxTokens: NATIVE_CHUNK_TOKENS, mergePeers: true });
}

/** Native chunks propose groups. Exact original source spans remain the authority.
 * Repeated native item refs (e.g. split tables) never duplicate or drop original text.
 * Native token counts use the configured Docling tokenizer, not necessarily the LLM's.
 */
export function projectDoclingChunks(map: SourceMap, native: NativeChunk[], fixed: number): StructureChunkPlan {
  const firstOwner = new Map<string, number>();
  native.forEach((chunk, index) => chunk.docItems.forEach(ref => {
    if (!firstOwner.has(ref)) firstOwner.set(ref, index);
  }));
  const units: Array<StructureSourceUnit & { group: string; headings: string[] }> = [];
  const warnings: string[] = [];
  map.spans.forEach((span, index) => {
    const owner = firstOwner.get(span.itemRef);
    if (owner === undefined) warnings.push(`native_chunker_omitted_item:${span.itemRef}; original retained`);
    // Bound source fragments too: one oversized OCR block must not defeat small requests.
    let start = span.start;
    while (start < span.end) {
      let end = Math.min(start + 2000, span.end);
      if (end < span.end) {
        const search = map.text.slice(start + 1000, end);
        const matches = [...search.matchAll(/\s+/gu)];
        if (matches.length) end = start + 1000 + matches.at(-1)!.index! + matches.at(-1)![0].length;
        else if (/[\uD800-\uDBFF]/u.test(map.text[end - 1]!)) end--;
      }
      units.push({ id: span.end - span.start <= 2000 ? `src:${index}` : `src:${index}@${start}`,
        start, end, text: map.text.slice(start, end), group: owner === undefined ? `unmapped:${index}` : `native:${owner}`,
        ...(span.end - span.start > 2000 ? { fragmentOf: `src:${index}`,
          continuesBefore: start > span.start, continuesAfter: end < span.end } : {}),
        headings: owner === undefined ? [] : native[owner]!.headings ?? [] });
      start = end;
    }
  });
  const chunks: StructureChunkPlan["chunks"] = [];
  for (let cursor = 0; cursor < units.length;) {
    const start = cursor, group = units[start]!.group;
    const headings = units[start]!.headings;
    const id = `chunk_${String(chunks.length + 1).padStart(3, "0")}`;
    const make = (end: number, before: StructureSourceUnit[] = [], after: StructureSourceUnit[] = []) =>
      materialize(map, id, units.slice(start, end), before, after, fixed, headings, true);
    while (cursor < units.length && units[cursor]!.group === group && cursor - start < 40) {
      if (make(cursor + 1).assembledInputCharacters > LLM_TARGET_INPUT_CHARACTERS && cursor > start) break;
      if (make(cursor + 1).assembledInputCharacters > LLM_MAX_INPUT_CHARACTERS) {
        throw new Error(`Chunk context cannot fit for ${units[cursor]!.id}`);
      }
      cursor++;
    }
    if (cursor === start) throw new Error("Chunk planner made no progress");
    const coreIds = new Set(units.slice(start, cursor).map(unit => unit.id));
    const tableRefs = new Set(map.spans.filter(span => span.kind === "table_cell" &&
      span.start < units[cursor - 1]!.end && span.end > units[start]!.start).map(span => span.itemRef));
    const headerSpans = map.spans.filter(span => span.isHeader && tableRefs.has(span.itemRef));
    const headers = units.filter(unit => headerSpans.some(span => unit.start >= span.start && unit.end <= span.end));
    const before = [...new Map([...(start ? [units[start - 1]!] : []), ...headers]
      .filter(unit => !coreIds.has(unit.id)).map(unit => [unit.id, unit])).values()];
    const after = cursor < units.length ? [units[cursor]!] : [];
    let chunk = make(cursor, before, after);
    const omitted: string[] = [];
    if (chunk.assembledInputCharacters > LLM_MAX_INPUT_CHARACTERS) {
      omitted.push(...after.map(unit => unit.id)); chunk = make(cursor, before);
    }
    if (chunk.assembledInputCharacters > LLM_MAX_INPUT_CHARACTERS) {
      omitted.push(...before.map(unit => unit.id)); chunk = make(cursor);
    }
    if (chunk.assembledInputCharacters > LLM_MAX_INPUT_CHARACTERS) throw new Error("Projected chunk exceeds ceiling");
    chunk.omittedContextIds = omitted;
    chunks.push(chunk);
  }
  return { schemaVersion: 1, sourceTextHash: map.textHash, targetInputCharacters: LLM_TARGET_INPUT_CHARACTERS,
    hardInputCharacters: LLM_MAX_INPUT_CHARACTERS, fixedInputCharacters: fixed, chunks,
    method: "docling_hybrid_source_projection", nativeChunkCount: native.length,
    nativeMaxTokens: NATIVE_CHUNK_TOKENS, tokenizer: "docling-configured-tokenizer; not an LLM-token guarantee",
    warnings: [...new Set(warnings)] };
}
