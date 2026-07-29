import { TaskModelConfig } from "../../config/model-specs";

/**
 * Result of a text completion call.
 * `truncated` is true when the model stopped because it exhausted maxOutputTokens
 * (finishReason MAX_TOKENS / length) rather than finishing its answer. Callers that
 * produce long artifacts (contract drafts) use it to trigger a continuation pass
 * instead of persisting a document that stops mid-clause.
 */
export interface CompletionOutcome {
  text: string;
  truncated: boolean;
}

export interface ILLMProvider {
  getCompletion(prompt: string, systemInstruction: string, runtimeConfig: TaskModelConfig): Promise<CompletionOutcome>;
  getJsonCompletion<T>(prompt: string, systemInstruction: string, jsonSchema: any, runtimeConfig: TaskModelConfig): Promise<T>;
  /**
   * Optional real token streaming. Calls `onDelta` with each incremental chunk as it
   * arrives and resolves with the full concatenated text. Providers that do not
   * implement this are transparently handled by a non-streaming fallback in llm/index.ts.
   */
  getCompletionStream?(
    prompt: string,
    systemInstruction: string,
    runtimeConfig: TaskModelConfig,
    onDelta: (delta: string) => void
  ): Promise<CompletionOutcome>;
}
