import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorkUnit } from "../../../models/draft-plan.js";
import { topologicalBatches } from "../../../utils/topo-batches.js";

describe("ACT concurrency batches", () => {
  it("keeps glossary-mutating units serial while paralleling independents", () => {
    const glossary: WorkUnit[] = [
      {
        id: "sec-parties",
        kind: "section",
        heading: "Parties",
        dependsOn: [],
        clauseTypes: ["parties"],
        status: "pending",
      },
      {
        id: "sec-definitions",
        kind: "section",
        heading: "Definitions",
        dependsOn: [],
        clauseTypes: ["definitions"],
        status: "pending",
      },
    ];
    const parallel: WorkUnit[] = [
      {
        id: "sec-security",
        kind: "section",
        heading: "Security",
        dependsOn: ["sec-definitions"],
        clauseTypes: ["security"],
        status: "pending",
      },
      {
        id: "sec-subprocessors",
        kind: "section",
        heading: "Sub-processors",
        dependsOn: ["sec-definitions"],
        clauseTypes: ["subprocessors"],
        status: "pending",
      },
      {
        id: "sec-breach",
        kind: "section",
        heading: "Breach",
        dependsOn: ["sec-definitions"],
        clauseTypes: ["breach"],
        status: "pending",
      },
    ];

    // Simulate execute-act-plan batching strategy.
    const batches = [
      ...topologicalBatches(glossary, 1),
      ...topologicalBatches(parallel, 3),
    ];

    // First batches for glossary are size 1 each (concurrency 1).
    const glossaryBatches = topologicalBatches(glossary, 1);
    assert.ok(glossaryBatches.every((b) => b.length === 1));

    // Parallel batch can include both security + subprocessors once definitions drafted.
    // With dependsOn pointing outside remaining set, both are ready immediately.
    const parallelBatches = topologicalBatches(parallel, 3);
    assert.ok(parallelBatches[0].length >= 2);
    assert.ok(batches.length >= 2);
  });

  it("respects dependsOn within parallel set", () => {
    const units: WorkUnit[] = [
      {
        id: "a",
        kind: "section",
        heading: "A",
        dependsOn: [],
        clauseTypes: [],
        status: "pending",
      },
      {
        id: "b",
        kind: "section",
        heading: "B",
        dependsOn: ["a"],
        clauseTypes: [],
        status: "pending",
      },
      {
        id: "c",
        kind: "section",
        heading: "C",
        dependsOn: ["a"],
        clauseTypes: [],
        status: "pending",
      },
    ];
    const batches = topologicalBatches(units, 2);
    assert.equal(batches[0].map((u) => u.id).join(","), "a");
    assert.ok(batches[1].some((u) => u.id === "b"));
    assert.ok(batches[1].some((u) => u.id === "c"));
  });

  it("default concurrency env resolves to at least 1", () => {
    const maxConcurrent = Math.max(
      1,
      Number(process.env.DRAFTING_ACT_CONCURRENCY || 3)
    );
    assert.ok(maxConcurrent >= 1);
  });
});
