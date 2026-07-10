// src/modules/llm/provider/openrouter-provider.ts

import { ILLMProvider } from "./base-provider.js";
import { TaskModelConfig } from "../../config/model-specs.js";

export class OpenRouterLegacyProvider implements ILLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor() {
    const key = process.env.OPENROUTER_API_KEY || "";
    if (!key || key.trim() === "") {
      throw new Error("OpenRouter Legacy initialization aborted: Missing OPENROUTER_API_KEY in environment configuration.");
    }
    this.apiKey = key.trim();
    this.baseUrl = "https://openrouter.ai/api/v1/chat/completions";
  }

  async getCompletion(prompt: string, systemInstruction: string, runtimeConfig: TaskModelConfig): Promise<string> {
    const messages = [];
    if (systemInstruction?.trim()) {
      messages.push({ role: "system", content: systemInstruction });
    }
    messages.push({ role: "user", content: prompt });

    return this.executeFetchCall(messages, runtimeConfig);
  }

  async getJsonCompletion<T>(prompt: string, systemInstruction: string, jsonSchema: any, runtimeConfig: TaskModelConfig): Promise<T> {
    const messages = [];
    if (systemInstruction?.trim()) {
      messages.push({ role: "system", content: systemInstruction });
    }

    const schemaHint = jsonSchema 
      ? `\n\nReturn ONLY valid JSON matching this schema:\n${JSON.stringify(jsonSchema)}`
      : "\n\nReturn ONLY valid JSON.";

    messages.push({ role: "user", content: `${prompt}${schemaHint}` });

    const responseFormat = jsonSchema 
      ? { type: "json_schema", json_schema: { name: "structured_output", strict: true, schema: jsonSchema } }
      : { type: "json_object" };

    const rawResultText = await this.executeFetchCall(messages, runtimeConfig, responseFormat);
    
    try {
      return JSON.parse(rawResultText) as T;
    } catch (err: any) {
      throw new Error(`OpenRouter JSON payload parsing failed: ${err.message}. Raw text payload: ${rawResultText}`);
    }
  }

  private async executeFetchCall(messages: any[], runtimeConfig: TaskModelConfig, responseFormat?: any): Promise<string> {
    const body: Record<string, any> = {
      model: runtimeConfig.model,
      messages,
      temperature: runtimeConfig.temperature
    };
    if (responseFormat) {
      body.response_format = responseFormat;
    }

    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`OpenRouter API endpoint response error (${res.status}): ${errorText}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    
    if (typeof content !== "string") {
      throw new Error("OpenRouter payload emerged from network missing expected text content keys.");
    }

    return content;
  }
}