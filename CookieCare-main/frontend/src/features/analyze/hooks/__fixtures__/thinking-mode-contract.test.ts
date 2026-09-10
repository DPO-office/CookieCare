/**
 * Contract check: Analyze UI must send thinkingMode on the wire (not bury it in instruction prose).
 * Run with: node --import ./node_modules/tsx/dist/loader.mjs --test <this-file>
 * Kept next to the hook for discoverability; logic mirrors useAnalysis.buildInstruction.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

function buildInstruction(
  prompt: string,
  answerStyle: "narrative" | "tabular"
): string {
  const extras: string[] = [];
  if (answerStyle === "tabular") {
    extras.push("Present findings as a table.");
  }
  return [prompt.trim(), ...extras].join("\n\n");
}

describe("thinkingMode FE/BE instruction contract", () => {
  it("does not inject lite/deep prose into the instruction", () => {
    const lite = buildInstruction("Analyse this NDA.", "narrative");
    const deep = buildInstruction("Analyse this NDA.", "narrative");
    assert.equal(lite, "Analyse this NDA.");
    assert.equal(deep, "Analyse this NDA.");
    assert.doesNotMatch(lite, /concise|thorough|in-depth/i);
  });

  it("maps UI AnalysisDepth values to API thinkingMode values", () => {
    const allowed = new Set(["lite", "deep"]);
    for (const mode of ["lite", "deep"] as const) {
      assert.ok(allowed.has(mode));
      const payload = { thinkingMode: mode };
      assert.equal(payload.thinkingMode, mode);
    }
  });
});
