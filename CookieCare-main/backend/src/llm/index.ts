import { LLMProvider, LLMTask, PROVIDER_TASK_PRESETS } from "./config/model-specs.js";
import type { GeminiThinkingLevel, TaskModelConfig } from "./config/model-specs.js";
import { GeminiProvider } from "./provider/gemini-provider.js";
import { OpenRouterLegacyProvider } from "./provider/openrouter-provider.js";
import {
  CompletionOutcome,
  estimateTokenUsage,
  ILLMProvider,
  TokenUsage,
} from "./provider/base-provider.js";
import { geminiScheduler, geminiEmbedScheduler } from "../modules/compare/utils/llm-scheduler.js";

export type { CompletionOutcome, TokenUsage } from "./provider/base-provider.js";
export { estimateTokenUsage } from "./provider/base-provider.js";
export {
  LLMProvider,
  LLMTask,
  PROVIDER_TASK_PRESETS,
  resolveOutputTokenCeiling,
  GEMINI_ENV_CONFIG,
  GeminiModel,
  OpenRouterModel,
} from "./config/model-specs.js";
export type { TaskModelConfig, LLMTaskPreset, GeminiThinkingLevel } from "./config/model-specs.js";

const providersCache: Record<string, ILLMProvider> = {};

function getProviderEngine(provider: LLMProvider): ILLMProvider {
  if (!providersCache[provider]) {
    switch (provider) {
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

/** Legacy fixed-delay retry — non-Gemini providers only. */
async function executeWithRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 6000): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      const errMsg = error instanceof Error ? error.message : String(error);
      const isRateLimit =
        errMsg.includes("429") ||
        errMsg.toLowerCase().includes("resource_exhausted") ||
        errMsg.toLowerCase().includes("resource exhausted") ||
        errMsg.toLowerCase().includes("rate limit");

      if (isRateLimit && attempt <= retries) {
        console.warn(
          `[LLM Rate Limit] Detected rate limit error (429/RESOURCE_EXHAUSTED). Retrying attempt ${attempt}/${retries} in ${delayMs / 1000}s... Error:`,
          errMsg
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw error;
    }
  }
}

async function runProviderCall<T>(
  provider: LLMProvider,
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  if (provider === LLMProvider.GEMINI) {
    return geminiScheduler.execute(fn, label);
  }
  return executeWithRetry(fn);
}

export type TokenBudgetTracker = { tokensUsed: number };

export type CompletionCallOptions = {
  maxOutputTokens?: number;
  onDelta?: (delta: string) => void;
  tracker?: TokenBudgetTracker;
  /** Overlay Gemini 3.x thinking level without changing the task's model. */
  thinkingLevel?: GeminiThinkingLevel;
};

function applyUsage(tracker: TokenBudgetTracker | undefined, usage: TokenUsage): void {
  if (tracker) {
    tracker.tokensUsed += usage.totalTokens;
  }
}

function mergeRuntimeConfig(
  provider: LLMProvider,
  task: LLMTask,
  options: CompletionCallOptions = {}
): TaskModelConfig {
  const preset = PROVIDER_TASK_PRESETS[provider][task];
  const runtimeConfig: TaskModelConfig = { ...preset };
  if (typeof options.maxOutputTokens === "number") {
    runtimeConfig.maxOutputTokens = options.maxOutputTokens;
  }
  if (options.thinkingLevel) {
    runtimeConfig.thinkingLevel = options.thinkingLevel;
    // Gemini 3.x uses thinkingLevel; clear legacy budget to avoid mixing.
    delete runtimeConfig.thinkingBudget;
  }
  return runtimeConfig;
}

export async function executeCompletion(
  prompt: string,
  systemInstruction: string,
  task: LLMTask,
  provider: LLMProvider = LLMProvider.GEMINI,
  tracker?: TokenBudgetTracker
): Promise<string> {
  const { text } = await executeBoundedCompletion(prompt, systemInstruction, task, provider, {
    tracker,
  });
  return text;
}

export async function executeBoundedCompletion(
  prompt: string,
  systemInstruction: string,
  task: LLMTask,
  provider: LLMProvider = LLMProvider.GEMINI,
  options: CompletionCallOptions = {}
): Promise<CompletionOutcome> {
  const engine = getProviderEngine(provider);
  const runtimeConfig = mergeRuntimeConfig(provider, task, options);

  const { onDelta, tracker } = options;
  const t0 = Date.now();
  let outcome: CompletionOutcome;
  if (onDelta && typeof engine.getCompletionStream === "function") {
    outcome = await runProviderCall(provider, `${task} stream`, () =>
      engine.getCompletionStream!(prompt, systemInstruction, runtimeConfig, onDelta)
    );
  } else {
    outcome = await runProviderCall(provider, task, () =>
      engine.getCompletion(prompt, systemInstruction, runtimeConfig)
    );
    if (onDelta) onDelta(outcome.text);
  }

  if (!outcome.usage) {
    outcome = {
      ...outcome,
      usage: estimateTokenUsage(prompt, systemInstruction, outcome.text),
    };
  }
  applyUsage(tracker, outcome.usage);
  console.log(
    `[LLM] ${task} model=${runtimeConfig.model} thinking=${runtimeConfig.thinkingLevel ?? "-"} ms=${Date.now() - t0} ` +
      `promptChars=${prompt.length + (systemInstruction?.length ?? 0)} ` +
      `outChars=${outcome.text.length} inTok=${outcome.usage.promptTokens} ` +
      `outTok=${outcome.usage.completionTokens} totalTok=${outcome.usage.totalTokens}`
  );
  return outcome;
}

function normalizeJsonOptions(
  trackerOrOptions?: TokenBudgetTracker | CompletionCallOptions
): CompletionCallOptions {
  if (!trackerOrOptions) return {};
  if ("tokensUsed" in trackerOrOptions && !("thinkingLevel" in trackerOrOptions)) {
    return { tracker: trackerOrOptions as TokenBudgetTracker };
  }
  return trackerOrOptions as CompletionCallOptions;
}

export async function executeJsonCompletion<T>(
  prompt: string,
  systemInstruction: string,
  jsonSchema: any,
  task: LLMTask,
  provider: LLMProvider = LLMProvider.GEMINI,
  trackerOrOptions?: TokenBudgetTracker | CompletionCallOptions
): Promise<T> {
  const options = normalizeJsonOptions(trackerOrOptions);
  const engine = getProviderEngine(provider);
  const runtimeConfig = mergeRuntimeConfig(provider, task, options);
  const t0 = Date.now();

  const result = await runProviderCall(provider, task, () =>
    engine.getJsonCompletion<T>(prompt, systemInstruction, jsonSchema, runtimeConfig)
  );

  const completionText = typeof result === "string" ? result : JSON.stringify(result);
  const usage = estimateTokenUsage(prompt, systemInstruction, completionText);
  // JSON path has no CompletionOutcome; estimate from serialized result for budget tracking.
  if (options.tracker) {
    applyUsage(options.tracker, usage);
  }
  console.log(
    `[LLM] ${task} json model=${runtimeConfig.model} thinking=${runtimeConfig.thinkingLevel ?? "-"} ms=${Date.now() - t0} ` +
      `promptChars=${prompt.length + (systemInstruction?.length ?? 0)} ` +
      `outChars=${completionText.length} inTok=${usage.promptTokens} ` +
      `outTok=${usage.completionTokens} totalTok=${usage.totalTokens}`
  );

  return result;
}

export async function executeCompletionStream(
  prompt: string,
  systemInstruction: string,
  task: LLMTask,
  onDelta: (delta: string) => void,
  provider: LLMProvider = LLMProvider.GEMINI,
  tracker?: TokenBudgetTracker
): Promise<string> {
  const { text } = await executeBoundedCompletion(prompt, systemInstruction, task, provider, {
    onDelta,
    tracker,
  });
  return text;
}

const EMBED_BATCH_SIZE = Math.max(1, Number(process.env.GEMINI_EMBED_BATCH_SIZE || 64));

/**
 * Batch text embedding (Semantic Retrieval plan, R0). Gemini-only today —
 * OpenRouter has no embedding endpoint on this stack. Runs through its own
 * scheduler lane (`geminiEmbedScheduler`), never the generation lane, so a
 * burst of clause embeddings cannot starve chat/JSON calls.
 *
 * Never throws: a failed batch returns `null` at each of its indices so
 * callers (retrieval) fall back to lexical-only for those items instead of
 * failing the whole run. Order is preserved and matches `texts`.
 */
export async function executeEmbedding(
  texts: string[],
  provider: LLMProvider = LLMProvider.GEMINI
): Promise<Array<number[] | null>> {
  if (texts.length === 0) return [];
  const engine = getProviderEngine(provider);
  if (!engine.embed) {
    console.warn(`[LLM] embed() unsupported for provider=${provider} — returning nulls`);
    return texts.map(() => null);
  }

  const results: Array<number[] | null> = new Array(texts.length).fill(null);
  for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBED_BATCH_SIZE);
    const t0 = Date.now();
    try {
      const vectors = await geminiEmbedScheduler.execute(
        () => engine.embed!(batch),
        `embed batch[${batch.length}]`
      );
      for (let i = 0; i < vectors.length; i++) results[start + i] = vectors[i];
      console.log(
        `[LLM] embed batch=${batch.length} ms=${Date.now() - t0} ` +
          `ok=${vectors.filter((v) => v !== null).length}/${vectors.length}`
      );
    } catch (err) {
      console.warn(
        `[LLM] embed batch failed (${batch.length} texts) — leaving nulls:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return results;
}
