import { z } from "zod";
import { hashRevision } from "../schemas/common.js";
import type { SourceMap, SourceSpan } from "./source-map.js";

export const STRUCTURE_PROMPT_VERSION = "legal-structure-v1";
export const LLM_PROCESSING_STRATEGY = "single_pass_reject_oversize-v1";
export const LLM_MAX_INPUT_CHARACTERS = 200_000;

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
  row?: number;
  column?: number;
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
}
export interface CandidateReference {
  start: number;
  end: number;
  exactMention: string;
  targetSegmentIds: string[];
  sourceSpans: SourceLocation[];
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
export interface StructureProviderResult {
  candidate: CandidateStructure;
  rawResponse: unknown;
  usage: StructureProviderUsage | null;
  durationMs: number;
}
export interface StructureProviderInput {
  canonicalText: string;
  textHash: string;
  sourceMap: SourceMap;
  configuration: StructureProviderConfig;
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
    provenance: span.provenance, kind: span.kind,
    ...(span.row === undefined ? {} : { row: span.row }),
    ...(span.column === undefined ? {} : { column: span.column }),
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
    : { provider, model: (env.KB_STRUCTURE_LLM_MODEL ?? "").trim(),
      promptVersion: STRUCTURE_PROMPT_VERSION,
      processingStrategy: LLM_PROCESSING_STRATEGY, configurationVersion: "llm-gemini-v1" };
  if (!base.model) throw new Error("KB_STRUCTURE_LLM_MODEL is required when KB_STRUCTURE_PROVIDER=llm");
  return StructureProviderConfigSchema.parse({ ...base, configurationHash: structureConfigurationHash(base) });
}

export function assertProviderInput(input: StructureProviderInput): void {
  const { configurationHash, ...configuration } = input.configuration;
  if (input.canonicalText !== input.sourceMap.text || input.textHash !== input.sourceMap.textHash ||
      configurationHash !== structureConfigurationHash(configuration)) {
    throw new Error("Structure provider input does not match its source map or configuration");
  }
}
