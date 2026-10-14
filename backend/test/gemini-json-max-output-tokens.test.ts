process.env.GOOGLE_CLOUD_PROJECT ??= "gemini-json-cap-test";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const SRC = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/llm/provider/gemini-provider.ts"
);

describe("Gemini JSON maxOutputTokens", () => {
  it("sends maxOutputTokens on JSON generateContent calls", () => {
    const src = readFileSync(SRC, "utf8");
    const jsonBlocks = src.split("async getJsonCompletion");
    assert.ok(jsonBlocks.length >= 3, "expected getJsonCompletion and getJsonCompletionWithMeta");
    for (const block of jsonBlocks.slice(1)) {
      const config = block.slice(0, block.indexOf("const rawText"));
      assert.match(
        config,
        /maxOutputTokens:\s*runtimeConfig\.maxOutputTokens/,
        "JSON path must pass maxOutputTokens to Gemini"
      );
    }
  });
});
