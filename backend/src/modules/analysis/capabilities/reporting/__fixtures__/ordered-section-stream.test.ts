process.env.GOOGLE_CLOUD_PROJECT ??= "ordered-section-stream-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createOrderedSectionStream } from "../../../utils/ordered-section-stream.js";
import {
  beginRenderStreaming,
  emitAnalysisToken,
  shouldHoldUserFacingOutput,
} from "../../../utils/pac-log.js";
import { initAgentRunState } from "../../../pac/types.js";
import type { AnalysisState } from "../../../models/analysis-state.js";

describe("ordered section stream", () => {
  it("holds later sections until earlier ones close, then dumps in outline order", () => {
    const out: string[] = [];
    const live = createOrderedSectionStream(3, (delta) => out.push(delta));

    live.push(2, "C");
    live.push(1, "B");
    live.close(2);
    live.close(1);
    assert.deepEqual(out, []);

    live.push(0, "A1");
    assert.deepEqual(out, ["A1"]);
    live.push(0, "A2");
    live.close(0);
    assert.deepEqual(out, ["A1", "A2", "\n\n", "B", "\n\n", "C"]);
  });

  it("streams the head section live and flushes a finished successor", () => {
    const out: string[] = [];
    const live = createOrderedSectionStream(2, (delta) => out.push(delta));
    live.push(0, "Hello");
    live.push(1, "World");
    assert.deepEqual(out, ["Hello"]);
    live.close(0);
    assert.deepEqual(out, ["Hello", "\n\n", "World"]);
    live.close(1);
    assert.deepEqual(out, ["Hello", "\n\n", "World"]);
  });
});

describe("render-output live stream gate", () => {
  it("drops ACT tokens until beginRenderStreaming", () => {
    const chunks: string[] = [];
    const state = {
      agent: initAgentRunState("CREATE"),
      onToken: (delta: string) => chunks.push(delta),
    } as unknown as AnalysisState;
    state.agent!.phase = "ACT";
    emitAnalysisToken(state, "finding");
    assert.deepEqual(chunks, []);
    beginRenderStreaming(state);
    assert.equal(shouldHoldUserFacingOutput(state), false);
    emitAnalysisToken(state, "memo");
    assert.deepEqual(chunks, ["memo"]);
    assert.equal(state.userFacingCharsEmitted, 4);
  });
});
