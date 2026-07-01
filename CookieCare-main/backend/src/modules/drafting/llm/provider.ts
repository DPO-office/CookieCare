import { config } from "../../../config/index.js";
import { openRouterComplete } from "../../../services/openRouterClient.js";

export interface DraftLlmRequest {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export async function generateDraftWithOpenRouter(
  request: DraftLlmRequest
): Promise<string> {
  return openRouterComplete(request.systemPrompt, request.userPrompt, {
    model: request.model ?? config.openRouterModel,
    temperature: request.temperature ?? config.openRouterTemperature,
    maxTokens: request.maxTokens ?? config.openRouterMaxTokens,
  });
}
