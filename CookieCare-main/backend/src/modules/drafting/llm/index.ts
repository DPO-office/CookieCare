import { LLMProvider,LLMTask, PROVIDER_TASK_PRESETS } from "../config/model-specs.js";
import { GeminiProvider } from "./provider/gemini-provider.js";
import { OpenRouterLegacyProvider } from "./provider/openrouter-provider.js"; 
import { ILLMProvider } from "./provider/base-provider.js";

// Keep singleton instances cached in server memory for fast execution pooling
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

// For Rate limit
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

/**
 * THE PLATFORM GENERAL MANAGER FUNCTIONS
 * Call these anywhere across handlers, orchestrators, and validation loops.
 */
export async function executeCompletion(
  prompt: string,
  systemInstruction: string,
  task: LLMTask,
  provider: LLMProvider = LLMProvider.GEMINI // Defaults cleanly to your billing tier
): Promise<string> {
  const engine = getProviderEngine(provider);
  const runtimeConfig = PROVIDER_TASK_PRESETS[provider][task];
  
  return executeWithRetry(() => engine.getCompletion(prompt, systemInstruction, runtimeConfig));
}

export async function executeJsonCompletion<T>(
  prompt: string,
  systemInstruction: string,
  jsonSchema: any,
  task: LLMTask,
  provider: LLMProvider = LLMProvider.GEMINI
): Promise<T> {
  const engine = getProviderEngine(provider);
  const runtimeConfig = PROVIDER_TASK_PRESETS[provider][task];
  
  return executeWithRetry(() => engine.getJsonCompletion<T>(prompt, systemInstruction, jsonSchema, runtimeConfig));
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
  provider: LLMProvider = LLMProvider.GEMINI
): Promise<string> {
  const engine = getProviderEngine(provider);
  const runtimeConfig = PROVIDER_TASK_PRESETS[provider][task];

  if (typeof engine.getCompletionStream === "function") {
    return executeWithRetry(() =>
      engine.getCompletionStream!(prompt, systemInstruction, runtimeConfig, onDelta)
    );
  }

  // Fallback: provider has no streaming — run once and emit the whole result.
  const full = await executeWithRetry(() =>
    engine.getCompletion(prompt, systemInstruction, runtimeConfig)
  );
  onDelta(full);
  return full;
}