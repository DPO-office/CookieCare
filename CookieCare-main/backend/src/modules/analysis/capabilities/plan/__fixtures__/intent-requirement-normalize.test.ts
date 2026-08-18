/**
 * Unit tests for semantic intent requirement normalization and coverage guard.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countRequirementsByPriority,
  normalizeRequirements,
  normalizeUnresolvedNeeds,
  warnRequirementCoverageGuard,
} from "../intent-requirement-normalize.js";

describe("intent requirement normalization", () => {
  it("dedupes by semantic id and preserves first-seen order", () => {
    const result = normalizeRequirements([
      {
        id: "article28.duration",
        description: "Verify duration of processing.",
        type: "verification",
        priority: "required",
      },
      {
        id: "article28.duration",
        description: "Duplicate should be dropped.",
        type: "verification",
        priority: "supporting",
      },
      {
        id: "article28.subject_matter",
        description: "Verify subject matter.",
        type: "verification",
        priority: "required",
      },
    ]);
    assert.equal(result.length, 2);
    assert.equal(result[0].id, "article28.duration");
    assert.equal(result[0].priority, "required");
    assert.equal(result[1].id, "article28.subject_matter");
  });

  it("trims and drops malformed entries", () => {
    const result = normalizeRequirements([
      {
        id: "  article28.clause_adequacy ",
        description: " Assess adequacy. ",
        type: "adequacy",
        priority: "required",
      },
      {
        id: "",
        description: "Missing id",
        type: "verification",
        priority: "required",
      },
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "article28.clause_adequacy");
    assert.equal(result[0].description, "Assess adequacy.");
  });

  it("normalizes unresolved needs with default reason", () => {
    const result = normalizeUnresolvedNeeds([
      { description: "International transfer compliance", reason: "" },
    ]);
    assert.equal(result.length, 1);
    assert.match(result[0].reason, /structured requirement/i);
  });

  it("counts required vs supporting priorities", () => {
    const counts = countRequirementsByPriority([
      {
        id: "a",
        description: "A",
        type: "verification",
        priority: "required",
      },
      {
        id: "b",
        description: "B",
        type: "coverage",
        priority: "supporting",
      },
    ]);
    assert.equal(counts.required, 1);
    assert.equal(counts.supporting, 1);
  });

  it("coverage guard accepts well-formed requirement lists without throwing", () => {
    assert.doesNotThrow(() =>
      warnRequirementCoverageGuard(
        "Verify subject matter, duration, and adequacy of Article 28(3) clauses.",
        "compliance_check",
        [
          {
            id: "article28.subject_matter",
            description: "Verify subject matter.",
            type: "verification",
            priority: "required",
          },
          {
            id: "article28.duration",
            description: "Verify duration.",
            type: "verification",
            priority: "required",
          },
        ]
      )
    );
  });
});
