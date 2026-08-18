import { GoogleGenAI } from "@google/genai";
import { CompletionOutcome, estimateTokenUsage, ILLMProvider } from "./base-provider.js";
import { TaskModelConfig, GEMINI_ENV_CONFIG } from "../config/model-specs.js";

function isTruncated(finishReason: unknown): boolean {
  return typeof finishReason === "string" && finishReason.toUpperCase() === "MAX_TOKENS";
}

function resolveThinkingBudget(runtimeConfig: TaskModelConfig): number {
  if (typeof runtimeConfig.thinkingBudget === "number") {
    return runtimeConfig.thinkingBudget;
  }
  // Legacy fallback: Flash off, Pro on — prefer explicit per-task budgets above.
  const normalized = runtimeConfig.model.toLowerCase();
  if (normalized.includes("flash")) {
    return 0;
  }
  return 1024;
}

function usageFromResponse(
  prompt: string,
  systemInstruction: string,
  text: string,
  usageMetadata: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined
) {
  if (
    usageMetadata &&
    typeof usageMetadata.promptTokenCount === "number" &&
    typeof usageMetadata.candidatesTokenCount === "number"
  ) {
    return {
      promptTokens: usageMetadata.promptTokenCount,
      completionTokens: usageMetadata.candidatesTokenCount,
      totalTokens:
        typeof usageMetadata.totalTokenCount === "number"
          ? usageMetadata.totalTokenCount
          : usageMetadata.promptTokenCount + usageMetadata.candidatesTokenCount,
    };
  }
  return estimateTokenUsage(prompt, systemInstruction, text);
}

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("429") ||
    msg.toLowerCase().includes("resource_exhausted") ||
    msg.toLowerCase().includes("resource exhausted") ||
    msg.toLowerCase().includes("rate limit") ||
    msg.toLowerCase().includes("quota")
  );
}

/** Network blips / region dead ends — worth trying another Vertex location. */
function isTransientNetworkError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("econnrefused") ||
    msg.includes("socket hang up") ||
    msg.includes("other side closed") ||
    msg.includes("undici")
  );
}

function shouldFailoverRegion(err: unknown): boolean {
  return isRateLimitError(err) || isTransientNetworkError(err);
}

export interface GeminiHopTiming {
  location: string;
  ms: number;
  kind: "ok" | "429/quota" | "transient network" | "error";
}

/** Thrown after every Vertex region in the pool has been tried. */
export class GeminiRegionsExhaustedError extends Error {
  readonly geminiRegionsExhausted = true;
  readonly hops: GeminiHopTiming[];

  constructor(message: string, hops: GeminiHopTiming[], cause?: unknown) {
    super(message);
    this.name = "GeminiRegionsExhaustedError";
    this.hops = hops;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

function isRegionsExhausted(err: unknown): err is GeminiRegionsExhaustedError {
  return Boolean(
    err &&
      typeof err === "object" &&
      (err as { geminiRegionsExhausted?: boolean }).geminiRegionsExhausted
  );
}

/**
 * Vertex Gemini quotas are per-region. Round-robin + instant 429 failover
 * across regions multiplies available throughput without waiting on quota raises.
 */
export class GeminiProvider implements ILLMProvider {
  private readonly project: string;
  private readonly regions: string[];
  private readonly clients = new Map<string, GoogleGenAI>();
  /** Round-robin cursor — advanced after each successful call. */
  private rrIndex = 0;

  constructor() {
    const project = GEMINI_ENV_CONFIG.projectId;
    if (!project || project.trim() === "") {
      throw new Error("Gemini initialization failed: GOOGLE_CLOUD_PROJECT variable is missing.");
    }
    this.project = project.trim();
    this.regions =
      GEMINI_ENV_CONFIG.locations?.length > 0
        ? GEMINI_ENV_CONFIG.locations
        : [GEMINI_ENV_CONFIG.location || "us-east4"];

    console.log(
      `[Gemini] Multi-region pool (${this.regions.length}): ${this.regions.join(" → ")}`
    );
  }

  private clientFor(location: string): GoogleGenAI {
    const key = location.trim();
    let client = this.clients.get(key);
    if (!client) {
      client = new GoogleGenAI({
        enterprise: true,
        project: this.project,
        location: key,
      });
      this.clients.set(key, client);
    }
    return client;
  }

  /** Ordered region list starting at the current round-robin cursor. */
  private regionOrder(): string[] {
    const n = this.regions.length;
    const start = this.rrIndex % n;
    return [...this.regions.slice(start), ...this.regions.slice(0, start)];
  }

  private advanceRoundRobin(usedLocation: string): void {
    const idx = this.regions.indexOf(usedLocation);
    if (idx >= 0) {
      this.rrIndex = (idx + 1) % this.regions.length;
    } else {
      this.rrIndex = (this.rrIndex + 1) % this.regions.length;
    }
  }

  /**
   * Run an operation against the next region; on 429, immediately try the next
   * region (fresh quota pool) before surfacing the error to the scheduler.
   */
  private async withRegionFailover<T>(
    label: string,
    op: (ai: GoogleGenAI, location: string) => Promise<T>
  ): Promise<T> {
    const order = this.regionOrder();
    let lastErr: unknown;
    const hops: GeminiHopTiming[] = [];

    for (let i = 0; i < order.length; i++) {
      const location = order[i];
      const hopStart = Date.now();
      try {
        const result = await op(this.clientFor(location), location);
        hops.push({ location, ms: Date.now() - hopStart, kind: "ok" });
        if (i > 0) {
          console.log(
            `[Gemini] ${label} recovered on region ${location} after ${i} failover(s) hops=${JSON.stringify(hops)}`
          );
        }
        this.advanceRoundRobin(location);
        return result;
      } catch (err) {
        lastErr = err;
        const kind = isRateLimitError(err)
          ? "429/quota"
          : isTransientNetworkError(err)
            ? "transient network"
            : "error";
        hops.push({ location, ms: Date.now() - hopStart, kind });
        if (shouldFailoverRegion(err) && i < order.length - 1) {
          const next = order[i + 1];
          console.warn(
            `[Gemini] ${kind} on ${location} for ${label} hopMs=${hops[hops.length - 1].ms} — failing over to ${next} (region ${i + 1}/${order.length})`
          );
          continue;
        }
        if (shouldFailoverRegion(err)) {
          throw new GeminiRegionsExhaustedError(
            `Gemini ${label} failed across all regions (${order.join(", ")}): ${
              err instanceof Error ? err.message : String(err)
            }`,
            hops,
            err
          );
        }
        throw err;
      }
    }

    throw new GeminiRegionsExhaustedError(
      `Gemini failed across all regions: ${String(lastErr)}`,
      hops,
      lastErr
    );
  }

  async getCompletion(
    prompt: string,
    systemInstruction: string,
    runtimeConfig: TaskModelConfig
  ): Promise<CompletionOutcome> {
    try {
      return await this.withRegionFailover("completion", async (ai) => {
        const response = await ai.models.generateContent({
          model: runtimeConfig.model,
          contents: prompt,
          config: {
            systemInstruction: systemInstruction,
            temperature: runtimeConfig.temperature,
            maxOutputTokens: runtimeConfig.maxOutputTokens,
            thinkingConfig: { thinkingBudget: resolveThinkingBudget(runtimeConfig) },
          },
        });

        const text = response.text ?? "";
        return {
          text,
          truncated: isTruncated(response.candidates?.[0]?.finishReason),
          usage: usageFromResponse(prompt, systemInstruction, text, response.usageMetadata as any),
        };
      });
    } catch (err: any) {
      if (isRegionsExhausted(err)) throw err;
      throw new Error(`Gemini Completion Engine failure: ${err.message}`);
    }
  }

  async getCompletionStream(
    prompt: string,
    systemInstruction: string,
    runtimeConfig: TaskModelConfig,
    onDelta: (delta: string) => void
  ): Promise<CompletionOutcome> {
    try {
      return await this.withRegionFailover("stream", async (ai) => {
        const stream = await ai.models.generateContentStream({
          model: runtimeConfig.model,
          contents: prompt,
          config: {
            systemInstruction: systemInstruction,
            temperature: runtimeConfig.temperature,
            maxOutputTokens: runtimeConfig.maxOutputTokens,
            thinkingConfig: { thinkingBudget: resolveThinkingBudget(runtimeConfig) },
          },
        });

        let full = "";
        let finishReason: unknown;
        let usageMetadata: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined;
        for await (const chunk of stream) {
          const piece = chunk.text ?? "";
          finishReason = chunk.candidates?.[0]?.finishReason ?? finishReason;
          usageMetadata = (chunk as any).usageMetadata ?? usageMetadata;
          if (piece) {
            full += piece;
            try {
              onDelta(piece);
            } catch {
              /* delivery is best-effort */
            }
          }
        }
        return {
          text: full,
          truncated: isTruncated(finishReason),
          usage: usageFromResponse(prompt, systemInstruction, full, usageMetadata),
        };
      });
    } catch (err: any) {
      if (isRegionsExhausted(err)) throw err;
      throw new Error(`Gemini Streaming Engine failure: ${err.message}`);
    }
  }

  async getJsonCompletion<T>(
    prompt: string,
    systemInstruction: string,
    jsonSchema: any,
    runtimeConfig: TaskModelConfig
  ): Promise<T> {
    try {
      return await this.withRegionFailover("json", async (ai) => {
        const response = await ai.models.generateContent({
          model: runtimeConfig.model,
          contents: prompt,
          config: {
            systemInstruction: systemInstruction,
            temperature: runtimeConfig.temperature,
            responseMimeType: "application/json",
            responseSchema: jsonSchema,
            thinkingConfig: { thinkingBudget: resolveThinkingBudget(runtimeConfig) },
          },
        });

        const rawText = response.text;
        if (!rawText) {
          throw new Error("Gemini returned an empty structured content response block.");
        }

        return JSON.parse(rawText) as T;
      });
    } catch (err: any) {
      if (isRegionsExhausted(err)) throw err;
      throw new Error(`Gemini JSON Processing Circuit failure: ${err.message}`);
    }
  }

  /**
   * JSON completion that also returns usageMetadata token counts.
   * Called by executeJsonCompletionWithMeta in llm/index.ts.
   */
  async getJsonCompletionWithMeta<T>(
    prompt: string,
    systemInstruction: string,
    jsonSchema: any,
    runtimeConfig: TaskModelConfig
  ): Promise<{ result: T; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
    try {
      return await this.withRegionFailover("json-meta", async (ai) => {
        const response = await ai.models.generateContent({
          model: runtimeConfig.model,
          contents: prompt,
          config: {
            systemInstruction: systemInstruction,
            temperature: runtimeConfig.temperature,
            responseMimeType: "application/json",
            responseSchema: jsonSchema,
            thinkingConfig: { thinkingBudget: resolveThinkingBudget(runtimeConfig) },
          },
        });

        const rawText = response.text;
        if (!rawText) {
          throw new Error("Gemini returned an empty structured content response block.");
        }

        const meta = (response as any).usageMetadata;
        const usage = {
          promptTokens: meta?.promptTokenCount ?? 0,
          completionTokens: meta?.candidatesTokenCount ?? 0,
          totalTokens: meta?.totalTokenCount ?? 0,
        };

        return { result: JSON.parse(rawText) as T, usage };
      });
    } catch (err: any) {
      if (isRegionsExhausted(err)) throw err;
      throw new Error(`Gemini JSON Processing Circuit failure: ${err.message}`);
    }
  }
}
