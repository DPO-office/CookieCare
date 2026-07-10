
import { GoogleGenAI } from "@google/genai";
import { ILLMProvider } from "./base-provider.js";
import { TaskModelConfig, GEMINI_ENV_CONFIG } from "../../config/model-specs.js";

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
      const response = await this.ai.models.generateContent({
        model: runtimeConfig.model,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          temperature: runtimeConfig.temperature,
          maxOutputTokens: runtimeConfig.maxOutputTokens
        }
      });

      return response.text ?? "";
    } catch (err: any) {
      throw new Error(`Gemini Completion Engine failure: ${err.message}`);
    }
  }

  async getJsonCompletion<T>(prompt: string, systemInstruction: string, jsonSchema: any, runtimeConfig: TaskModelConfig): Promise<T> {
    try {
      const response = await this.ai.models.generateContent({
        model: runtimeConfig.model,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          temperature: runtimeConfig.temperature,
          responseMimeType: "application/json",
          responseSchema: jsonSchema
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