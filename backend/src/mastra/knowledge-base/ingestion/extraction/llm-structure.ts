import { z } from "zod";
import type { SourceMap } from "./source-map.js";
import { LLM_MAX_INPUT_CHARACTERS, STRUCTURE_PROMPT_VERSION, assertProviderInput,
  sourceLocations, type CandidateStructure, type StructureProvider,
  type StructureProviderConfig, type StructureProviderInput, type StructureProviderResult,
  type TextRange } from "./structure-provider.js";

const AnchorSchema = z.strictObject({
  sourceId: z.string().min(1).max(200), exactQuote: z.string().min(1).max(200_000),
  occurrence: z.number().int().nonnegative().default(0),
});
const SegmentSchema = z.strictObject({
  id: z.string().min(1), kind: z.enum(["container", "unit", "item", "figure"]),
  type: z.string().nullable(), category: z.string().nullable(), parent: z.string().nullable(),
  sourceAnchors: z.array(AnchorSchema).min(1), codeAnchor: AnchorSchema.nullable(),
  titleAnchor: AnchorSchema.nullable(),
});
const ReferenceSchema = z.strictObject({
  mention: AnchorSchema, targetSegmentIds: z.array(z.string().min(1)),
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
        titleAnchor: { anyOf: [{ $ref: "#/$defs/anchor" }, { type: "null" }] } } } },
    references: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["mention", "targetSegmentIds"], properties: { mention: { $ref: "#/$defs/anchor" },
        targetSegmentIds: { type: "array", items: { type: "string" } } } } },
    unresolvedItems: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
  },
  $defs: { anchor: { type: "object", additionalProperties: false,
    required: ["sourceId", "exactQuote", "occurrence"], properties: {
      sourceId: { type: "string" }, exactQuote: { type: "string" },
      occurrence: { type: "integer", minimum: 0 } } } },
} as const;

export interface LlmStructureCompletion {
  output: unknown;
  rawResponse: unknown;
  usage: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null } | null;
}
export interface LlmStructureClient {
  generate(input: { model: string; systemInstruction: string; prompt: string;
    responseSchema: unknown; signal?: AbortSignal }): Promise<LlmStructureCompletion>;
}

type SourceUnit = { id: string; start: number; end: number; text: string };

function sourceUnits(map: SourceMap): SourceUnit[] {
  return map.spans.map((span, index) => ({ id: `src:${index}`, start: span.start,
    end: span.end, text: map.text.slice(span.start, span.end) }));
}

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

function normalize(raw: unknown, map: SourceMap, configuration: StructureProviderConfig): CandidateStructure {
  const parsed = LlmOutputSchema.parse(raw);
  const units = new Map(sourceUnits(map).map(unit => [unit.id, unit]));
  const ids = new Set(parsed.segments.map(segment => segment.id));
  if (ids.size !== parsed.segments.length) throw new Error("LLM returned duplicate segment IDs");
  const children = new Map<string, string[]>();
  for (const segment of parsed.segments) {
    if (segment.parent && !ids.has(segment.parent)) throw new Error(`LLM returned unknown parent: ${segment.parent}`);
    if (segment.parent) children.set(segment.parent, [...(children.get(segment.parent) ?? []), segment.id]);
  }
  const segments = parsed.segments.map(segment => {
    const anchors = segment.sourceAnchors.map(anchor => locate(anchor, units));
    const start = Math.min(...anchors.map(anchor => anchor.start));
    const end = Math.max(...anchors.map(anchor => anchor.end));
    const span = { start, end };
    return { id: segment.id, kind: segment.kind, type: segment.type, category: segment.category,
      parent: segment.parent, children: children.get(segment.id) ?? [], span,
      code: segment.codeAnchor ? locate(segment.codeAnchor, units) : null,
      title: segment.titleAnchor ? locate(segment.titleAnchor, units) : null,
      sourceSpans: sourceLocations(map, span) };
  });
  const references = parsed.references.map(reference => {
    if (reference.targetSegmentIds.some(id => !ids.has(id))) {
      throw new Error("LLM reference points to an unknown segment");
    }
    const span = locate(reference.mention, units);
    return { ...span, exactMention: map.text.slice(span.start, span.end),
      targetSegmentIds: [...new Set(reference.targetSegmentIds)], sourceSpans: sourceLocations(map, span) };
  });
  return { schemaVersion: 1, textHash: map.textHash, provider: "llm", model: configuration.model,
    promptVersion: configuration.promptVersion, processingStrategy: configuration.processingStrategy,
    segments, references, unresolvedItems: parsed.unresolvedItems, warnings: parsed.warnings };
}

export function buildStructurePrompt(map: SourceMap): string {
  const material = sourceUnits(map).map(unit => ({ sourceId: unit.id, text: unit.text }));
  return JSON.stringify({ textHash: map.textHash, sourceUnits: material });
}

export const LLM_STRUCTURE_SYSTEM_PROMPT = `You extract legal document structure only.
Return provisions and hierarchy, original labels, explicit reference mentions, possible targets,
and uncertainty. Every boundary must use supplied sourceId and an exactQuote copied verbatim.
Use occurrence=0 for the first exact match within that source unit. Do not infer obligations,
proof standards, compliance conclusions, drafting guidance, or legal advice. Do not invent source IDs.
Record unclassified material in unresolvedItems. The output must follow the supplied JSON schema.`;

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
    const prompt = buildStructurePrompt(input.sourceMap);
    if (prompt.length > LLM_MAX_INPUT_CHARACTERS) {
      throw new Error(`LLM structure input exceeds ${LLM_MAX_INPUT_CHARACTERS} characters; ` +
        "the recorded strategy rejects oversized documents until a document-wide reconciliation pass is configured");
    }
    const started = Date.now();
    const response = await this.client.generate({ model: this.configuration.model,
      systemInstruction: LLM_STRUCTURE_SYSTEM_PROMPT, prompt,
      responseSchema: LLM_STRUCTURE_RESPONSE_SCHEMA, signal: input.signal });
    const candidate = normalize(response.output, input.sourceMap, this.configuration);
    return { candidate, rawResponse: response.rawResponse, usage: response.usage,
      durationMs: Date.now() - started };
  }
}

export class GeminiStructureClient implements LlmStructureClient {
  constructor(private readonly apiKey = process.env.GOOGLE_GEMINI_EXTERNAL_KEY ?? process.env.GEMINI_API_KEY,
    private readonly fetcher: typeof fetch = fetch) {}

  async generate(input: { model: string; systemInstruction: string; prompt: string;
    responseSchema: unknown; signal?: AbortSignal }): Promise<LlmStructureCompletion> {
    if (!this.apiKey?.trim()) throw new Error("GOOGLE_GEMINI_EXTERNAL_KEY is required for LLM structure extraction");
    const deadline = AbortSignal.timeout(120_000);
    const response = await this.fetcher(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: input.systemInstruction }] },
          contents: [{ role: "user", parts: [{ text: input.prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json",
            responseJsonSchema: input.responseSchema } }),
        signal: input.signal ? AbortSignal.any([input.signal, deadline]) : deadline,
      });
    if (!response.ok) throw new Error(`Gemini structure extraction failed with HTTP ${response.status}`);
    const rawResponse = await response.json() as Record<string, unknown>;
    const candidates = rawResponse.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
    const text = candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("") ?? "";
    if (!text) throw new Error("Gemini returned no structured extraction output");
    if (text.length > 10_000_000) throw new Error("Gemini structure output exceeds the 10 MB character limit");
    let output: unknown;
    try { output = JSON.parse(text); }
    catch { throw new Error("Gemini returned invalid JSON for structure extraction"); }
    const metadata = rawResponse.usageMetadata as { promptTokenCount?: number;
      candidatesTokenCount?: number; totalTokenCount?: number } | undefined;
    return { output, rawResponse, usage: metadata ? {
      inputTokens: metadata.promptTokenCount ?? null,
      outputTokens: metadata.candidatesTokenCount ?? null,
      totalTokens: metadata.totalTokenCount ?? null,
    } : null };
  }
}
