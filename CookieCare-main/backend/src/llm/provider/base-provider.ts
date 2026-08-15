import { TaskModelConfig } from "../config/model-specs.js";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Result of a text completion call.
 * `truncated` is true when the model stopped because it exhausted maxOutputTokens.
 * `usage` is best-effort: providers that omit usage get a char/4 estimate.
 */
export interface CompletionOutcome {
  text: string;
  truncated: boolean;
  usage: TokenUsage;
}

export function estimateTokenUsage(prompt: string, systemInstruction: string, completion: string): TokenUsage {
  const promptTokens = Math.ceil((prompt.length + (systemInstruction?.length ?? 0)) / 4);
  const completionTokens = Math.ceil(completion.length / 4);
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

export interface ILLMProvider {
  getCompletion(
    prompt: string,
    systemInstruction: string,
    runtimeConfig: TaskModelConfig
  ): Promise<CompletionOutcome>;
  getJsonCompletion<T>(
    prompt: string,
    systemInstruction: string,
    jsonSchema: any,
    runtimeConfig: TaskModelConfig
  ): Promise<T>;
  getCompletionStream?(
    prompt: string,
    systemInstruction: string,
    runtimeConfig: TaskModelConfig,
    onDelta: (delta: string) => void
  ): Promise<CompletionOutcome>;
}
