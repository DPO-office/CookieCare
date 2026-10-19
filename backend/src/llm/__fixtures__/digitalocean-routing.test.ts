import assert from "node:assert/strict";
import test from "node:test";
import { LLMProvider, LLMTask, PROVIDER_TASK_PRESETS, resolveGenerationProvider } from "../index.js";

test("legacy Gemini generation calls route to DigitalOcean by default", () => {
  const prior = process.env.LLM_GENERATION_PROVIDER;
  delete process.env.LLM_GENERATION_PROVIDER;
  try {
    assert.equal(resolveGenerationProvider(LLMProvider.GEMINI), LLMProvider.DIGITALOCEAN);
    assert.equal(PROVIDER_TASK_PRESETS[LLMProvider.DIGITALOCEAN][LLMTask.STRUCTURAL_JSON].model,
      process.env.DO_LLM_FAST_MODEL?.trim() || "glm-5.3-flash");
    assert.equal(PROVIDER_TASK_PRESETS[LLMProvider.DIGITALOCEAN][LLMTask.VERIFY_COMPLIANCE].model,
      process.env.DO_LLM_REASONING_MODEL?.trim() || "glm-5.3");
  } finally {
    if (prior === undefined) delete process.env.LLM_GENERATION_PROVIDER;
    else process.env.LLM_GENERATION_PROVIDER = prior;
  }
});
