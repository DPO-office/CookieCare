import { GenerateContentConfig } from "@google/genai";

/**
 * 1. UNIFIED HARDWARE TIERS
 * Explicit catalog of production-approved models.
 */
export enum GeminiModel {
  GEMINI_2_5_FLASH = "gemini-2.5-flash",
  GEMINI_2_5_PRO = "gemini-2.5-pro",
}

/** Native output dimensionality of GEMINI_EMBEDDING_MODEL — matches legal_document_chunks.embedding vector(768). */
export const GEMINI_EMBEDDING_DIMENSIONS = 768;

/** Text embedding model — separate quota lane from chat/JSON generation models above. */
export const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";

export enum OpenRouterModel {
  LLAMA_3_3_70B = "meta-llama/llama-3.3-70b-instruct",
  CLAUDE_3_5_SONNET = "anthropic/claude-3.5-sonnet",
  GPT_4O_MINI = "openai/gpt-4o-mini",
}

/**
 * 2. CORE BUSINESS ARCHITECTURE INTENTS
 * Semantic task enums requested by backend handlers.
 */
export enum LLMTask {
  FAST_STITCH = "FAST_STITCH",
  COMPLEX_DRAFT = "COMPLEX_DRAFT",
  STRUCTURAL_JSON = "STRUCTURAL_JSON",
  REFINEMENT = "REFINEMENT",
  STRUCTURAL_JSON_LITE = "STRUCTURAL_JSON_LITE",
  SECTION_REFINE = "SECTION_REFINE",
  /** PAC: requirement / fact extraction (fast tier) */
  EXTRACT_FACTS = "EXTRACT_FACTS",
  /** PAC: gap detection adjacent to deterministic rules (fast tier) */
  DETECT_GAPS = "DETECT_GAPS",
  /** PAC: checklist critique quality gate (strongest reasoning) */
  CRITIQUE_CHECKLIST = "CRITIQUE_CHECKLIST",
  /** Compliance verification judge (deliberate reasoning, fast tier) */
  VERIFY_COMPLIANCE = "VERIFY_COMPLIANCE",
}

export enum LLMProvider {
  GEMINI = "GEMINI",
  OPENROUTER = "OPENROUTER",
}

export type GeminiThinkingLevel = "minimal" | "low" | "medium" | "high";

/**
 * 3. RUNTIME PARAMETER MATRIX
 */
export interface TaskModelConfig {
  model: string;
  temperature: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: any;
  /**
   * Gemini 2.5 thinking budget (token count). Prefer setting this per task:
   * - 0  → no thinking (extraction, gaps, section draft)
   * - >0 → thinking enabled (critique / heavy reasoning)
   * If omitted, provider falls back to model default (Flash=0, Pro=1024).
   */
  thinkingBudget?: number;
  /** Optional thinking level. */
  thinkingLevel?: GeminiThinkingLevel;
  /** Optional client-side cancellation for a bounded runtime call. */
  abortSignal?: AbortSignal;
}

export interface LLMTaskPreset {
  primaryModel: string;
  fallbackModel: string;
  timeoutMs: number;
  config: Partial<GenerateContentConfig> & Record<string, any>;
}

/**
 * 4. SYSTEM TASK CONFIGURATIONS REGISTRY
 */
export const PROVIDER_TASK_PRESETS: Record<LLMProvider, Record<LLMTask, TaskModelConfig>> = {
  [LLMProvider.GEMINI]: {
    [LLMTask.FAST_STITCH]: {
      model: GeminiModel.GEMINI_2_5_FLASH,
      temperature: 0.1,
      thinkingBudget: 0,
    },
    [LLMTask.COMPLEX_DRAFT]: {
      model: GeminiModel.GEMINI_2_5_PRO,
      temperature: 0.0,
      maxOutputTokens: 4096,
      thinkingBudget: 1024,
    },
    [LLMTask.STRUCTURAL_JSON]: {
      model: GeminiModel.GEMINI_2_5_FLASH,
      temperature: 0.0,
      responseMimeType: "application/json",
      thinkingBudget: 0,
    },
    [LLMTask.STRUCTURAL_JSON_LITE]: {
      model: GeminiModel.GEMINI_2_5_FLASH,
      temperature: 0.0,
      responseMimeType: "application/json",
      thinkingBudget: 0,
    },
    [LLMTask.REFINEMENT]: {
      model: GeminiModel.GEMINI_2_5_FLASH,
      temperature: 0.2,
      thinkingBudget: 0,
    },
    [LLMTask.SECTION_REFINE]: {
      // Surgical single-section regeneration: Gemini Pro for high-tier legal prose quality.
      model: GeminiModel.GEMINI_2_5_PRO,
      temperature: 0.0,
      maxOutputTokens: 2048,
      thinkingBudget: 512,
    },
    [LLMTask.EXTRACT_FACTS]: {
      model: GeminiModel.GEMINI_2_5_FLASH,
      temperature: 0.0,
      responseMimeType: "application/json",
      thinkingBudget: 0,
    },
    [LLMTask.DETECT_GAPS]: {
      model: GeminiModel.GEMINI_2_5_FLASH,
      temperature: 0.0,
      responseMimeType: "application/json",
      thinkingBudget: 0,
    },
    [LLMTask.CRITIQUE_CHECKLIST]: {
      model: GeminiModel.GEMINI_2_5_PRO,
      temperature: 0.0,
      responseMimeType: "application/json",
      maxOutputTokens: 4096,
      thinkingBudget: 1024,
    },
    [LLMTask.VERIFY_COMPLIANCE]: {
      model: GeminiModel.GEMINI_2_5_FLASH,
      temperature: 0.0,
      responseMimeType: "application/json",
      thinkingBudget: 0,
    },
  },
  [LLMProvider.OPENROUTER]: {
    [LLMTask.FAST_STITCH]: {
      model: OpenRouterModel.LLAMA_3_3_70B,
      temperature: 0.1,
    },
    [LLMTask.COMPLEX_DRAFT]: {
      model: OpenRouterModel.CLAUDE_3_5_SONNET,
      temperature: 0.0,
    },
    [LLMTask.STRUCTURAL_JSON]: {
      model: OpenRouterModel.GPT_4O_MINI,
      temperature: 0.0,
      responseMimeType: "application/json",
    },
    [LLMTask.STRUCTURAL_JSON_LITE]: {
      model: OpenRouterModel.CLAUDE_3_5_SONNET,
      temperature: 0.0,
      responseMimeType: "application/json",
    },
    [LLMTask.REFINEMENT]: {
      model: OpenRouterModel.LLAMA_3_3_70B,
      temperature: 0.2,
    },
    [LLMTask.SECTION_REFINE]: {
      model: OpenRouterModel.CLAUDE_3_5_SONNET,
      temperature: 0.0,
      maxOutputTokens: 2048,
    },
    [LLMTask.EXTRACT_FACTS]: {
      model: OpenRouterModel.GPT_4O_MINI,
      temperature: 0.0,
      responseMimeType: "application/json",
    },
    [LLMTask.DETECT_GAPS]: {
      model: OpenRouterModel.GPT_4O_MINI,
      temperature: 0.0,
      responseMimeType: "application/json",
    },
    [LLMTask.CRITIQUE_CHECKLIST]: {
      model: OpenRouterModel.CLAUDE_3_5_SONNET,
      temperature: 0.0,
      responseMimeType: "application/json",
      maxOutputTokens: 4096,
    },
    [LLMTask.VERIFY_COMPLIANCE]: {
      model: OpenRouterModel.CLAUDE_3_5_SONNET,
      temperature: 0.0,
      responseMimeType: "application/json",
    },
  },
};

const DEFAULT_OUTPUT_TOKEN_CEILING = 8192;

const MODEL_OUTPUT_TOKEN_CEILINGS: Record<string, number> = {
  [GeminiModel.GEMINI_2_5_FLASH]: 65535,
  [GeminiModel.GEMINI_2_5_PRO]: 65535,
  [OpenRouterModel.CLAUDE_3_5_SONNET]: 8192,
  [OpenRouterModel.LLAMA_3_3_70B]: 8192,
  [OpenRouterModel.GPT_4O_MINI]: 16384,
};

export function resolveOutputTokenCeiling(model: string): number {
  return MODEL_OUTPUT_TOKEN_CEILINGS[model] ?? DEFAULT_OUTPUT_TOKEN_CEILING;
}

export function parseGeminiLocations(
  rawList: string | undefined,
  primary: string
): string[] {
  const defaults = [
    primary,
    "us-central1",
    "us-east4",
    "us-west1",
    "europe-west1",
  ];
  const fromEnv = (rawList || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const merged = fromEnv.length > 0 ? fromEnv : defaults;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const loc of [primary, ...merged]) {
    const key = loc.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * 6. GCP VERTEX AI INFRASTRUCTURE CONFIGURATION ENVELOPE
 */
export const GEMINI_ENV_CONFIG = {
  projectId: process.env.GOOGLE_CLOUD_PROJECT || "",
  location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
  locations: parseGeminiLocations(
    process.env.GOOGLE_CLOUD_LOCATIONS,
    process.env.GOOGLE_CLOUD_LOCATION || "us-central1"
  ),
  apiKey: process.env.GOOGLE_GEMINI_EXTERNAL_KEY || "",
  timeoutMs: 45000,
};

