
import { GoogleGenAI } from "@google/genai";
import { ILLMProvider } from "./base-provider.js";
import { TaskModelConfig, GEMINI_ENV_CONFIG } from "../../config/model-specs.js";

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

  async getCompletion(prompt: string, systemInstruction: string, runtimeConfig: TaskModelConfig): Promise<string> {
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

      return response.text ?? "";
    } catch (err: any) {
      throw new Error(`Gemini Completion Engine failure: ${err.message}`);
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
