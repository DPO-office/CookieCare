import { IsaacusKanonClient, KanonStructureProvider, type EnrichmentClient } from "./kanon.js";
import { GeminiStructureClient, LlmStructureProvider, type LlmStructureClient } from "./llm-structure.js";
import { StructureProviderConfigSchema, resolveStructureProviderConfig,
  type StructureProvider, type StructureProviderConfig } from "./structure-provider.js";

export interface StructureProviderDependencies {
  kanonClient?: EnrichmentClient;
  llmClient?: LlmStructureClient;
}

export function createStructureProvider(raw: unknown,
  dependencies: StructureProviderDependencies = {}): StructureProvider {
  const configuration = StructureProviderConfigSchema.parse(raw);
  if (configuration.provider === "kanon") {
    return new KanonStructureProvider(dependencies.kanonClient ?? new IsaacusKanonClient(), configuration);
  }
  return new LlmStructureProvider(configuration,
    dependencies.llmClient ?? new GeminiStructureClient());
}

export function productionStructureProviderConfiguration(): StructureProviderConfig {
  return resolveStructureProviderConfig(process.env);
}

/**
 * The deployed worker may currently transmit private source text only to Isaacus.
 * LLM providers remain available through dependency injection for local evaluation.
 */
export function createAuthorizedProductionStructureProvider(raw: unknown): StructureProvider {
  const configuration = StructureProviderConfigSchema.parse(raw);
  if (configuration.provider !== "kanon") {
    throw new Error("LLM structure transfer is disabled in the production worker until that destination is authorized");
  }
  return createStructureProvider(configuration);
}
