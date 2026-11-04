import { DigitalOceanInferenceClient } from "../../../../llm/provider/digitalocean-client.js";
import { type LlmStructureClient, type LlmStructureCompletion, StructureMalformedOutputError } from "./llm-structure.js";

function parseJsonOutput(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenceMatch) {
      try { return JSON.parse(fenceMatch[1]!.trim()); } catch { /* continue */ }
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { /* continue */ }
    }
    throw new StructureMalformedOutputError("DigitalOcean returned invalid JSON for structure extraction");
  }
}

export class DigitalOceanStructureClient implements LlmStructureClient {
  constructor(private readonly client = new DigitalOceanInferenceClient()) {}

  async generate(input: { model: string; systemInstruction: string; prompt: string;
    responseSchema: unknown; signal?: AbortSignal }): Promise<LlmStructureCompletion> {
    const reasoningEffort = (process.env.KB_STRUCTURE_REASONING_EFFORT as "low" | "high" | "max" | undefined) ??
      (input.model.startsWith("glm-5.3") ? "low" : undefined);
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
    const output = parseJsonOutput(response.text);
    return { output, rawResponse: response.rawResponse, usage: response.usage,
      finishReason: response.finishReason };
  }
}
