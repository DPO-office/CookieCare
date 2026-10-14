/**
 * Shadow isolation + V1-regression tests (no live DB/LLM — deps are injected).
 *   node --import tsx --test backend/src/modules/negotiate/v2/shadow.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runShadowEvaluation, ShadowDeps } from "./shadow.js";
import { config } from "../../../config/index.js";
import type { V2Result } from "./types.js";

const okResult: V2Result = {
  pipelineVersion: "v2-shadow-0.1.0", segmenterVersion: "seg-1.0.0", contentHash: "h",
  docType: "dpa", docTypeConfident: true, evaluationMode: "full", warnings: [],
  findings: [], stageTimingsMs: {}, llmCalls: 3, embedCalls: 1,
};

test("KILL-SWITCH: shadow flag defaults OFF (env unset)", () => {
  // In the test env NEGOTIATE_V2_SHADOW is unset → V2 shadow must be disabled,
  // so the route never invokes it and V1 is byte-for-byte unchanged.
  assert.equal(config.negotiateV2Shadow, false);
});

test("ISOLATION: a throwing V2 pipeline never throws out of the shadow runner", async () => {
  const deps: ShadowDeps = {
    runPipeline: async () => { throw new Error("v2 boom"); },
    store: async () => {},
  };
  const id = await runShadowEvaluation({ documentId: "d1", documentText: "x", v1Markups: [] }, deps);
  assert.equal(id, null, "pipeline failure → null, no throw (V1 unaffected)");
});

test("ISOLATION: a throwing storage layer never throws; run still returns an id", async () => {
  const deps: ShadowDeps = {
    runPipeline: async () => okResult,
    store: async () => { throw new Error("db down"); },
  };
  const id = await runShadowEvaluation({ documentId: "d1", documentText: "x", v1Markups: [] }, deps);
  assert.ok(id && id.startsWith("shadow_"), "storage failure is swallowed; shadow id still produced");
});

test("stores a comparison row when everything succeeds", async () => {
  let stored: any = null;
  const deps: ShadowDeps = {
    runPipeline: async () => okResult,
    store: async (row) => { stored = row; },
  };
  const v1Markups = [{ original: "clause A", riskLevel: "RED" }, { original: "clause B", riskLevel: "YELLOW" }];
  const id = await runShadowEvaluation({ documentId: "d9", documentText: "x", v1Markups }, deps);
  assert.ok(id);
  assert.equal(stored.documentId, "d9");
  assert.equal(stored.comparison.v1Count, 2);
  assert.equal(stored.comparison.v2Count, 0);
  assert.equal(stored.evaluationMode, "full");
});
