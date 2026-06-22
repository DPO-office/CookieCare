/**
 * Centralized OpenRouter AI client.
 * All AI functionality in this app routes through this module.
 * Endpoint: https://openrouter.ai/api/v1
 * Model:    deepseek/deepseek-chat-v3-0324 (reliable, cost-effective)
 */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "deepseek/deepseek-chat-v3-0324";

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

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || key.trim() === "") {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Please add it to your environment variables."
    );
  }
  return key.trim();
}

/**
 * Send a chat completion request to OpenRouter.
 * Returns the assistant message text.
 */
export async function openRouterChat(
  messages: OpenRouterMessage[],
  options: OpenRouterOptions = {}
): Promise<string> {
  const apiKey = getApiKey();
  const model = options.model ?? DEFAULT_MODEL;

  const body: Record<string, any> = {
    model,
    messages,
    temperature: options.temperature ?? 0.3,
  };

  if (options.maxTokens) {
    body.max_tokens = options.maxTokens;
  }

  if (options.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  let response: Response;
  try {
    response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://cookiecare.app",
        "X-Title": "CookieCare Legal AI",
      },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    throw new Error(
      `OpenRouter network error: ${(networkErr as Error).message}`
    );
  }

  if (response.status === 429) {
    throw new Error(
      "OpenRouter rate limit exceeded (429). Please wait before retrying."
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `OpenRouter authentication failed (${response.status}). Check your OPENROUTER_API_KEY.`
    );
  }

  if (!response.ok) {
    let detail = "";
    try {
      const errBody = await response.json();
      detail = errBody?.error?.message ?? JSON.stringify(errBody);
    } catch {
      detail = await response.text();
    }
    throw new Error(`OpenRouter API error (${response.status}): ${detail}`);
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error("OpenRouter returned a malformed JSON response.");
  }

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error(
      "OpenRouter response missing expected choices[0].message.content."
    );
  }

  return text;
}

/**
 * Convenience wrapper: single system + user prompt → text response.
 */
export async function openRouterComplete(
  systemPrompt: string,
  userPrompt: string,
  options: OpenRouterOptions = {}
): Promise<string> {
  const messages: OpenRouterMessage[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: userPrompt });
  return openRouterChat(messages, options);
}
