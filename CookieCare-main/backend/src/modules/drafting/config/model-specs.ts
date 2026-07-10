// src/modules/llm/config/model-specs.ts

import { GenerateContentConfig } from "@google/genai";

/**
 * 1. UNIFIED HARDWARE TIERS
 * Explicit catalog of production-approved models.
 */
export enum GeminiModel {
  GEMINI_2_5_FLASH = "gemini-2.5-flash",
  GEMINI_2_5_PRO   = "gemini-2.5-pro",
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
  REFINEMENT       = "REFINEMENT",       // Interactive highlight editor changes
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
      model: GeminiModel.GEMINI_2_5_PRO, 
      temperature: 0.0, 
      maxOutputTokens: 8192 
    },
    [LLMTask.STRUCTURAL_JSON]: { 
      model: GeminiModel.GEMINI_2_5_PRO, 
      temperature: 0.0, 
      responseMimeType: "application/json" 
    },
    [LLMTask.REFINEMENT]: { 
      model: GeminiModel.GEMINI_2_5_FLASH, 
      temperature: 0.2 
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
    [LLMTask.REFINEMENT]: { 
      model: OpenRouterModel.LLAMA_3_3_70B, 
      temperature: 0.2 
    }
  }
};

/**
 * 5. GCP INFRASTRUCTURE CONFIGURATION ENVELOPE
 */
export const GEMINI_ENV_CONFIG = {
  projectId: process.env.GOOGLE_CLOUD_PROJECT || "lexify-production-cloud",
  location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
  timeoutMs: 45000
};