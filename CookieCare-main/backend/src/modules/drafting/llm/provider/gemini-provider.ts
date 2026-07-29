
import { GoogleGenAI } from "@google/genai";
import { CompletionOutcome, ILLMProvider } from "./base-provider.js";
import { TaskModelConfig, GEMINI_ENV_CONFIG } from "../../config/model-specs.js";

/**
 * Gemini reports MAX_TOKENS when the response was cut off by maxOutputTokens.
 * Anything else (STOP, or an absent reason on intermediate stream chunks) means the
 * model ended on its own terms.
 */
function isTruncated(finishReason: unknown): boolean {
  return typeof finishReason === "string" && finishReason.toUpperCase() === "MAX_TOKENS";
}

/**
 * LATENCY_QUICKWIN: resolve a legal thinkingBudget per model.
 * - gemini-2.5-flash / flash-lite: 0 disables thinking
 * - gemini-2.5-pro: 0 is REJECTED by the API (400 INVALID_ARGUMENT);
 *   minimum allowed is 128. We use 1024 for generation quality (TOC,
 *   signature hygiene, cross-refs) while staying well below the ~8192 default.
 */
function resolveThinkingBudget(model: string): number {
  const normalized = model.toLowerCase();
  if (normalized.includes("flash")) {
    return 0;
  }
  // QUALITY_QUICKWIN: previous latency-min clamp — restore if wall-clock regresses too far
  // return 128;
  return 1024;
}

export class GeminiProvider implements ILLMProvider {
  private ai: GoogleGenAI;

  constructor() {
    const project = GEMINI_ENV_CONFIG.projectId;
    const location = GEMINI_ENV_CONFIG.location;

    if (!project || project.trim() === "") {
      throw new Error("Gemini initialization failed: GOOGLE_CLOUD_PROJECT variable is missing.");
    }

    this.ai = new GoogleGenAI({
      enterprise: true,
      project: project.trim(),
      location: location.trim()
    });
  }

  async getCompletion(prompt: string, systemInstruction: string, runtimeConfig: TaskModelConfig): Promise<CompletionOutcome> {
    try {
      // LATENCY_QUICKWIN: previous config without thinking control — restore if quality regresses
      // const response = await this.ai.models.generateContent({
      //   model: runtimeConfig.model,
      //   contents: prompt,
      //   config: {
      //     systemInstruction: systemInstruction,
      //     temperature: runtimeConfig.temperature,
      //     maxOutputTokens: runtimeConfig.maxOutputTokens
      //   }
      // });
      // LATENCY_QUICKWIN: previous broken attempt — Pro rejects thinkingBudget: 0
      // thinkingConfig: { thinkingBudget: 0 }
      const response = await this.ai.models.generateContent({
        model: runtimeConfig.model,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          temperature: runtimeConfig.temperature,
          maxOutputTokens: runtimeConfig.maxOutputTokens,
          thinkingConfig: { thinkingBudget: resolveThinkingBudget(runtimeConfig.model) }
        }
      });

      return {
        text: response.text ?? "",
        truncated: isTruncated(response.candidates?.[0]?.finishReason)
      };
    } catch (err: any) {
      throw new Error(`Gemini Completion Engine failure: ${err.message}`);
    }
  }

  /**
   * Real token streaming: emits each chunk via onDelta as it arrives and returns the
   * full concatenated text. Used for the heavy COMPLEX_DRAFT call so the user sees the
   * document appear live instead of waiting for the whole thing.
   */
  async getCompletionStream(
    prompt: string,
    systemInstruction: string,
    runtimeConfig: TaskModelConfig,
    onDelta: (delta: string) => void
  ): Promise<CompletionOutcome> {
    try {
      const stream = await this.ai.models.generateContentStream({
        model: runtimeConfig.model,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          temperature: runtimeConfig.temperature,
          maxOutputTokens: runtimeConfig.maxOutputTokens,
          thinkingConfig: { thinkingBudget: resolveThinkingBudget(runtimeConfig.model) }
        }
      });

      let full = "";
      let finishReason: unknown;
      for await (const chunk of stream) {
        const piece = chunk.text ?? "";
        // Only the final chunk carries a finishReason; keep the last one we see.
        finishReason = chunk.candidates?.[0]?.finishReason ?? finishReason;
        if (piece) {
          full += piece;
          try {
            onDelta(piece);
          } catch {
            /* delivery is best-effort; never let a broadcast error abort generation */
          }
        }
      }
      return { text: full, truncated: isTruncated(finishReason) };
    } catch (err: any) {
      throw new Error(`Gemini Streaming Engine failure: ${err.message}`);
    }
  }

  async getJsonCompletion<T>(prompt: string, systemInstruction: string, jsonSchema: any, runtimeConfig: TaskModelConfig): Promise<T> {
    try {
      // LATENCY_QUICKWIN: previous config without thinking control — restore if quality regresses
      // const response = await this.ai.models.generateContent({
      //   model: runtimeConfig.model,
      //   contents: prompt,
      //   config: {
      //     systemInstruction: systemInstruction,
      //     temperature: runtimeConfig.temperature,
      //     responseMimeType: "application/json",
      //     responseSchema: jsonSchema
      //   }
      // });
      // LATENCY_QUICKWIN: previous broken attempt — Pro rejects thinkingBudget: 0
      // thinkingConfig: { thinkingBudget: 0 }
      const response = await this.ai.models.generateContent({
        model: runtimeConfig.model,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          temperature: runtimeConfig.temperature,
          responseMimeType: "application/json",
          responseSchema: jsonSchema,
          thinkingConfig: { thinkingBudget: resolveThinkingBudget(runtimeConfig.model) }
        }
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
}
