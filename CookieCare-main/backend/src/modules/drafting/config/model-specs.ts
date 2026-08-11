// src/modules/llm/config/model-specs.ts

import { GenerateContentConfig } from "@google/genai";

/**
 * 1. UNIFIED HARDWARE TIERS
 * Explicit catalog of production-approved models.
 */
export enum GeminiModel {
  GEMINI_2_5_FLASH = "gemini-2.5-flash",
  GEMINI_2_5_PRO   = "gemini-2.5-pro",
  // ANTHROPIC_3_5_SONNET = "anthropic/claude-3.5-sonnet",
  // GEMINI_3_5_FLASH = "gemini-3.5-flash"
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
  FAST_STITCH      = "FAST_STITCH",      // Multi-page layout data table stitching
  COMPLEX_DRAFT    = "COMPLEX_DRAFT",    // Initial contract clause composition
  STRUCTURAL_JSON  = "STRUCTURAL_JSON",   // Strict schema processing and extraction
  REFINEMENT       = "REFINEMENT",    
  STRUCTURAL_JSON_LITE = "STRUCTURAL_JSON_LITE", // Interactive highlight editor changes
  SECTION_REFINE   = "SECTION_REFINE",  // Surgical single-section regeneration (fast, scoped)
  // ── Compare module tasks ──────────────────────────────────────────────────
  COMPARE_ALIGN    = "COMPARE_ALIGN",    // Semantic clause alignment between two agreements
  COMPARE_DIFF     = "COMPARE_DIFF",     // Semantic difference classification per clause pair
  COMPARE_RISK     = "COMPARE_RISK",     // Legal and commercial risk evaluation per difference
  COMPARE_SUMMARY  = "COMPARE_SUMMARY", // Executive summary narrative over all findings
}

export enum LLMProvider {
  GEMINI = "GEMINI",
  OPENROUTER = "OPENROUTER"
}

/**
 * 3. RUNTIME PARAMETER MATRIX
 * Standard structure for passing execution configurations to underlying engines.
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
 * Tunes each legal workload. Safe, highly deterministic defaults.
 */
export const PROVIDER_TASK_PRESETS: Record<LLMProvider, Record<LLMTask, TaskModelConfig>> = {
  [LLMProvider.GEMINI]: {
    [LLMTask.FAST_STITCH]: { 
      model: GeminiModel.GEMINI_2_5_FLASH, 
      temperature: 0.1 
    },
    [LLMTask.COMPLEX_DRAFT]: { 
      // LATENCY_QUICKWIN: intentionally kept on Pro to protect legal prose quality (NDA 9.5/10/9.0).
      // Flash was considered and rejected for the main generation call in this pass.
      model: GeminiModel.GEMINI_2_5_PRO, 
      temperature: 0.0, 
      // LATENCY: output length is the #1 latency driver, so this stays low. It is the
      // FLOOR only: generation.ts sizes the real budget per request from the document
      // skeleton / required clauses / source document and overrides this value, then
      // continues the draft if the model still reports MAX_TOKENS.
      maxOutputTokens: 4096 
    },
    [LLMTask.STRUCTURAL_JSON]: { 
      // LATENCY_QUICKWIN: previous — restore if extraction/validation quality regresses
      // model: GeminiModel.GEMINI_2_5_PRO,
      model: GeminiModel.GEMINI_2_5_FLASH, 
      temperature: 0.0, 
      responseMimeType: "application/json" 
    },
    [LLMTask.STRUCTURAL_JSON_LITE]: {
      model: GeminiModel.GEMINI_2_5_FLASH, 
      temperature: 0.0, 
      responseMimeType: "application/json" 
    },
    [LLMTask.REFINEMENT]: { 
      model: GeminiModel.GEMINI_2_5_FLASH, 
      temperature: 0.2 
    },
    [LLMTask.SECTION_REFINE]: {
      // Surgical single-section regeneration: keep Pro for legal-prose quality, but a
      // small output cap since we only emit one section (fast + cheap vs full-doc regen).
      model: GeminiModel.GEMINI_2_5_PRO,
      temperature: 0.0,
      maxOutputTokens: 2048
    },
    // ── Compare module ──────────────────────────────────────────────────────
    [LLMTask.COMPARE_ALIGN]: {
      // Flash is deliberately chosen: alignment is a classification task (JSON),
      // not legal prose generation. Speed and cost matter at scale; Flash handles
      // structured JSON output reliably at temperature 0.
      model: GeminiModel.GEMINI_2_5_FLASH,
      temperature: 0.0,
      responseMimeType: "application/json"
    },
    [LLMTask.COMPARE_DIFF]: {
      // Flash at temperature 0: diff classification is a structured labelling
      // task, not legal prose. Speed and cost efficiency are the priority.
      model: GeminiModel.GEMINI_2_5_FLASH,
      temperature: 0.0,
      responseMimeType: "application/json"
    },
    [LLMTask.COMPARE_RISK]: {
      // Flash at temperature 0: risk evaluation is a structured classification
      // task. Legal reasoning depth is provided by the AI Skill prompt, not
      // by choosing a heavier model here.
      model: GeminiModel.GEMINI_2_5_FLASH,
      temperature: 0.0,
      responseMimeType: "application/json"
    },
    [LLMTask.COMPARE_SUMMARY]: {
      // Flash at temperature 0.2: the prompt is now compact (Top-10 findings,
      // condensed stats block) so Flash produces equivalent quality to Pro at
      // a fraction of the cost and latency. Pro is no longer warranted here.
      model: GeminiModel.GEMINI_2_5_FLASH,
      temperature: 0.2,
      responseMimeType: "application/json",
      maxOutputTokens: 2048
    }
  },
  [LLMProvider.OPENROUTER]: {
    [LLMTask.FAST_STITCH]: { 
      model: OpenRouterModel.LLAMA_3_3_70B, 
      temperature: 0.1 
    },
    [LLMTask.COMPLEX_DRAFT]: { 
      model: OpenRouterModel.CLAUDE_3_5_SONNET, 
      temperature: 0.0 
    },
    [LLMTask.STRUCTURAL_JSON]: { 
      model: OpenRouterModel.GPT_4O_MINI, 
      temperature: 0.0, 
      responseMimeType: "application/json" 
    },
    [LLMTask.STRUCTURAL_JSON_LITE]: {
      model: OpenRouterModel.CLAUDE_3_5_SONNET, 
      temperature: 0.0, 
      responseMimeType: "application/json" 
    },
    [LLMTask.REFINEMENT]: { 
      model: OpenRouterModel.LLAMA_3_3_70B, 
      temperature: 0.2 
    },
    [LLMTask.SECTION_REFINE]: {
      model: OpenRouterModel.CLAUDE_3_5_SONNET,
      temperature: 0.0,
      maxOutputTokens: 2048
    },
    // ── Compare module ──────────────────────────────────────────────────────
    [LLMTask.COMPARE_ALIGN]: {
      model: OpenRouterModel.GPT_4O_MINI,
      temperature: 0.0,
      responseMimeType: "application/json"
    },
    [LLMTask.COMPARE_DIFF]: {
      model: OpenRouterModel.GPT_4O_MINI,
      temperature: 0.0,
      responseMimeType: "application/json"
    },
    [LLMTask.COMPARE_RISK]: {
      model: OpenRouterModel.GPT_4O_MINI,
      temperature: 0.0,
      responseMimeType: "application/json"
    },
    [LLMTask.COMPARE_SUMMARY]: {
      // Claude 3.5 Sonnet: best available OpenRouter model for prose quality,
      // matching the intent of using Pro on the Gemini side.
      model: OpenRouterModel.CLAUDE_3_5_SONNET,
      temperature: 0.2,
      responseMimeType: "application/json",
      maxOutputTokens: 2048
    }
  }
};

/**
 * 5. OUTPUT CAPACITY LIMITS
 * Hard per-response output ceilings published by each vendor. A dynamically sized token
 * budget is clamped to these, so a large document request can never ask for more than the
 * model will emit (which the API rejects outright).
 */
const DEFAULT_OUTPUT_TOKEN_CEILING = 8192;

const MODEL_OUTPUT_TOKEN_CEILINGS: Record<string, number> = {
  [GeminiModel.GEMINI_2_5_FLASH]: 65535,
  [GeminiModel.GEMINI_2_5_PRO]: 65535,
  [OpenRouterModel.CLAUDE_3_5_SONNET]: 8192,
  [OpenRouterModel.LLAMA_3_3_70B]: 8192,
  [OpenRouterModel.GPT_4O_MINI]: 16384
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
  timeoutMs: 45000
};