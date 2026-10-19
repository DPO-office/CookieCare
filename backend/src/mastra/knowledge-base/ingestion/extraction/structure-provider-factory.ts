import { IsaacusKanonClient, KanonStructureProvider, type EnrichmentClient } from "./kanon.js";
import { DigitalOceanStructureClient } from "./do-structure.js";
import { LlmStructureProvider, type LlmStructureClient } from "./llm-structure.js";
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
    dependencies.llmClient ?? new DigitalOceanStructureClient());
}

export function productionStructureProviderConfiguration(): StructureProviderConfig {
  return resolveStructureProviderConfig(process.env);
}

export function createAuthorizedProductionStructureProvider(raw: unknown,
  env: NodeJS.ProcessEnv = process.env): StructureProvider {
  const configuration = StructureProviderConfigSchema.parse(raw);
  if (configuration.provider === "llm" && !env.DO_MODEL_ACCESS_KEY?.trim())
    throw new Error("DO_MODEL_ACCESS_KEY is required for LLM structure extraction");
  return createStructureProvider(configuration);
}
