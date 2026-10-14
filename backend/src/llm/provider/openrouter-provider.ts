import { CompletionOutcome, estimateTokenUsage, ILLMProvider } from "./base-provider.js";
import { TaskModelConfig } from "../config/model-specs.js";

export class OpenRouterLegacyProvider implements ILLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor() {
    const key = process.env.OPENROUTER_API_KEY || "";
    if (!key || key.trim() === "") {
      throw new Error(
        "OpenRouter Legacy initialization aborted: Missing OPENROUTER_API_KEY in environment configuration."
      );
    }
    this.apiKey = key.trim();
    this.baseUrl = "https://openrouter.ai/api/v1/chat/completions";
  }

  async getCompletion(
    prompt: string,
    systemInstruction: string,
    runtimeConfig: TaskModelConfig
  ): Promise<CompletionOutcome> {
    const messages = [];
    if (systemInstruction?.trim()) {
      messages.push({ role: "system", content: systemInstruction });
    }
    messages.push({ role: "user", content: prompt });

    return this.executeFetchCall(messages, runtimeConfig, undefined, prompt, systemInstruction);
  }

  async getJsonCompletion<T>(
    prompt: string,
    systemInstruction: string,
    jsonSchema: any,
    runtimeConfig: TaskModelConfig
  ): Promise<T> {
    const messages = [];
    if (systemInstruction?.trim()) {
      messages.push({ role: "system", content: systemInstruction });
    }

    const schemaHint = jsonSchema
      ? `\n\nReturn ONLY valid JSON matching this schema:\n${JSON.stringify(jsonSchema)}`
      : "\n\nReturn ONLY valid JSON.";

    messages.push({ role: "user", content: `${prompt}${schemaHint}` });

    const responseFormat = jsonSchema
      ? {
          type: "json_schema",
          json_schema: { name: "structured_output", strict: true, schema: jsonSchema },
        }
      : { type: "json_object" };

    const { text } = await this.executeFetchCall(
      messages,
      runtimeConfig,
      responseFormat,
      prompt,
      systemInstruction
    );

    try {
      return JSON.parse(text) as T;
    } catch (err: any) {
      throw new Error(
        `OpenRouter JSON payload parsing failed: ${err.message}. Raw text payload: ${text}`
      );
    }
  }

  private async executeFetchCall(
    messages: any[],
    runtimeConfig: TaskModelConfig,
    responseFormat?: any,
    prompt = "",
    systemInstruction = ""
  ): Promise<CompletionOutcome> {
    const body: Record<string, any> = {
      model: runtimeConfig.model,
      messages,
      temperature: runtimeConfig.temperature,
    };
    if (runtimeConfig.maxOutputTokens) {
      body.max_tokens = runtimeConfig.maxOutputTokens;
    }
    if (responseFormat) {
      body.response_format = responseFormat;
    }

    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`OpenRouter API endpoint response error (${res.status}): ${errorText}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: unknown }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const choice = data?.choices?.[0];
    const content = choice?.message?.content;

    if (typeof content !== "string") {
      throw new Error(
        "OpenRouter payload emerged from network missing expected text content keys."
      );
    }

    const usage =
      data.usage &&
      typeof data.usage.prompt_tokens === "number" &&
      typeof data.usage.completion_tokens === "number"
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens:
              typeof data.usage.total_tokens === "number"
                ? data.usage.total_tokens
                : data.usage.prompt_tokens + data.usage.completion_tokens,
          }
        : estimateTokenUsage(prompt, systemInstruction, content);

    return { text: content, truncated: choice?.finish_reason === "length", usage };
  }
}
