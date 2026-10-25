import { z } from "zod";
import { hashRevision } from "../schemas/common.js";
import type { SourceMap, SourceSpan } from "./source-map.js";
import type { StructureChunk, StructureChunkPlan } from "./structure-chunk-plan.js";

export const STRUCTURE_PROMPT_VERSION = "legal-structure-v4";
export const LLM_PROCESSING_STRATEGY = "docling_small_chunks_reconcile-v4";
// Safety limits on the source-preserving serialization, not model token counts.
export const LLM_TARGET_INPUT_CHARACTERS = 12_000;
export const LLM_MAX_INPUT_CHARACTERS = 24_000;

export const StructureProviderNameSchema = z.enum(["kanon", "llm"]);
export type StructureProviderName = z.infer<typeof StructureProviderNameSchema>;

export const StructureProviderConfigSchema = z.strictObject({
  provider: StructureProviderNameSchema,
  model: z.string().trim().min(1),
  promptVersion: z.string().trim().min(1).nullable(),
  processingStrategy: z.string().trim().min(1),
  configurationVersion: z.string().trim().min(1),
  configurationHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type StructureProviderConfig = z.infer<typeof StructureProviderConfigSchema>;

export interface TextRange { start: number; end: number }
export interface SourceLocation {
  itemRef: string;
  physicalPage: number | null;
  start: number;
  end: number;
  provenance: unknown[];
  kind: SourceSpan["kind"];
  blockType: string;
  row?: number;
  column?: number;
  rowSpan?: number;
  columnSpan?: number;
  isHeader?: boolean;
  extractionWarnings: string[];
}
export interface CandidateSegment {
  id: string;
  kind: string;
  type: string | null;
  category: string | null;
  parent: string | null;
  children: string[];
  span: TextRange;
  code: TextRange | null;
  title: TextRange | null;
  sourceSpans: SourceLocation[];
  startsBeforeChunk?: boolean;
  continuesAfterChunk?: boolean;
  parentHint?: string | null;
  reconciliation?: { basis: "matching_label_and_contiguous_source"; fragmentIds: string[] };
}
export interface CandidateReference {
  start: number;
  end: number;
  exactMention: string;
  targetSegmentIds: string[];
  sourceSpans: SourceLocation[];
  targetHint?: string | null;
  resolutionStatus?: "pending" | "resolved" | "ambiguous" | "external";
}
export interface CandidateStructure {
  schemaVersion: 1;
  textHash: string;
  provider: StructureProviderName;
  model: string;
  promptVersion: string | null;
  processingStrategy: string;
  segments: CandidateSegment[];
  references: CandidateReference[];
  unresolvedItems: string[];
  warnings: string[];
}
export interface StructureProviderUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}
export interface StructureExtractionAttempt {
  attemptId: string;
  chunk: StructureChunk;
  status: "completed" | "truncated" | "failed" | "split" | "checkpoint_reused";
  usage: StructureProviderUsage | null;
  finishReason: string | null;
  durationMs: number;
  error: string | null;
  childChunkIds: string[];
}
export interface StructureProviderResult {
  candidate: CandidateStructure;
  rawResponse: unknown;
  usage: StructureProviderUsage | null;
  durationMs: number;
  usageAccounting?: {
    status: "complete" | "partial" | "unavailable";
    attemptedCalls: number;
    callsWithUsage: number;
    includesDiscardedAttempts: boolean;
  };
}
export interface StructureChunkCheckpoint {
  checkpointSchemaVersion: 1;
  sourceTextHash: string;
  configurationHash: string;
  promptVersion: string | null;
  processingStrategy: string;
  chunk: StructureChunk;
  candidate: CandidateStructure;
  rawResponse: unknown;
  usage: StructureProviderUsage | null;
  finishReason: string | null;
  durationMs: number;
}
export interface StructureProviderCheckpoints {
  savePlan(plan: StructureChunkPlan): Promise<void>;
  loadChunk(chunk: StructureChunk): Promise<StructureChunkCheckpoint | null>;
  saveChunk(checkpoint: StructureChunkCheckpoint): Promise<void>;
  saveAttempt?(attempt: StructureExtractionAttempt): Promise<void>;
}
export interface StructureProviderInput {
  canonicalText: string;
  textHash: string;
  sourceMap: SourceMap;
  doclingDocument?: unknown;
  configuration: StructureProviderConfig;
  checkpoints?: StructureProviderCheckpoints;
  signal?: AbortSignal;
}
export interface StructureProvider {
  readonly configuration: StructureProviderConfig;
  extract(input: StructureProviderInput): Promise<StructureProviderResult>;
}

export function sourceLocations(map: SourceMap, range: TextRange): SourceLocation[] {
  return map.spans.filter(span => span.start < range.end && span.end > range.start).map(span => ({
    itemRef: span.itemRef, physicalPage: span.page,
    start: Math.max(range.start, span.start), end: Math.min(range.end, span.end),
    provenance: span.provenance, kind: span.kind, blockType: span.blockType ?? span.kind,
    extractionWarnings: span.extractionWarnings ?? [],
    ...(span.row === undefined ? {} : { row: span.row }),
    ...(span.column === undefined ? {} : { column: span.column }),
    ...(span.rowSpan === undefined ? {} : { rowSpan: span.rowSpan }),
    ...(span.columnSpan === undefined ? {} : { columnSpan: span.columnSpan }),
    ...(span.isHeader === undefined ? {} : { isHeader: span.isHeader }),
  }));
}

export function structureConfigurationHash(value: Omit<StructureProviderConfig, "configurationHash">): string {
  return hashRevision(value);
}

export function resolveStructureProviderConfig(env: NodeJS.ProcessEnv = process.env): StructureProviderConfig {
  const provider = StructureProviderNameSchema.parse((env.KB_STRUCTURE_PROVIDER ?? "kanon").trim());
  const base = provider === "kanon"
    ? { provider, model: "kanon-2-enricher", promptVersion: null,
      processingStrategy: "provider_chunk-v1", configurationVersion: "kanon-v1" }
    : { provider, model: (env.KB_STRUCTURE_LLM_MODEL ?? env.DO_LLM_REASONING_MODEL ?? "glm-5.3").trim(),
      promptVersion: STRUCTURE_PROMPT_VERSION,
      processingStrategy: LLM_PROCESSING_STRATEGY, configurationVersion: "llm-digitalocean-v3" };
  if (!base.model) throw new Error("KB_STRUCTURE_LLM_MODEL or DO_LLM_REASONING_MODEL is required when KB_STRUCTURE_PROVIDER=llm");
  return StructureProviderConfigSchema.parse({ ...base, configurationHash: structureConfigurationHash(base) });
}

export function assertProviderInput(input: StructureProviderInput): void {
  const { configurationHash, ...configuration } = input.configuration;
  if (input.canonicalText !== input.sourceMap.text || input.textHash !== input.sourceMap.textHash ||
      configurationHash !== structureConfigurationHash(configuration)) {
    throw new Error("Structure provider input does not match its source map or configuration");
  }
}
