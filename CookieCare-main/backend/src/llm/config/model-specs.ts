import { GenerateContentConfig } from "@google/genai";

/**
 * 1. UNIFIED HARDWARE TIERS
 * Explicit catalog of production-approved models.
 */
export enum GeminiModel {
  GEMINI_2_5_FLASH = "gemini-2.5-flash",
  GEMINI_2_5_PRO = "gemini-2.5-pro",
}

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
}

export enum LLMProvider {
  GEMINI = "GEMINI",
  OPENROUTER = "OPENROUTER",
}

/**
 * 3. RUNTIME PARAMETER MATRIX
 */
export interface TaskModelConfig {
  model: string;
  temperature: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: any;
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
    },
    [LLMTask.COMPLEX_DRAFT]: {
      model: GeminiModel.GEMINI_2_5_PRO,
      temperature: 0.0,
      maxOutputTokens: 4096,
    },
    [LLMTask.STRUCTURAL_JSON]: {
      model: GeminiModel.GEMINI_2_5_FLASH,
      temperature: 0.0,
      responseMimeType: "application/json",
    },
    [LLMTask.STRUCTURAL_JSON_LITE]: {
      model: GeminiModel.GEMINI_2_5_FLASH,
      temperature: 0.0,
      responseMimeType: "application/json",
    },
    [LLMTask.REFINEMENT]: {
      model: GeminiModel.GEMINI_2_5_FLASH,
      temperature: 0.2,
    },
    [LLMTask.SECTION_REFINE]: {
      model: GeminiModel.GEMINI_2_5_PRO,
      temperature: 0.0,
      maxOutputTokens: 2048,
    },
    [LLMTask.EXTRACT_FACTS]: {
      model: GeminiModel.GEMINI_2_5_FLASH,
      temperature: 0.0,
      responseMimeType: "application/json",
    },
    [LLMTask.DETECT_GAPS]: {
      model: GeminiModel.GEMINI_2_5_FLASH,
      temperature: 0.0,
      responseMimeType: "application/json",
    },
    [LLMTask.CRITIQUE_CHECKLIST]: {
      model: GeminiModel.GEMINI_2_5_PRO,
      temperature: 0.0,
      responseMimeType: "application/json",
      maxOutputTokens: 4096,
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

/**
 * 6. GCP INFRASTRUCTURE CONFIGURATION ENVELOPE
 */
if (!process.env.GOOGLE_CLOUD_PROJECT) {
  throw new Error(
    "[FATAL] GOOGLE_CLOUD_PROJECT is not set. " +
      "Add GOOGLE_CLOUD_PROJECT=<your-gcp-project-id> to your .env file."
  );
}

export const GEMINI_ENV_CONFIG = {
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION || "us-east4",
  timeoutMs: 45000,
};
