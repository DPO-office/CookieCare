import assert from "node:assert/strict";
import { test } from "node:test";
import { FocusedGraphJudge, focusGraphJudgeInput } from "../evaluation/focused-graph-judge.js";
import type { EvaluationJudge, JudgeInput } from "../evaluation/review-dataset.js";

const input: JudgeInput = {
  caseId: "S3-case", method: "source_backed_comparison", grading: {}, evaluationScope: null,
  expected: {
    "node:Section 8(1)": { id: "Section 8(1)", exact_source_text: "8. (1) A Data Fiduciary shall comply." },
    "edge:Section 8(1) -> Section 9": { from: "Section 8(1)", to: "Section 9" },
  }, forbidden: ["Invented Section 8 exception"],
  source: [{ ref: "section:8", text: "8. (1) A Data Fiduciary shall comply." }],
  evidence: [{ ref: "S3-case#", value: {
    selection: { physicalPages: [7] },
    provisions: [
      { id: "p8", kind: "subsection", label: "8. (1) A Data Fiduciary", text: "8. (1) A Data Fiduciary shall comply.",
        parentId: "section8", parentLabel: "Section 8", sourceRanges: [], status: "candidate" },
      { id: "p9", kind: "section", label: "9. Other duty", text: "9. Other duty", parentId: null,
        sourceRanges: [], status: "candidate" },
    ],
    relationships: [{ sourceId: "p8", sourceLabel: "8. (1)", targetIds: ["p9"],
      targetLabels: ["9. Other duty"], exactMention: "section 9", status: "resolved" }],
    contextPaths: [{ targetId: "p8", paths: Array.from({ length: 100 }, () => ["p8", "p9"]) }],
    tables: [],
  } }],
};

test("focused graph input keeps the full inventory and relevant text without bulky unrelated paths", () => {
  const focused = focusGraphJudgeInput(input, "node:Section 8(1)", input.expected["node:Section 8(1)"]);
  const observed = focused.evidence[0]!.value as any;
  assert.equal(observed.inventory.length, 2);
  assert.equal(observed.detailedProvisions[0].id, "p8");
  assert.equal(observed.detailedProvisions[0].text, "8. (1) A Data Fiduciary shall comply.");
  assert.deepEqual(observed.contextPaths, []);
  assert.ok(JSON.stringify(focused).length < 10_000);
});

test("focused judge scores facts independently and preserves a failed judge call as needs_review", async () => {
  const calls: JudgeInput[] = [];
  const delegate: EvaluationJudge = { model: "mock-flash", async judge(request) {
    calls.push(request);
    const field = Object.keys(request.expected)[0];
    if (field?.startsWith("edge:")) throw new Error("incomplete JSON");
    if (field) return { fields: [{ field, verdict: "pass", reason: "Observed text and parent match" }], forbidden: [] };
    return { fields: [], forbidden: [{ claim: request.forbidden[0]!, found: false, reason: "Absent" }] };
  } };
  const judge = new FocusedGraphJudge(delegate);
  const result = await judge.judge(input);
  assert.deepEqual(result.fields.map(field => field.verdict), ["pass", "needs_review"]);
  assert.match(result.fields[1]!.reason, /incomplete JSON/);
  assert.deepEqual(result.forbidden.map(item => item.found), [false]);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(call => Object.keys(call.expected).length), [1, 1, 0]);
});
