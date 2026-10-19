import { z } from "zod";
import type { SourceMap } from "./source-map.js";
import { LLM_MAX_INPUT_CHARACTERS, LLM_TARGET_INPUT_CHARACTERS, STRUCTURE_PROMPT_VERSION, assertProviderInput,
  sourceLocations, type CandidateStructure, type StructureProvider,
  type StructureChunkCheckpoint, type StructureProviderConfig, type StructureProviderInput, type StructureProviderResult,
  type TextRange } from "./structure-provider.js";
import { planStructureChunks, splitStructureChunk, structureChunkPrompt, structureSourceUnits,
  type StructureChunk } from "./structure-chunk-plan.js";

const AnchorSchema = z.strictObject({
  sourceId: z.string().min(1).max(200), exactQuote: z.string().min(1).max(500),
  occurrence: z.number().int().nonnegative().default(0),
});
const SegmentSchema = z.strictObject({
  id: z.string().min(1), kind: z.enum(["container", "unit", "item", "figure"]),
  type: z.string().nullable(), category: z.string().nullable(), parent: z.string().nullable(),
  sourceAnchors: z.array(AnchorSchema).min(1), codeAnchor: AnchorSchema.nullable(),
  titleAnchor: AnchorSchema.nullable(),
  startsBeforeChunk: z.boolean().optional(), continuesAfterChunk: z.boolean().optional(),
  parentHint: z.string().max(500).nullable().optional(),
});
const ReferenceSchema = z.strictObject({
  mention: AnchorSchema, targetSegmentIds: z.array(z.string().min(1)),
  targetHint: z.string().max(500).nullable().optional(),
  resolutionStatus: z.enum(["pending", "resolved", "ambiguous", "external"]).optional(),
});
const LlmOutputSchema = z.strictObject({
  segments: z.array(SegmentSchema).max(50_000), references: z.array(ReferenceSchema).max(50_000),
  unresolvedItems: z.array(z.string().max(10_000)).max(50_000),
  warnings: z.array(z.string().max(10_000)).max(50_000),
});
type LlmOutput = z.infer<typeof LlmOutputSchema>;

export const LLM_STRUCTURE_RESPONSE_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["segments", "references", "unresolvedItems", "warnings"],
  properties: {
    segments: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["id", "kind", "type", "category", "parent", "sourceAnchors", "codeAnchor", "titleAnchor"],
      properties: { id: { type: "string" }, kind: { type: "string", enum: ["container", "unit", "item", "figure"] },
        type: { type: ["string", "null"] }, category: { type: ["string", "null"] },
        parent: { type: ["string", "null"] }, sourceAnchors: { type: "array", minItems: 1,
          items: { $ref: "#/$defs/anchor" } }, codeAnchor: { anyOf: [{ $ref: "#/$defs/anchor" }, { type: "null" }] },
        titleAnchor: { anyOf: [{ $ref: "#/$defs/anchor" }, { type: "null" }] },
        startsBeforeChunk: { type: "boolean" }, continuesAfterChunk: { type: "boolean" },
        parentHint: { type: ["string", "null"], maxLength: 500 } } } },
    references: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["mention", "targetSegmentIds"], properties: { mention: { $ref: "#/$defs/anchor" },
        targetSegmentIds: { type: "array", items: { type: "string" } },
        targetHint: { type: ["string", "null"], maxLength: 500 },
        resolutionStatus: { type: "string", enum: ["pending", "resolved", "ambiguous", "external"] } } } },
    unresolvedItems: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
  },
  $defs: { anchor: { type: "object", additionalProperties: false,
    required: ["sourceId", "exactQuote", "occurrence"], properties: {
      sourceId: { type: "string", maxLength: 200 }, exactQuote: { type: "string", maxLength: 500 },
      occurrence: { type: "integer", minimum: 0 } } } },
} as const;

export interface LlmStructureCompletion {
  output: unknown;
  rawResponse: unknown;
  finishReason?: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null } | null;
}
export interface LlmStructureClient {
  generate(input: { model: string; systemInstruction: string; prompt: string;
    responseSchema: unknown; signal?: AbortSignal }): Promise<LlmStructureCompletion>;
}
type SourceUnit = ReturnType<typeof structureSourceUnits>[number];

function locate(anchor: z.infer<typeof AnchorSchema>, units: Map<string, SourceUnit>): TextRange {
  const unit = units.get(anchor.sourceId);
  if (!unit) throw new Error(`LLM invented source ID: ${anchor.sourceId}`);
  let from = 0;
  let index = -1;
  for (let occurrence = 0; occurrence <= anchor.occurrence; occurrence++) {
    index = unit.text.indexOf(anchor.exactQuote, from);
    if (index < 0) throw new Error(`LLM quote is absent or occurrence is invalid: ${anchor.sourceId}`);
    from = index + Math.max(1, anchor.exactQuote.length);
  }
  return { start: unit.start + index, end: unit.start + index + anchor.exactQuote.length };
}

function normalize(raw: unknown, map: SourceMap, configuration: StructureProviderConfig,
  chunk: StructureChunk): CandidateStructure {
  const parsed = LlmOutputSchema.parse(raw);
  const includedIds = new Set([...chunk.contextBefore, ...chunk.coreSourceIds, ...chunk.contextAfter]);
  const coreIds = new Set(chunk.coreSourceIds);
  const units = new Map(structureSourceUnits(map).filter(unit => includedIds.has(unit.id)).map(unit => [unit.id, unit]));
  const ids = new Set(parsed.segments.map(segment => segment.id));
  if (ids.size !== parsed.segments.length) throw new Error("LLM returned duplicate segment IDs");
  const children = new Map<string, string[]>();
  for (const segment of parsed.segments) {
    if (segment.parent && !ids.has(segment.parent)) throw new Error(`LLM returned unknown parent: ${segment.parent}`);
    if (segment.parent) children.set(segment.parent, [...(children.get(segment.parent) ?? []), segment.id]);
  }
  const segments = parsed.segments.map(segment => {
    const anchors = segment.sourceAnchors.map(anchor => locate(anchor, units));
    if (!segment.sourceAnchors.some(anchor => coreIds.has(anchor.sourceId))) {
      throw new Error(`LLM returned a context-only segment in ${chunk.chunkId}: ${segment.id}`);
    }
    const start = Math.min(...anchors.map(anchor => anchor.start));
    const end = Math.max(...anchors.map(anchor => anchor.end));
    const span = { start, end };
    return { id: segment.id, kind: segment.kind, type: segment.type, category: segment.category,
      parent: segment.parent, children: children.get(segment.id) ?? [], span,
      code: segment.codeAnchor ? locate(segment.codeAnchor, units) : null,
      title: segment.titleAnchor ? locate(segment.titleAnchor, units) : null,
      sourceSpans: sourceLocations(map, span), startsBeforeChunk: segment.startsBeforeChunk,
      continuesAfterChunk: segment.continuesAfterChunk, parentHint: segment.parentHint };
  });
  const references = parsed.references.map(reference => {
    if (reference.targetSegmentIds.some(id => !ids.has(id))) {
      throw new Error("LLM reference points to an unknown segment");
    }
    const span = locate(reference.mention, units);
    if (!coreIds.has(reference.mention.sourceId)) {
      throw new Error(`LLM returned a context-only reference in ${chunk.chunkId}`);
    }
    return { ...span, exactMention: map.text.slice(span.start, span.end),
      targetSegmentIds: [...new Set(reference.targetSegmentIds)], sourceSpans: sourceLocations(map, span),
      targetHint: reference.targetHint, resolutionStatus: reference.resolutionStatus };
  });
  return { schemaVersion: 1, textHash: map.textHash, provider: "llm", model: configuration.model,
    promptVersion: configuration.promptVersion, processingStrategy: configuration.processingStrategy,
    segments, references, unresolvedItems: parsed.unresolvedItems, warnings: parsed.warnings };
}

export function buildStructurePrompt(map: SourceMap, chunk?: StructureChunk): string {
  if (chunk) return structureChunkPrompt(map, chunk);
  const units = structureSourceUnits(map);
  const complete: StructureChunk = { chunkId: "chunk_001", inputHash: "", coreRange: { start: 0, end: map.text.length },
    coreSourceIds: units.map(unit => unit.id), contextBefore: [], contextAfter: [], assembledInputCharacters: 0 };
  return structureChunkPrompt(map, complete);
}

export const LLM_STRUCTURE_SYSTEM_PROMPT = `You extract legal document structure only.
Each supplied sourceUnits tuple is [sourceId, role, exactText], where role c means core,
b means context before, and a means context after.
Return provisions and hierarchy, original labels, explicit reference mentions, possible targets,
and uncertainty. Extract only structures whose boundary anchors include a source unit marked core;
neighboring context is interpretation support and must not be emitted on its own.
Every boundary must use supplied sourceId and a short exactQuote copied verbatim (500 characters maximum).
Use occurrence=0 for the first exact match within that source unit. Do not infer obligations,
proof standards, compliance conclusions, drafting guidance, or legal advice. Do not invent source IDs.
Recognize chapters, sections, articles, rules, paragraphs, list points, recitals, definitions,
schedules, annexes, tables, footnotes, exceptions and explanatory material. If a structure does not
fit a known legal type, return its observed type or unknown and preserve it for review; never force it
into a familiar category. Preserve parent relationships because child wording may inherit conditions.
Report every explicit reference mention, including relative references and references to external laws.
Use startsBeforeChunk, continuesAfterChunk, parentHint, targetHint and resolutionStatus when a
structure or reference crosses the supplied core range. Unknown or later targets are valid pending results.
Record unclassified material in unresolvedItems. The output must follow the supplied JSON schema.`;

export class StructureOutputTruncatedError extends Error {
  constructor(message = "Structure model output was truncated") { super(message); this.name = "StructureOutputTruncatedError"; }
}

function mergeCandidates(map: SourceMap, configuration: StructureProviderConfig,
  chunks: Array<{ chunk: StructureChunk; candidate: CandidateStructure }>): CandidateStructure {
  const segments: CandidateStructure["segments"] = [];
  const references: CandidateStructure["references"] = [];
  const unresolvedItems: string[] = [], warnings: string[] = [];
  const ids = new Map<string, string>();
  for (const { chunk, candidate } of chunks) {
    const prefix = `${chunk.chunkId}:`;
    for (const segment of candidate.segments) ids.set(`${chunk.chunkId}\0${segment.id}`, `${prefix}${segment.id}`);
    for (const segment of candidate.segments) segments.push({ ...segment, id: ids.get(`${chunk.chunkId}\0${segment.id}`)!,
      parent: segment.parent ? ids.get(`${chunk.chunkId}\0${segment.parent}`) ?? null : null,
      children: segment.children.map(id => ids.get(`${chunk.chunkId}\0${id}`)!).filter(Boolean) });
    for (const reference of candidate.references) references.push({ ...reference,
      targetSegmentIds: reference.targetSegmentIds.map(id => ids.get(`${chunk.chunkId}\0${id}`)!).filter(Boolean) });
    unresolvedItems.push(...candidate.unresolvedItems.map(item => `${chunk.chunkId}: ${item}`));
    warnings.push(...candidate.warnings.map(item => `${chunk.chunkId}: ${item}`));
  }
  const unique = new Map<string, typeof segments[number]>();
  const redirects = new Map<string, string>();
  for (const segment of segments) {
    const key = JSON.stringify([segment.kind, segment.type, segment.category, segment.span.start, segment.span.end]);
    const existing = unique.get(key);
    if (existing) redirects.set(segment.id, existing.id); else unique.set(key, segment);
  }
  let finalSegments = [...unique.values()].map(segment => ({ ...segment,
    parent: segment.parent ? redirects.get(segment.parent) ?? segment.parent : null,
    children: [...new Set(segment.children.map(id => redirects.get(id) ?? id))] }));
  const normalized = (value: string) => value.toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
  const label = (segment: typeof finalSegments[number]) => {
    const range = segment.code ?? segment.title;
    return range ? normalized(map.text.slice(range.start, range.end)) : "";
  };
  finalSegments = finalSegments.map(segment => {
    if (segment.parent || !segment.parentHint) return segment;
    const hint = normalized(segment.parentHint);
    const matches = finalSegments.filter(candidate => candidate.id !== segment.id &&
      ["container", "chapter", "section", "title", "part"].includes(candidate.type ?? candidate.kind) &&
      label(candidate) === hint && candidate.span.start < segment.span.start)
      .sort((a, b) => b.span.start - a.span.start);
    if (matches.length === 1) return { ...segment, parent: matches[0]!.id };
    warnings.push(`${segment.id}: unresolved parent hint ${segment.parentHint}`);
    return segment;
  });
  const childIds = new Map<string, string[]>();
  for (const segment of finalSegments) if (segment.parent) {
    childIds.set(segment.parent, [...(childIds.get(segment.parent) ?? []), segment.id]);
  }
  finalSegments = finalSegments.map(segment => ({ ...segment,
    children: [...new Set([...(segment.children ?? []), ...(childIds.get(segment.id) ?? [])])] }));
  const finalIds = new Set(finalSegments.map(segment => segment.id));
  const finalReferences = references.map(reference => {
    let targets = [...new Set(reference.targetSegmentIds.map(id => redirects.get(id) ?? id)
      .filter(id => finalIds.has(id)))];
    if (!targets.length && reference.targetHint && reference.resolutionStatus !== "external") {
      const hint = normalized(reference.targetHint);
      const matches = finalSegments.filter(segment => label(segment) === hint);
      if (matches.length === 1) targets = [matches[0]!.id];
      else if (matches.length > 1) reference = { ...reference, resolutionStatus: "ambiguous" };
    }
    return { ...reference, targetSegmentIds: targets,
      resolutionStatus: targets.length ? "resolved" as const : reference.resolutionStatus ?? "pending" as const };
  });
  return { schemaVersion: 1, textHash: map.textHash, provider: "llm", model: configuration.model,
    promptVersion: configuration.promptVersion, processingStrategy: configuration.processingStrategy,
    segments: finalSegments, references: finalReferences, unresolvedItems, warnings };
}

export class LlmStructureProvider implements StructureProvider {
  constructor(readonly configuration: StructureProviderConfig,
    private readonly client: LlmStructureClient) {
    if (configuration.provider !== "llm" || configuration.promptVersion !== STRUCTURE_PROMPT_VERSION) {
      throw new Error("LLM structure provider configuration is invalid");
    }
  }

  async extract(input: StructureProviderInput): Promise<StructureProviderResult> {
    assertProviderInput(input);
    if (input.configuration.configurationHash !== this.configuration.configurationHash) {
      throw new Error("LLM job configuration does not match this provider");
    }
    const fixedInputCharacters = LLM_STRUCTURE_SYSTEM_PROMPT.length + JSON.stringify(LLM_STRUCTURE_RESPONSE_SCHEMA).length;
    const plan = planStructureChunks(input.sourceMap, { targetInputCharacters: LLM_TARGET_INPUT_CHARACTERS,
      hardInputCharacters: LLM_MAX_INPUT_CHARACTERS, fixedInputCharacters });
    await input.checkpoints?.savePlan(plan);
    process.stdout.write(`      ✓ Structure plan: ${plan.chunks.length} chunk(s) created (target <= ${LLM_MAX_INPUT_CHARACTERS.toLocaleString()} chars)\n`);
    const started = Date.now();
    const completed: StructureChunkCheckpoint[] = [];
    let chunkIndex = 0;
    const extractChunk = async (chunk: StructureChunk): Promise<void> => {
      chunkIndex++;
      const prompt = buildStructurePrompt(input.sourceMap, chunk);
      if (fixedInputCharacters + prompt.length > LLM_MAX_INPUT_CHARACTERS) {
        throw new Error(`Assembled structure input ${chunk.chunkId} exceeds ${LLM_MAX_INPUT_CHARACTERS} characters`);
      }
      try {
        const cached = await input.checkpoints?.loadChunk(chunk);
        if (cached) {
          process.stdout.write(`      ✓ Chunk ${chunk.chunkId} loaded from checkpoint cache (reused completed extraction)\n`);
          completed.push(cached);
          return;
        }
        const chunkStarted = Date.now();
        process.stdout.write(`      → Calling model for chunk ${chunk.chunkId} (${chunk.assembledInputCharacters.toLocaleString()} chars)... (waiting for LLM response)\n`);
        const response = await this.client.generate({ model: this.configuration.model,
          systemInstruction: LLM_STRUCTURE_SYSTEM_PROMPT, prompt,
          responseSchema: LLM_STRUCTURE_RESPONSE_SCHEMA, signal: input.signal });
        if (response.finishReason?.toLowerCase() === "length") throw new StructureOutputTruncatedError();
        const checkpoint: StructureChunkCheckpoint = { chunk,
          candidate: normalize(response.output, input.sourceMap, this.configuration, chunk),
          rawResponse: response.rawResponse, usage: response.usage,
          finishReason: response.finishReason ?? null, durationMs: Date.now() - chunkStarted };
        await input.checkpoints?.saveChunk(checkpoint);
        completed.push(checkpoint);
        process.stdout.write(`      ✓ Chunk ${chunk.chunkId} completed in ${((Date.now() - chunkStarted) / 1000).toFixed(1)}s\n`);
      } catch (error) {
        if (!(error instanceof StructureOutputTruncatedError)) throw error;
        process.stdout.write(`      ⚠ Chunk ${chunk.chunkId} output truncated; splitting chunk...\n`);
        const children = splitStructureChunk(input.sourceMap, chunk, fixedInputCharacters,
          LLM_MAX_INPUT_CHARACTERS);
        for (const child of children) await extractChunk(child);
      }
    };
    for (const chunk of plan.chunks) await extractChunk(chunk);
    const usageRows = completed.map(row => row.usage).filter((row): row is NonNullable<typeof row> => !!row);
    const sum = (key: "inputTokens" | "outputTokens" | "totalTokens") =>
      usageRows.some(row => row[key] === null) ? null : usageRows.reduce((total, row) => total + row[key]!, 0);
    const candidate = mergeCandidates(input.sourceMap, this.configuration, completed);
    return { candidate, rawResponse: { chunkPlan: plan, chunks: completed.map(row => ({ chunk: row.chunk,
      rawResponse: row.rawResponse, finishReason: row.finishReason })) },
    usage: usageRows.length ? { inputTokens: sum("inputTokens"), outputTokens: sum("outputTokens"),
      totalTokens: sum("totalTokens") } : null, durationMs: Date.now() - started };
  }
}
