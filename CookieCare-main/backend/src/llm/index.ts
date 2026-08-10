import { LLMProvider, LLMTask, PROVIDER_TASK_PRESETS } from "./config/model-specs.js";
import { GeminiProvider } from "./provider/gemini-provider.js";
import { OpenRouterLegacyProvider } from "./provider/openrouter-provider.js";
import {
  CompletionOutcome,
  estimateTokenUsage,
  ILLMProvider,
  TokenUsage,
} from "./provider/base-provider.js";

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
export type { TaskModelConfig, LLMTaskPreset } from "./config/model-specs.js";

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

export type TokenBudgetTracker = { tokensUsed: number };

function applyUsage(tracker: TokenBudgetTracker | undefined, usage: TokenUsage): void {
  if (tracker) {
    tracker.tokensUsed += usage.totalTokens;
  }
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
  options: {
    maxOutputTokens?: number;
    onDelta?: (delta: string) => void;
    tracker?: TokenBudgetTracker;
  } = {}
): Promise<CompletionOutcome> {
  const engine = getProviderEngine(provider);
  const preset = PROVIDER_TASK_PRESETS[provider][task];
  const runtimeConfig = options.maxOutputTokens
    ? { ...preset, maxOutputTokens: options.maxOutputTokens }
    : preset;

  const { onDelta, tracker } = options;
  let outcome: CompletionOutcome;
  if (onDelta && typeof engine.getCompletionStream === "function") {
    outcome = await executeWithRetry(() =>
      engine.getCompletionStream!(prompt, systemInstruction, runtimeConfig, onDelta)
    );
  } else {
    outcome = await executeWithRetry(() =>
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
  return outcome;
}

export async function executeJsonCompletion<T>(
  prompt: string,
  systemInstruction: string,
  jsonSchema: any,
  task: LLMTask,
  provider: LLMProvider = LLMProvider.GEMINI,
  tracker?: TokenBudgetTracker
): Promise<T> {
  const engine = getProviderEngine(provider);
  const runtimeConfig = PROVIDER_TASK_PRESETS[provider][task];

  const result = await executeWithRetry(() =>
    engine.getJsonCompletion<T>(prompt, systemInstruction, jsonSchema, runtimeConfig)
  );

  // JSON path has no CompletionOutcome; estimate from serialized result for budget tracking.
  if (tracker) {
    const completionText = typeof result === "string" ? result : JSON.stringify(result);
    applyUsage(tracker, estimateTokenUsage(prompt, systemInstruction, completionText));
  }

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
