import type { SourceMap } from "./source-map.js";
import { assertProviderInput, sourceLocations, structureConfigurationHash,
  type CandidateStructure, type StructureProvider, type StructureProviderConfig,
  type StructureProviderInput, type StructureProviderResult, type TextRange,
  type CandidateSegment } from "./structure-provider.js";

export const KANON_MODEL = "kanon-2-enricher";
export const KANON_CONFIG = Object.freeze({ model: KANON_MODEL, overflowStrategy: "chunk", schema: "ilgs@1" });

type RecordValue = Record<string, unknown>;
export interface EnrichmentClient { enrich(text: string, signal?: AbortSignal): Promise<unknown> }

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

/** Calls the official REST contract; the whole input is sent once with server-side chunking. */
export class IsaacusKanonClient implements EnrichmentClient {
  constructor(private readonly apiKey = process.env.ISAACUS_API_KEY,
    private readonly fetcher: typeof fetch = fetch) {}

  async enrich(text: string, signal?: AbortSignal): Promise<unknown> {
    if (!this.apiKey) throw new Error("ISAACUS_API_KEY is required for Kanon enrichment");
    if (!text.trim()) throw new Error("Kanon input text is empty");
    const deadline = AbortSignal.timeout(120_000);
    const response = await this.fetcher("https://api.isaacus.com/v1/enrichments", {
      method: "POST", headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: KANON_MODEL, texts: [text], overflow_strategy: "chunk" }),
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    });
    if (!response.ok) throw new Error(`Kanon enrichment failed with HTTP ${response.status}`);
    return response.json() as Promise<unknown>;
  }
}

/** Unicode code-point boundaries in UTF-16 offsets. No text normalization is allowed. */
export function codePointBoundaries(text: string): number[] {
  const boundaries = [0];
  let offset = 0;
  for (const point of text) { offset += point.length; boundaries.push(offset); }
  return boundaries;
}

/** Reject malformed/mismatched model output before any candidate is persisted. */
export function projectKanonResponse(raw: unknown, map: SourceMap): CandidateStructure {
  const results = record(raw)?.results;
  if (!Array.isArray(results) || results.length !== 1 || record(results[0])?.index !== 0) {
    throw new Error("Kanon returned an unexpected result set");
  }
  const document = record(record(results[0])?.document);
  if (!document || document.text !== map.text || document.version !== "ilgs@1") {
    throw new Error("Kanon changed the canonical text or returned a different graph version");
  }
  const boundaries = codePointBoundaries(map.text);
  const convert = (value: unknown, required: boolean): TextRange | null => {
    if (value === null && !required) return null;
    const range = record(value);
    const start = range?.start;
    const end = range?.end;
    if (typeof start !== "number" || typeof end !== "number" || !Number.isInteger(start) ||
        !Number.isInteger(end) || start < 0 || end <= start || end >= boundaries.length) {
      throw new Error("Kanon returned an invalid code-point span");
    }
    return { start: boundaries[start]!, end: boundaries[end]! };
  };
  const rawSegments = document.segments;
  if (!Array.isArray(rawSegments)) throw new Error("Kanon segments are missing");
  const warnings: string[] = [];
  const segments = rawSegments.map(value => {
    const item = record(value);
    if (!item || typeof item.id !== "string" || typeof item.kind !== "string" ||
        !Array.isArray(item.children) || !item.children.every(child => typeof child === "string")) {
      throw new Error("Kanon segment is malformed");
    }
    const span = convert(item.span, true)!;
    const sourceSpans = sourceLocations(map, span);
    if (!sourceSpans.length || sourceSpans.some(source => source.physicalPage === null)) {
      warnings.push(`Segment has uncertain PDF location: ${item.id}`);
    }
    return { id: item.id, kind: item.kind, type: typeof item.type === "string" ? item.type : null,
      category: typeof item.category === "string" ? item.category : null,
      parent: typeof item.parent === "string" ? item.parent : null,
      children: item.children as string[], span, code: convert(item.code, false),
      title: convert(item.title, false), sourceSpans } satisfies CandidateSegment;
  });
  const ids = new Set(segments.map(segment => segment.id));
  if (ids.size !== segments.length || segments.some(segment =>
    segment.parent !== null && !ids.has(segment.parent) ||
    segment.children.some(child => !ids.has(child)))) throw new Error("Kanon segment hierarchy is invalid");
  const crossreferences = document.crossreferences;
  if (!Array.isArray(crossreferences)) throw new Error("Kanon crossreferences are missing");
  const references = crossreferences.map(value => {
    const item = record(value);
    const span = convert(item?.span, true)!;
    const targets = [item?.start, item?.end].filter((id): id is string => typeof id === "string");
    if (targets.some(id => !ids.has(id))) warnings.push(`Kanon reference target is absent: ${targets.join("-")}`);
    return { ...span, exactMention: map.text.slice(span.start, span.end),
      targetSegmentIds: [...new Set(targets)], sourceSpans: sourceLocations(map, span) };
  });
  return { schemaVersion: 1, textHash: map.textHash, provider: "kanon", model: KANON_MODEL,
    promptVersion: null, processingStrategy: "provider_chunk-v1",
    segments, references, unresolvedItems: [], warnings };
}

export function kanonProviderConfiguration(): StructureProviderConfig {
  const base = { provider: "kanon" as const, model: KANON_MODEL, promptVersion: null,
    processingStrategy: "provider_chunk-v1", configurationVersion: "kanon-v1" };
  return { ...base, configurationHash: structureConfigurationHash(base) };
}

export class KanonStructureProvider implements StructureProvider {
  readonly configuration: StructureProviderConfig;
  constructor(private readonly client: EnrichmentClient,
    configuration = kanonProviderConfiguration()) {
    this.configuration = configuration;
    if (configuration.provider !== "kanon" || configuration.model !== KANON_MODEL) {
      throw new Error("Kanon provider configuration is invalid");
    }
  }

  async extract(input: StructureProviderInput): Promise<StructureProviderResult> {
    assertProviderInput(input);
    if (input.configuration.configurationHash !== this.configuration.configurationHash) {
      throw new Error("Kanon job configuration does not match this provider");
    }
    const started = Date.now();
    const rawResponse = await this.client.enrich(input.canonicalText, input.signal);
    const candidate = projectKanonResponse(rawResponse, input.sourceMap);
    const usageValue = record(rawResponse)?.usage;
    const usage = record(usageValue);
    const tokens = typeof usage?.input_tokens === "number" ? usage.input_tokens : null;
    return { candidate, rawResponse, durationMs: Date.now() - started,
      usage: usage ? { inputTokens: tokens, outputTokens: null, totalTokens: tokens } : null,
      usageAccounting: { status: usage ? "partial" : "unavailable", attemptedCalls: 1,
        callsWithUsage: usage ? 1 : 0, includesDiscardedAttempts: true } };
  }
}
