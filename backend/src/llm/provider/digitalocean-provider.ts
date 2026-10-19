import type { TaskModelConfig } from "../config/model-specs.js";
import { DigitalOceanInferenceClient, type DoChatRequest, type DoChatResult } from "./digitalocean-client.js";
import { estimateTokenUsage, type CompletionOutcome, type ILLMProvider } from "./base-provider.js";

function effort(config: TaskModelConfig): "low" | "high" | "max" | undefined {
  if (!config.model.startsWith("glm-5.3")) return undefined;
  return config.thinkingLevel === "high" ? "high" : "low";
}

export class DigitalOceanProvider implements ILLMProvider {
  constructor(private readonly client = new DigitalOceanInferenceClient()) {}

  private request(prompt: string, systemInstruction: string, config: TaskModelConfig,
    responseSchema?: unknown): DoChatRequest {
    return { model: config.model, prompt, systemInstruction, temperature: config.temperature,
      maxCompletionTokens: config.maxOutputTokens ?? 8192, reasoningEffort: effort(config),
      responseSchema, signal: config.abortSignal };
  }

  private outcome(prompt: string, systemInstruction: string, result: DoChatResult): CompletionOutcome {
    const usage = result.usage?.inputTokens !== null && result.usage?.inputTokens !== undefined &&
      result.usage?.outputTokens !== null && result.usage?.outputTokens !== undefined
      ? { promptTokens: result.usage.inputTokens, completionTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens ?? result.usage.inputTokens + result.usage.outputTokens }
      : estimateTokenUsage(prompt, systemInstruction, result.text);
    return { text: result.text, truncated: result.finishReason === "length", usage };
  }

  async getCompletion(prompt: string, systemInstruction: string,
    config: TaskModelConfig): Promise<CompletionOutcome> {
    return this.outcome(prompt, systemInstruction,
      await this.client.chat(this.request(prompt, systemInstruction, config)));
  }

  async getCompletionStream(prompt: string, systemInstruction: string, config: TaskModelConfig,
    onDelta: (delta: string) => void): Promise<CompletionOutcome> {
    return this.outcome(prompt, systemInstruction,
      await this.client.chatStream(this.request(prompt, systemInstruction, config), onDelta));
  }

  async getJsonCompletion<T>(prompt: string, systemInstruction: string,
    jsonSchema: unknown, config: TaskModelConfig): Promise<T> {
    return (await this.getJsonCompletionWithMeta<T>(prompt, systemInstruction, jsonSchema, config)).result;
  }

  async getJsonCompletionWithMeta<T>(prompt: string, systemInstruction: string,
    jsonSchema: unknown, config: TaskModelConfig) {
    const isArray = typeof jsonSchema === "object" && jsonSchema !== null &&
      "type" in jsonSchema && jsonSchema.type === "array";
    const responseSchema = isArray ? { type: "object", additionalProperties: false,
      required: ["result"], properties: { result: jsonSchema } } : jsonSchema;
    const instruction = isArray
      ? `${systemInstruction}\nReturn an object with a result property containing the requested array.`
      : systemInstruction;
    const result = await this.client.chat(this.request(prompt, instruction, config, responseSchema));
    let value: unknown;
    try { value = JSON.parse(result.text); }
    catch { throw new Error("DigitalOcean returned invalid JSON"); }
    if (isArray && (typeof value !== "object" || value === null || !("result" in value) ||
      !Array.isArray(value.result))) throw new Error("DigitalOcean array wrapper is invalid");
    const parsed = (isArray ? (value as { result: unknown[] }).result : value) as T;
    return { result: parsed, usage: this.outcome(prompt, systemInstruction, result).usage };
  }
}
