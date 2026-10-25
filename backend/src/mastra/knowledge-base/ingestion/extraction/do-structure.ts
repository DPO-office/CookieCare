import { DigitalOceanInferenceClient } from "../../../../llm/provider/digitalocean-client.js";
import { type LlmStructureClient, type LlmStructureCompletion } from "./llm-structure.js";

export class DigitalOceanStructureClient implements LlmStructureClient {
  constructor(private readonly client = new DigitalOceanInferenceClient()) {}

  async generate(input: { model: string; systemInstruction: string; prompt: string;
    responseSchema: unknown; signal?: AbortSignal }): Promise<LlmStructureCompletion> {
    const reasoningEffort = (process.env.KB_STRUCTURE_REASONING_EFFORT as "low" | "high" | "max" | undefined) ??
      (input.model === "glm-5.3" ? "low" : undefined);
    const timeoutMs = process.env.DO_INFERENCE_TIMEOUT_MS ? Number(process.env.DO_INFERENCE_TIMEOUT_MS) : 600_000;
    const response = await this.client.chat({ ...input, temperature: 0,
      maxCompletionTokens: 16_384,
      timeoutMs,
      retryOnTimeout: false,
      ...(reasoningEffort ? { reasoningEffort } : {}) });
    if (response.finishReason?.toLowerCase() === "length") {
      return { output: null, rawResponse: response.rawResponse, usage: response.usage,
        finishReason: response.finishReason };
    }
    let output: unknown;
    try { output = JSON.parse(response.text); }
    catch { throw new Error("DigitalOcean returned invalid JSON for structure extraction"); }
    return { output, rawResponse: response.rawResponse, usage: response.usage,
      finishReason: response.finishReason };
  }
}
