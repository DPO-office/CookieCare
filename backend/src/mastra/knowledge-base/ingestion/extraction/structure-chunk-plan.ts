import { createHash } from "node:crypto";
import type { SourceMap } from "./source-map.js";

export interface StructureSourceUnit {
  id: string;
  start: number;
  end: number;
  text: string;
  fragmentOf?: string;
  continuesBefore?: boolean;
  continuesAfter?: boolean;
}

export interface StructureChunk {
  chunkId: string;
  inputHash: string;
  coreRange: { start: number; end: number };
  coreSourceIds: string[];
  contextBefore: string[];
  contextAfter: string[];
  assembledInputCharacters: number;
  sourceUnits?: StructureSourceUnit[];
  headingContext?: string[];
  omittedContextIds?: string[];
}

export interface StructureChunkPlan {
  schemaVersion: 1;
  sourceTextHash: string;
  targetInputCharacters: number;
  hardInputCharacters: number;
  fixedInputCharacters: number;
  chunks: StructureChunk[];
  method?: "docling_hybrid_source_projection" | "source_map_blocks";
  nativeChunkCount?: number;
  nativeMaxTokens?: number;
  tokenizer?: string;
  warnings?: string[];
}

export function structureSourceUnits(map: SourceMap): StructureSourceUnit[] {
  return map.spans.map((span, index) => ({ id: `src:${index}`, start: span.start,
    end: span.end, text: map.text.slice(span.start, span.end) }));
}

export function structureChunkPrompt(map: SourceMap, chunk: Omit<StructureChunk,
  "inputHash" | "assembledInputCharacters">, units = chunk.sourceUnits ?? structureSourceUnits(map)): string {
  const wanted = new Set([...chunk.contextBefore, ...chunk.coreSourceIds, ...chunk.contextAfter]);
  const before = new Set(chunk.contextBefore), after = new Set(chunk.contextAfter);
  return JSON.stringify({ textHash: map.textHash, chunk: { chunkId: chunk.chunkId,
    ...(chunk.headingContext ? { headingContext: chunk.headingContext } : {}),
    sourceFragments: units.filter(unit => wanted.has(unit.id) && unit.fragmentOf).map(unit => ({
      id: unit.id, originalSourceId: unit.fragmentOf,
      continuesBefore: unit.continuesBefore, continuesAfter: unit.continuesAfter,
    })),
    coreRange: chunk.coreRange, contextBefore: chunk.contextBefore, contextAfter: chunk.contextAfter },
  // Compact tuples avoid spending tens of thousands of input characters repeating JSON keys.
  // Tuple layout: [sourceId, role (c=core, b=context-before, a=context-after), exact source text].
  sourceUnits: units.filter(unit => wanted.has(unit.id)).map(unit => [unit.id,
    before.has(unit.id) ? "b" : after.has(unit.id) ? "a" : "c", unit.text]) });
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function materialize(map: SourceMap, chunkId: string, core: StructureSourceUnit[],
  before: StructureSourceUnit[], after: StructureSourceUnit[], fixedCharacters: number,
  headingContext?: string[], explicitUnits = false): StructureChunk {
  const partial = { chunkId, coreRange: { start: core[0]!.start,
    end: explicitUnits ? core.at(-1)!.end :
      map.spans[Number(core.at(-1)!.id.slice("src:".length)) + 1]?.start ?? map.text.length },
    coreSourceIds: core.map(unit => unit.id), contextBefore: before.map(unit => unit.id),
    contextAfter: after.map(unit => unit.id),
    ...(explicitUnits ? { sourceUnits: [...before, ...core, ...after] } : {}),
    ...(headingContext ? { headingContext } : {}) };
  const prompt = structureChunkPrompt(map, partial);
  return { ...partial, inputHash: hash(prompt), assembledInputCharacters: fixedCharacters + prompt.length };
}

function boundaryScore(current: StructureSourceUnit, next: StructureSourceUnit | undefined): number {
  if (!next) return 1_000;
  const beginning = next.text.trimStart().slice(0, 120);
  if (/^(CHAPTER|TITLE|PART)\b/i.test(beginning)) return 550;
  if (/^(SECTION|ANNEX|SCHEDULE)\b(?:\s+(?:\d+[a-z]?|[IVXLC]+|FIRST|SECOND|THIRD|FOURTH|FIFTH))?/i
      .test(beginning)) return 500;
  if (/^(?:Article|Rule)\s+\d+[a-z]?\b/i.test(beginning)) return 450;
  if (/^\(\d+\)\s/.test(beginning)) return 400;
  if (/^(Whereas|Having regard|HAS ADOPTED)\b/i.test(beginning)) return 350;
  return /[.!?;:]\s*$/.test(current.text) ? 100 : 10;
}

/** Plans complete source-unit chunks, choosing the best boundary in the target-to-hard window. */
export function planStructureChunks(map: SourceMap, options: { targetInputCharacters: number;
  hardInputCharacters: number; fixedInputCharacters: number }): StructureChunkPlan {
  const { targetInputCharacters: target, hardInputCharacters: hard, fixedInputCharacters: fixed } = options;
  if (target < 1 || hard < target || fixed >= target) throw new Error("Invalid structure chunk character budget");
  const units = structureSourceUnits(map);
  if (!units.length) throw new Error("Cannot plan structure extraction for an empty source map");
  const cores: StructureSourceUnit[][] = [];
  for (let cursor = 0; cursor < units.length;) {
    const candidates: Array<{ end: number; characters: number; score: number }> = [];
    let lastWithinHard = cursor;
    for (let end = cursor + 1; end <= units.length; end++) {
      const candidate = materialize(map, `chunk_${String(cores.length + 1).padStart(3, "0")}`,
        units.slice(cursor, end), [], [], fixed);
      if (candidate.assembledInputCharacters > hard) break;
      lastWithinHard = end;
      if (candidate.assembledInputCharacters >= target || end === units.length) candidates.push({ end,
        characters: candidate.assembledInputCharacters, score: boundaryScore(units[end - 1]!, units[end]) });
    }
    if (lastWithinHard === cursor) {
      const unit = units[cursor]!;
      throw new Error(`Source block ${unit.id} cannot fit the ${hard}-character assembled input ceiling`);
    }
    // Prefer a document boundary in the configured window. A later boundary
    // wins only when boundary quality is equal. If the window is unreachable, use the last
    // complete source block before the ceiling rather than cutting a paragraph in half.
    const best = candidates.sort((a, b) => b.score - a.score || b.end - a.end)[0]?.end ?? lastWithinHard;
    cores.push(units.slice(cursor, best));
    cursor = best;
  }
  const chunks = cores.map((core, index) => {
    const chunkId = `chunk_${String(index + 1).padStart(3, "0")}`;
    let before: StructureSourceUnit[] = [], after: StructureSourceUnit[] = [];
    const previous = index ? cores[index - 1]!.at(-1)! : null;
    const next = index + 1 < cores.length ? cores[index + 1]![0]! : null;
    if (previous) {
      const candidate = materialize(map, chunkId, core, [previous], [], fixed);
      if (candidate.assembledInputCharacters <= hard) before = [previous];
    }
    if (next) {
      const candidate = materialize(map, chunkId, core, before, [next], fixed);
      if (candidate.assembledInputCharacters <= hard) after = [next];
    }
    const chunk = materialize(map, chunkId, core, before, after, fixed);
    if (chunk.assembledInputCharacters > hard) throw new Error(`Chunk ${chunkId} exceeds the hard input ceiling`);
    return chunk;
  });
  return { schemaVersion: 1, sourceTextHash: map.textHash, targetInputCharacters: target,
    hardInputCharacters: hard, fixedInputCharacters: fixed, method: "source_map_blocks", chunks };
}

export function splitStructureChunk(map: SourceMap, chunk: StructureChunk,
  fixedInputCharacters: number, hardInputCharacters = Number.MAX_SAFE_INTEGER): [StructureChunk, StructureChunk] {
  const units = new Map((chunk.sourceUnits ?? structureSourceUnits(map)).map(unit => [unit.id, unit]));
  const core = chunk.coreSourceIds.map(id => units.get(id)).filter((unit): unit is StructureSourceUnit => !!unit);
  if (core.length < 2) throw new Error(`Chunk ${chunk.chunkId} cannot be split at a complete source-block boundary`);
  const lower = Math.max(1, Math.floor(core.length * 0.35));
  const upper = Math.min(core.length - 1, Math.ceil(core.length * 0.65));
  let middle = Math.ceil(core.length / 2), bestScore = -1, bestDistance = Number.MAX_SAFE_INTEGER;
  for (let index = lower; index <= upper; index++) {
    const score = boundaryScore(core[index - 1]!, core[index]);
    const distance = Math.abs(index - core.length / 2);
    if (score > bestScore || score === bestScore && distance < bestDistance) {
      middle = index; bestScore = score; bestDistance = distance;
    }
  }
  const leftCore = core.slice(0, middle), rightCore = core.slice(middle);
  const fit = (id: string, owned: StructureSourceUnit[], before: StructureSourceUnit[],
    after: StructureSourceUnit[]) => {
    const make = (b: StructureSourceUnit[], a: StructureSourceUnit[]) => materialize(map, id,
      owned, b, a, fixedInputCharacters, chunk.headingContext, !!chunk.sourceUnits);
    let result = make(before, after);
    if (result.assembledInputCharacters > hardInputCharacters && after.length) {
      result = make(before, []);
    }
    if (result.assembledInputCharacters > hardInputCharacters && before.length) {
      result = make([], []);
    }
    if (result.assembledInputCharacters > hardInputCharacters) {
      throw new Error(`Split chunk ${id} exceeds the hard input ceiling`);
    }
    return result;
  };
  const left = fit(`${chunk.chunkId}a`, leftCore,
    chunk.contextBefore.map(id => units.get(id)!).filter(Boolean), [rightCore[0]!]);
  const right = fit(`${chunk.chunkId}b`, rightCore, [leftCore.at(-1)!],
    chunk.contextAfter.map(id => units.get(id)!).filter(Boolean));
  return [left, right];
}
