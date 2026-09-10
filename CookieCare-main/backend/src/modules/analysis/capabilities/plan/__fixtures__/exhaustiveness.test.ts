import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseExhaustiveness } from "../classify-intent.js";

describe("explicit result caps", () => {
  it("parses common top/first/most cardinality language", () => {
    for (const [instruction, limit] of [
      ["What are the top 3 risks?", 3],
      ["Give me the first 2 issues.", 2],
      ["Show only 5 biggest concerns.", 5],
      ["List 4 most important differences.", 4],
    ] as const) {
      assert.deepEqual(parseExhaustiveness(instruction), {
        mode: "user_capped",
        limit,
      });
    }
  });

  it("does not turn general depth language into a result cap", () => {
    assert.equal(parseExhaustiveness("Analyze this contract thoroughly."), undefined);
    assert.equal(parseExhaustiveness("What are the risks?"), undefined);
  });

  it("rejects unsafe or nonsensical caps", () => {
    assert.equal(parseExhaustiveness("Show only 0 issues."), undefined);
    assert.equal(parseExhaustiveness("Show the top 999 risks."), undefined);
  });
});
