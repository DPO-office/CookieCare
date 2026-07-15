import { TaskModelConfig } from "../../config/model-specs";

export interface ILLMProvider {
  getCompletion(prompt: string, systemInstruction: string, runtimeConfig: TaskModelConfig): Promise<string>;
  getJsonCompletion<T>(prompt: string, systemInstruction: string, jsonSchema: any, runtimeConfig: TaskModelConfig): Promise<T>;
}