import { LLMProvider,LLMTask, PROVIDER_TASK_PRESETS } from "../config/model-specs.js";
import { GeminiProvider } from "../../../llm/provider/gemini-provider.js";
import { DigitalOceanProvider } from "../../../llm/provider/digitalocean-provider.js";
import { OpenRouterLegacyProvider } from "../../../llm/provider/openrouter-provider.js";
import { CompletionOutcome, ILLMProvider } from "../../../llm/provider/base-provider.js";
import { geminiScheduler } from "../../compare/utils/llm-scheduler.js";

export type { CompletionOutcome } from "../../../llm/provider/base-provider.js";

// Keep singleton instances cached in server memory for fast execution pooling
const providersCache: Record<string, ILLMProvider> = {};

function resolveGenerationProvider(provider: LLMProvider): LLMProvider {
  if (provider !== LLMProvider.GEMINI) return provider;
  const selected = process.env.LLM_GENERATION_PROVIDER?.trim().toLowerCase() || "digitalocean";
  if (selected === "digitalocean") return LLMProvider.DIGITALOCEAN;
  if (selected === "gemini") return LLMProvider.GEMINI;
  throw new Error(`Unsupported LLM_GENERATION_PROVIDER: ${selected}`);
}

function getProviderEngine(provider: LLMProvider): ILLMProvider {
  provider = resolveGenerationProvider(provider);
  if (!providersCache[provider]) {
    switch (provider) {
      case LLMProvider.DIGITALOCEAN:
        providersCache[provider] = new DigitalOceanProvider();
        break;
      case LLMProvider.GEMINI:
        providersCache[provider] = new GeminiProvider();
        break;
      case LLMProvider.OPENROUTER:
        providersCache[provider] = new OpenRouterLegacyProvider();
        break;
      default:
        throw new Error(`Unsupported LLM routing provider instance request: ${provider}`);
    }
  }
  return providersCache[provider];
}

function runtimePreset(provider: LLMProvider, task: LLMTask) {
  const effective = resolveGenerationProvider(provider);
  const preset = PROVIDER_TASK_PRESETS[effective][task];
  if (effective !== LLMProvider.DIGITALOCEAN) return preset;
  const strong = task === LLMTask.COMPLEX_DRAFT || task === LLMTask.SECTION_REFINE ||
    task === LLMTask.COMPARE_RISK;
  return { ...preset, model: (strong ? process.env.DO_LLM_REASONING_MODEL : process.env.DO_LLM_FAST_MODEL)?.trim() ||
    (strong ? "glm-5.3" : "glm-5.3-flash") };
}

/**
 * Legacy fixed-delay retry — kept for non-Gemini providers and streaming calls
 * that do not go through the scheduler.
 */
async function executeWithRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 6000
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      const errMsg = error instanceof Error ? error.message : String(error);
      const isRateLimit = errMsg.includes("429") || 
                          errMsg.toLowerCase().includes("resource_exhausted") || 
                          errMsg.toLowerCase().includes("resource exhausted") ||
                          errMsg.toLowerCase().includes("rate limit");
      
      if (isRateLimit && attempt <= retries) {
        console.warn(`[LLM Rate Limit] Detected rate limit error (429/RESOURCE_EXHAUSTED). Retrying attempt ${attempt}/${retries} in ${delayMs / 1000}s... Error:`, errMsg);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw error;
    }
  }
}

// ─── Token metadata ───────────────────────────────────────────────────────────

/**
 * Token usage reported by the provider alongside a JSON completion.
 * Fields are optional because not all providers expose them.
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface JsonCompletionWithMeta<T> {
  result: T;
  usage: TokenUsage;
}

/**
 * THE PLATFORM GENERAL MANAGER FUNCTIONS
 * Call these anywhere across handlers, orchestrators, and validation loops.
 */
export async function executeCompletion(
  prompt: string,
  systemInstruction: string,
  task: LLMTask,
  provider: LLMProvider = LLMProvider.DIGITALOCEAN
): Promise<string> {
  const { text } = await executeBoundedCompletion(prompt, systemInstruction, task, provider);
  return text;
}

/**
 * Completion variant for callers that need to know *why* the model stopped and want to
 * size the output budget per request instead of using the static task preset.
 *
 * Streams when `onDelta` is supplied (falling back to a single blocking call for providers
 * without streaming support), and always resolves with the truncation flag so long-document
 * callers can issue a continuation pass rather than saving a half-finished artifact.
 */
export async function executeBoundedCompletion(
  prompt: string,
  systemInstruction: string,
  task: LLMTask,
  provider: LLMProvider = LLMProvider.DIGITALOCEAN,
  options: { maxOutputTokens?: number; onDelta?: (delta: string) => void } = {}
): Promise<CompletionOutcome> {
  const engine = getProviderEngine(provider);
  const preset = runtimePreset(provider, task);
  const runtimeConfig = options.maxOutputTokens
    ? { ...preset, maxOutputTokens: options.maxOutputTokens }
    : preset;

  const { onDelta } = options;
  if (onDelta && typeof engine.getCompletionStream === "function") {
    return executeWithRetry(() =>
      engine.getCompletionStream!(prompt, systemInstruction, runtimeConfig, onDelta)
    );
  }

  const outcome = await executeWithRetry(() =>
    engine.getCompletion(prompt, systemInstruction, runtimeConfig)
  );
  // Provider has no streaming — emit the whole result once so `onDelta` always fires.
  if (onDelta) onDelta(outcome.text);
  return outcome;
}

export async function executeJsonCompletion<T>(
  prompt: string,
  systemInstruction: string,
  jsonSchema: any,
  task: LLMTask,
  provider: LLMProvider = LLMProvider.DIGITALOCEAN
): Promise<T> {
  const engine = getProviderEngine(provider);
  const runtimeConfig = runtimePreset(provider, task);

  // Route Gemini calls through the scheduler for adaptive pacing + smart retry.
  // OpenRouter and other providers use the legacy fixed-delay retry.
  if (resolveGenerationProvider(provider) === LLMProvider.GEMINI) {
    return geminiScheduler.execute(
      () => engine.getJsonCompletion<T>(prompt, systemInstruction, jsonSchema, runtimeConfig),
      task
    );
  }

  return executeWithRetry(() =>
    engine.getJsonCompletion<T>(prompt, systemInstruction, jsonSchema, runtimeConfig)
  );
}

/**
 * Variant of executeJsonCompletion that also returns token usage metadata.
 * Used by Compare pipeline steps to populate PipelineMetrics.
 *
 * Token counts are best-effort: when the provider does not expose them
 * (or the SDK version omits usageMetadata) the usage fields are all 0.
 */
export async function executeJsonCompletionWithMeta<T>(
  prompt: string,
  systemInstruction: string,
  jsonSchema: any,
  task: LLMTask,
  provider: LLMProvider = LLMProvider.DIGITALOCEAN
): Promise<JsonCompletionWithMeta<T>> {
  const engine = getProviderEngine(provider) as GeminiProvider & {
    getJsonCompletionWithMeta?: <U>(
      prompt: string,
      systemInstruction: string,
      jsonSchema: any,
      runtimeConfig: any
    ) => Promise<{ result: U; usage: TokenUsage }>;
  };
  const runtimeConfig = runtimePreset(provider, task);

  // If the provider exposes a meta variant, use it.
  // Otherwise fall back to the standard completion and return zero usage.
  if (typeof engine.getJsonCompletionWithMeta === "function") {
    if (resolveGenerationProvider(provider) === LLMProvider.GEMINI) {
      return geminiScheduler.execute(
        () =>
          engine.getJsonCompletionWithMeta!<T>(
            prompt,
            systemInstruction,
            jsonSchema,
            runtimeConfig
          ),
        `${task} (meta)`
      );
    }
    return executeWithRetry(() =>
      engine.getJsonCompletionWithMeta!<T>(
        prompt,
        systemInstruction,
        jsonSchema,
        runtimeConfig
      )
    );
  }

  // Fallback: call standard completion, return zero usage
  const result = await executeJsonCompletion<T>(
    prompt,
    systemInstruction,
    jsonSchema,
    task,
    provider
  );
  return { result, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
}

/**
 * Streaming variant of executeCompletion. Emits each chunk via `onDelta` as it arrives
 * and resolves with the full text. If the selected provider does not implement streaming,
 * we transparently fall back to a single blocking completion and emit it once at the end,
 * so callers can always rely on `onDelta` firing at least once.
 */
export async function executeCompletionStream(
  prompt: string,
  systemInstruction: string,
  task: LLMTask,
  onDelta: (delta: string) => void,
  provider: LLMProvider = LLMProvider.DIGITALOCEAN
): Promise<string> {
  const { text } = await executeBoundedCompletion(prompt, systemInstruction, task, provider, { onDelta });
  return text;
}
