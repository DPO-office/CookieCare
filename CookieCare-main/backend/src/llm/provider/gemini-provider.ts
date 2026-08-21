import { GoogleGenAI } from "@google/genai";
import { CompletionOutcome, estimateTokenUsage, ILLMProvider } from "./base-provider.js";
import {
  TaskModelConfig,
  GEMINI_ENV_CONFIG,
  GeminiThinkingLevel,
} from "../config/model-specs.js";

function isTruncated(finishReason: unknown): boolean {
  return typeof finishReason === "string" && finishReason.toUpperCase() === "MAX_TOKENS";
}

function isGemini3Model(model: string): boolean {
  const normalized = model.toLowerCase();
  return (
    normalized.startsWith("gemini-3") ||
    normalized.includes("gemini-3.") ||
    /gemini-3[.-]/.test(normalized)
  );
}

function resolveThinkingBudget(runtimeConfig: TaskModelConfig): number {
  if (typeof runtimeConfig.thinkingBudget === "number") {
    return runtimeConfig.thinkingBudget;
  }
  // Legacy fallback: Flash off, Pro on — prefer explicit per-task budgets above.
  const normalized = runtimeConfig.model.toLowerCase();
  if (normalized.includes("flash")) {
    return 0;
  }
  return 1024;
}

function resolveThinkingLevel(runtimeConfig: TaskModelConfig): GeminiThinkingLevel {
  if (runtimeConfig.thinkingLevel) {
    return runtimeConfig.thinkingLevel;
  }
  const normalized = runtimeConfig.model.toLowerCase();
  if (normalized.includes("flash")) {
    return "minimal";
  }
  return "high";
}

/** Build thinkingConfig for Gemini 2.5 (budget) vs 3.x (level) — never mix both. */
function buildThinkingConfig(runtimeConfig: TaskModelConfig): Record<string, unknown> {
  if (isGemini3Model(runtimeConfig.model)) {
    return { thinkingLevel: resolveThinkingLevel(runtimeConfig) };
  }
  return { thinkingBudget: resolveThinkingBudget(runtimeConfig) };
}

function usageFromResponse(
  prompt: string,
  systemInstruction: string,
  text: string,
  usageMetadata: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined
) {
  if (
    usageMetadata &&
    typeof usageMetadata.promptTokenCount === "number" &&
    typeof usageMetadata.candidatesTokenCount === "number"
  ) {
    return {
      promptTokens: usageMetadata.promptTokenCount,
      completionTokens: usageMetadata.candidatesTokenCount,
      totalTokens:
        typeof usageMetadata.totalTokenCount === "number"
          ? usageMetadata.totalTokenCount
          : usageMetadata.promptTokenCount + usageMetadata.candidatesTokenCount,
    };
  }
  return estimateTokenUsage(prompt, systemInstruction, text);
}

/**
 * Gemini API provider via GOOGLE_GEMINI_EXTERNAL_KEY (Google AI / Generative Language API).
 * Not Vertex enterprise — latest 3.x models are available on this path.
 */
export class GeminiProvider implements ILLMProvider {
  private readonly client: GoogleGenAI;

  constructor() {
    const apiKey = (GEMINI_ENV_CONFIG.apiKey || process.env.GOOGLE_GEMINI_EXTERNAL_KEY || "").trim();
    if (!apiKey) {
      throw new Error(
        "Gemini initialization failed: GOOGLE_GEMINI_EXTERNAL_KEY is missing. " +
          "Add GOOGLE_GEMINI_EXTERNAL_KEY=<your-gemini-api-key> to your .env file."
      );
    }
    this.client = new GoogleGenAI({ apiKey });
    console.log("[Gemini] Using Gemini API (apiKey) — models routed via PROVIDER_TASK_PRESETS");
  }

  async getCompletion(
    prompt: string,
    systemInstruction: string,
    runtimeConfig: TaskModelConfig
  ): Promise<CompletionOutcome> {
    try {
      const response = await this.client.models.generateContent({
        model: runtimeConfig.model,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          temperature: runtimeConfig.temperature,
          maxOutputTokens: runtimeConfig.maxOutputTokens,
          thinkingConfig: buildThinkingConfig(runtimeConfig),
        },
      });

      const text = response.text ?? "";
      return {
        text,
        truncated: isTruncated(response.candidates?.[0]?.finishReason),
        usage: usageFromResponse(prompt, systemInstruction, text, response.usageMetadata as any),
      };
    } catch (err: any) {
      throw new Error(`Gemini Completion Engine failure: ${err.message}`);
    }
  }

  async getCompletionStream(
    prompt: string,
    systemInstruction: string,
    runtimeConfig: TaskModelConfig,
    onDelta: (delta: string) => void
  ): Promise<CompletionOutcome> {
    try {
      const stream = await this.client.models.generateContentStream({
        model: runtimeConfig.model,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          temperature: runtimeConfig.temperature,
          maxOutputTokens: runtimeConfig.maxOutputTokens,
          thinkingConfig: buildThinkingConfig(runtimeConfig),
        },
      });

      let full = "";
      let finishReason: unknown;
      let usageMetadata: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined;
      for await (const chunk of stream) {
        const piece = chunk.text ?? "";
        finishReason = chunk.candidates?.[0]?.finishReason ?? finishReason;
        usageMetadata = (chunk as any).usageMetadata ?? usageMetadata;
        if (piece) {
          full += piece;
          try {
            onDelta(piece);
          } catch {
            /* delivery is best-effort */
          }
        }
      }
      return {
        text: full,
        truncated: isTruncated(finishReason),
        usage: usageFromResponse(prompt, systemInstruction, full, usageMetadata),
      };
    } catch (err: any) {
      throw new Error(`Gemini Streaming Engine failure: ${err.message}`);
    }
  }

  async getJsonCompletion<T>(
    prompt: string,
    systemInstruction: string,
    jsonSchema: any,
    runtimeConfig: TaskModelConfig
  ): Promise<T> {
    try {
      const response = await this.client.models.generateContent({
        model: runtimeConfig.model,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          temperature: runtimeConfig.temperature,
          responseMimeType: "application/json",
          responseSchema: jsonSchema,
          thinkingConfig: buildThinkingConfig(runtimeConfig),
        },
      });

      const rawText = response.text;
      if (!rawText) {
        throw new Error("Gemini returned an empty structured content response block.");
      }

      return JSON.parse(rawText) as T;
    } catch (err: any) {
      throw new Error(`Gemini JSON Processing Circuit failure: ${err.message}`);
    }
  }

  /**
   * JSON completion that also returns usageMetadata token counts.
   * Called by executeJsonCompletionWithMeta in llm/index.ts.
   */
  async getJsonCompletionWithMeta<T>(
    prompt: string,
    systemInstruction: string,
    jsonSchema: any,
    runtimeConfig: TaskModelConfig
  ): Promise<{ result: T; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
    try {
      const response = await this.client.models.generateContent({
        model: runtimeConfig.model,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          temperature: runtimeConfig.temperature,
          responseMimeType: "application/json",
          responseSchema: jsonSchema,
          thinkingConfig: buildThinkingConfig(runtimeConfig),
        },
      });

      const rawText = response.text;
      if (!rawText) {
        throw new Error("Gemini returned an empty structured content response block.");
      }

      const meta = (response as any).usageMetadata;
      const usage = {
        promptTokens: meta?.promptTokenCount ?? 0,
        completionTokens: meta?.candidatesTokenCount ?? 0,
        totalTokens: meta?.totalTokenCount ?? 0,
      };

      return { result: JSON.parse(rawText) as T, usage };
    } catch (err: any) {
      throw new Error(`Gemini JSON Processing Circuit failure: ${err.message}`);
    }
  }
}
