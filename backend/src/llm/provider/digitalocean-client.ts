/** DigitalOcean serverless inference uses an OpenAI-compatible chat endpoint. */
export const DO_CHAT_URL = "https://inference.do-ai.run/v1/chat/completions";

export interface DoChatRequest {
  model: string;
  systemInstruction: string;
  prompt: string;
  temperature?: number;
  maxCompletionTokens?: number;
  reasoningEffort?: "low" | "high" | "max";
  responseSchema?: unknown;
  responseSchemaStrict?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
  retryOnTimeout?: boolean;
}

export interface DoChatResult {
  text: string;
  finishReason: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null } | null;
  rawResponse: unknown;
}

export class DigitalOceanInferenceClient {
  constructor(private readonly apiKey = process.env.DO_MODEL_ACCESS_KEY,
    private readonly fetcher: typeof fetch = fetch) {}

  async chat(input: DoChatRequest): Promise<DoChatResult> {
    if (!this.apiKey?.trim()) throw new Error("DO_MODEL_ACCESS_KEY is required for DigitalOcean inference");
    if (!input.model.trim()) throw new Error("DigitalOcean model ID is required");
    const messages = [
      ...(input.systemInstruction.trim() ? [{ role: "system", content: input.systemInstruction }] : []),
      { role: "user", content: input.prompt },
    ];
    const body: Record<string, unknown> = { model: input.model, messages, stream: false,
      ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
      ...(input.maxCompletionTokens === undefined ? {} : { max_completion_tokens: input.maxCompletionTokens }),
      ...(input.reasoningEffort === undefined ? {} : { reasoning_effort: input.reasoningEffort }),
      // Existing task schemas include bounds and optional properties beyond the strict subset.
      // Their callers retain the final Zod checks; use the schema to guide generation here.
      ...(input.responseSchema === undefined ? {} : { response_format: { type: "json_schema",
        json_schema: { name: "structured_output", strict: input.responseSchemaStrict ?? false,
          schema: input.responseSchema } } }),
    };
    const defaultTimeout = process.env.DO_INFERENCE_TIMEOUT_MS ? Number(process.env.DO_INFERENCE_TIMEOUT_MS) : 600_000;
    const maxRetries = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const deadline = AbortSignal.timeout(input.timeoutMs ?? defaultTimeout);
        const signal = input.signal ? AbortSignal.any([input.signal, deadline]) : deadline;
        const response = await this.fetcher(DO_CHAT_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            Connection: "close",
          },
          body: JSON.stringify(body),
          signal,
        });

        if (!response.ok) {
          if ([429, 502, 503, 504].includes(response.status) && attempt < maxRetries) {
            const delayMs = attempt * 2000;
            process.stdout.write(`      ⚠ DigitalOcean returned HTTP ${response.status}; retrying in ${(delayMs / 1000).toFixed(1)}s (attempt ${attempt}/${maxRetries})...\n`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue;
          }
          throw new Error(`DigitalOcean inference failed with HTTP ${response.status}`);
        }

        const raw = await response.json() as {
          choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>;
          usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
        };
        const choice = raw.choices?.[0];
        const message = choice?.message as { content?: unknown; reasoning_content?: unknown } | undefined;
        const text = message?.content;
        const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
        const isTruncated = finishReason?.toLowerCase() === "length" ||
          finishReason?.toLowerCase() === "max_tokens" ||
          (Boolean(message?.reasoning_content) && (typeof text !== "string" || !text.trim()));

        const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
        const usage = raw.usage ? { inputTokens: number(raw.usage.prompt_tokens),
          outputTokens: number(raw.usage.completion_tokens), totalTokens: number(raw.usage.total_tokens) } : null;

        if (isTruncated) {
          return {
            text: typeof text === "string" ? text : "",
            finishReason: "length",
            usage,
            rawResponse: raw,
          };
        }

        if (typeof text !== "string" || !text.trim()) {
          const summary = JSON.stringify(raw).slice(0, 500);
          throw new Error(`DigitalOcean inference returned no text. Finish reason: ${finishReason}. Details: ${summary}`);
        }
        if (text.length > 10_000_000) throw new Error("DigitalOcean inference output exceeds 10 MB");
        return { text, finishReason, usage, rawResponse: raw };
      } catch (err: unknown) {
        lastError = err;
        if (input.signal?.aborted) throw err;
        const isTimeout = err instanceof Error && err.name === "TimeoutError";
        const isNetworkOrTransient =
          err instanceof TypeError ||
          (err instanceof Error && (
            (isTimeout && input.retryOnTimeout !== false) ||
            err.message.includes("fetch failed") ||
            err.message.includes("ECONNRESET") ||
            err.message.includes("ETIMEDOUT") ||
            err.message.includes("undici")
          ));

        if (isNetworkOrTransient && attempt < maxRetries) {
          const delayMs = attempt * 3000;
          const detail = (err as { cause?: { message?: string } })?.cause?.message ?? (err instanceof Error ? err.message : String(err));
          process.stdout.write(`      ⚠ DigitalOcean request transient error (${detail}); retrying in ${(delayMs / 1000).toFixed(1)}s (attempt ${attempt}/${maxRetries})...\n`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }

  async chatStream(input: DoChatRequest, onDelta: (delta: string) => void): Promise<DoChatResult> {
    if (!this.apiKey?.trim()) throw new Error("DO_MODEL_ACCESS_KEY is required for DigitalOcean inference");
    const defaultTimeout = process.env.DO_INFERENCE_TIMEOUT_MS ? Number(process.env.DO_INFERENCE_TIMEOUT_MS) : 600_000;
    const deadline = AbortSignal.timeout(input.timeoutMs ?? defaultTimeout);
    const response = await this.fetcher(DO_CHAT_URL, { method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: input.model, stream: true,
        messages: [
          ...(input.systemInstruction.trim() ? [{ role: "system", content: input.systemInstruction }] : []),
          { role: "user", content: input.prompt },
        ],
        ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
        ...(input.maxCompletionTokens === undefined ? {} : { max_completion_tokens: input.maxCompletionTokens }),
        ...(input.reasoningEffort === undefined ? {} : { reasoning_effort: input.reasoningEffort }),
      }),
      signal: input.signal ? AbortSignal.any([input.signal, deadline]) : deadline });
    if (!response.ok) throw new Error(`DigitalOcean inference failed with HTTP ${response.status}`);
    if (!response.body) throw new Error("DigitalOcean inference returned no stream");
    let buffer = "", text = "", finishReason: string | null = null;
    let usage: DoChatResult["usage"] = null;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const consume = (line: string) => {
      if (!line.startsWith("data:")) return;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") return;
      const event = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: unknown };
        finish_reason?: unknown }>; usage?: { prompt_tokens?: number; completion_tokens?: number;
        total_tokens?: number } };
      const choice = event.choices?.[0];
      const delta = choice?.delta?.content;
      if (typeof delta === "string" && delta) {
        text += delta;
        if (text.length > 10_000_000) throw new Error("DigitalOcean inference output exceeds 10 MB");
        onDelta(delta);
      }
      if (typeof choice?.finish_reason === "string") finishReason = choice.finish_reason;
      if (event.usage) usage = { inputTokens: event.usage.prompt_tokens ?? null,
        outputTokens: event.usage.completion_tokens ?? null,
        totalTokens: event.usage.total_tokens ?? null };
    };
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let split: number;
        while ((split = buffer.indexOf("\n")) >= 0) {
          consume(buffer.slice(0, split).trimEnd());
          buffer = buffer.slice(split + 1);
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) consume(buffer.trim());
    } finally { reader.releaseLock(); }
    if (!text.trim()) throw new Error("DigitalOcean inference returned no streamed text");
    return { text, finishReason, usage, rawResponse: { streamed: true } };
  }
}
