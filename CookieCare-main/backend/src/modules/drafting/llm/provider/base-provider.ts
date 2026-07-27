import { TaskModelConfig } from "../../config/model-specs";

export interface ILLMProvider {
  getCompletion(prompt: string, systemInstruction: string, runtimeConfig: TaskModelConfig): Promise<string>;
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
  ): Promise<string>;
}