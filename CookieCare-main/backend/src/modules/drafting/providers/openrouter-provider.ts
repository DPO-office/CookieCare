export interface OpenRouterClientOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;

  httpReferer?: string;
  xTitle?: string;
  onMetrics?: (metrics: OpenRouterExecutionMetrics) => void;
}

export interface OpenRouterExecutionMetrics {
  model: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

type OpenRouterChatRole = "system" | "user" | "assistant";

interface OpenRouterChatMessage {
  role: OpenRouterChatRole;
  content: string;
}

interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface OpenRouterChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  usage?: OpenRouterUsage;
  error?: { message?: string };
}

export class OpenRouterClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly httpReferer?: string;
  private readonly xTitle?: string;
  private readonly onMetrics?: (metrics: OpenRouterExecutionMetrics) => void;

  constructor(options: OpenRouterClientOptions) {
    if (!options.apiKey || options.apiKey.trim() === "") {
      throw new Error("OpenRouterClient requires a non-empty apiKey.");
    }
    this.apiKey = options.apiKey.trim();
    this.baseUrl = (options.baseUrl ?? "https://openrouter.ai/api/v1").replace(
      /\/+$/,
      ""
    );
    this.model = options.model ?? process.env.OPENROUTER_MODEL ?? "";
    if (!this.model) {
      throw new Error(
        "OpenRouterClient requires a model. Provide `model` or set OPENROUTER_MODEL."
      );
    }
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.httpReferer = options.httpReferer;
    this.xTitle = options.xTitle;
    this.onMetrics = options.onMetrics;
  }

  async getTextCompletion(
    prompt: string,
    systemInstruction: string
  ): Promise<string> {
    const messages: OpenRouterChatMessage[] = [];
    if (systemInstruction && systemInstruction.trim()) {
      messages.push({ role: "system", content: systemInstruction });
    }
    messages.push({ role: "user", content: prompt });

    const { text } = await this.chatCompletions(messages);
    return text;
  }

  async getJsonCompletion<T>(
    prompt: string,
    systemInstruction: string,
    jsonSchema: any
  ): Promise<T> {
    const messages: OpenRouterChatMessage[] = [];
    if (systemInstruction && systemInstruction.trim()) {
      messages.push({ role: "system", content: systemInstruction });
    }

    const schemaHint =
      jsonSchema && typeof jsonSchema === "object"
        ? `\n\nReturn ONLY valid JSON matching this JSON Schema:\n${JSON.stringify(
            jsonSchema
          )}`
        : "\n\nReturn ONLY valid JSON.";

    messages.push({ role: "user", content: `${prompt}${schemaHint}` });

    const responseFormat = this.buildResponseFormat(jsonSchema);
    const { text } = await this.chatCompletions(messages, { responseFormat });

    try {
      return JSON.parse(text) as T;
    } catch (err) {
      const preview = text.length > 2_000 ? `${text.slice(0, 2_000)}…` : text;
      throw new Error(
        `OpenRouter JSON parse failed: ${(err as Error).message}. Raw response: ${preview}`
      );
    }
  }

  private buildResponseFormat(jsonSchema: any): Record<string, unknown> {
    if (jsonSchema && typeof jsonSchema === "object") {
      // OpenRouter is OpenAI-compatible; when json_schema is unsupported by a model,
      // it should still return a useful error which we surface.
      return {
        type: "json_schema",
        json_schema: {
          name: "structured_output",
          strict: true,
          schema: jsonSchema,
        },
      };
    }
    return { type: "json_object" };
  }

  private async chatCompletions(
    messages: OpenRouterChatMessage[],
    options?: {
      responseFormat?: Record<string, unknown>;
    }
  ): Promise<{ text: string; usage?: OpenRouterUsage }> {
    const url = `${this.baseUrl}/chat/completions`;
    const controller = new AbortController();
    const startedAt = Date.now();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
    };
    if (options?.responseFormat) {
      body.response_format = options.responseFormat;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(this.httpReferer ? { "HTTP-Referer": this.httpReferer } : {}),
          ...(this.xTitle ? { "X-Title": this.xTitle } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const isAbort =
        typeof err === "object" && err !== null && (err as any).name === "AbortError";
      if (isAbort) {
        throw new Error(
          `OpenRouter request timed out after ${this.timeoutMs}ms.`
        );
      }
      throw new Error(`OpenRouter network error: ${(err as Error).message}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status === 429) {
      throw new Error("OpenRouter rate limit exceeded (429).");
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `OpenRouter authentication failed (${response.status}). Check API key permissions.`
      );
    }

    const rawText = await response.text();
    let data: OpenRouterChatCompletionResponse | null = null;
    try {
      data = rawText ? (JSON.parse(rawText) as OpenRouterChatCompletionResponse) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const detail =
        data?.error?.message ??
        (rawText && rawText.trim() ? rawText.trim() : "Unknown error");
      throw new Error(`OpenRouter API error (${response.status}): ${detail}`);
    }

    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new Error(
        "OpenRouter response missing expected choices[0].message.content."
      );
    }

    const usage = data?.usage;
    const latencyMs = Date.now() - startedAt;
    const metrics: OpenRouterExecutionMetrics = {
      model: this.model,
      latencyMs,
      promptTokens: usage?.prompt_tokens,
      completionTokens: usage?.completion_tokens,
      totalTokens: usage?.total_tokens,
    };

    console.log("[OpenRouterClient]", metrics);
    this.onMetrics?.(metrics);

    return { text: content, usage };
  }
}

