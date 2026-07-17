import { executeCompletion, executeJsonCompletion } from "../modules/drafting/llm/index.js";
import { LLMTask, LLMProvider } from "../modules/drafting/config/model-specs.js";

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

/**
 * Send a chat completion request to OpenRouter (redirected to Gemini).
 * Returns the assistant message text.
 */
export async function openRouterChat(
  messages: OpenRouterMessage[],
  options: OpenRouterOptions = {}
): Promise<string> {
  console.log("[openRouterChat] Redirecting messages history to Gemini provider");
  const systemMsg = messages.find((m) => m.role === "system");
  const systemPrompt = systemMsg ? systemMsg.content : "";
  const nonSystemMsgs = messages.filter((m) => m.role !== "system");

  let prompt = "";
  if (nonSystemMsgs.length === 1) {
    prompt = nonSystemMsgs[0].content;
  } else {
    prompt = nonSystemMsgs.map((m) => `[${m.role.toUpperCase()}]: ${m.content}`).join("\n\n");
  }

  return openRouterComplete(systemPrompt, prompt, options);
}

/**
 * Convenience wrapper: single system + user prompt → text response.
 * Redirected to Gemini.
 */
export async function openRouterComplete(
  systemPrompt: string,
  userPrompt: string,
  options: OpenRouterOptions = {}
): Promise<string> {
  console.log(
    `[openRouterComplete] Routing call to Gemini provider via modules/drafting/llm (jsonMode=${!!options.jsonMode})`
  );

  if (options.jsonMode) {
    const task = LLMTask.STRUCTURAL_JSON;
    const result = await executeJsonCompletion<any>(
      userPrompt,
      systemPrompt || "",
      undefined, // No explicit schema required
      task,
      LLMProvider.GEMINI
    );
    return JSON.stringify(result);
  } else {
    const task = LLMTask.COMPLEX_DRAFT;
    return executeCompletion(
      userPrompt,
      systemPrompt || "",
      task,
      LLMProvider.GEMINI
    );
  }
}

