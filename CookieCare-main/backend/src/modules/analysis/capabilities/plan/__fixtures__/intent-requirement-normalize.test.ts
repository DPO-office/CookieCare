/**
 * Unit tests for semantic intent requirement normalization and coverage guard.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countRequirementsByPriority,
  expandArticleRangeRequirements,
  isUmbrellaRangeRequirement,
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

    it("expands Articles 15-22 into one requirement per article and drops umbrellas", () => {
      const expanded = expandArticleRangeRequirements(
        "check 15 16 17 18 19 20 21 22 article of gdpr and provide a brief overview",
        [
          {
            id: "gdpr.article15.compliance",
            description: "Verify Article 15.",
            type: "verification",
            priority: "required",
          },
          {
            id: "gdpr_articles_15_22_overview",
            description: "Provide an overview of GDPR Articles 15-22.",
            type: "verification",
            priority: "required",
          },
          {
            id: "gdpr_articles_15_22_analysis",
            description: "In-depth analysis of Articles 15-22.",
            type: "verification",
            priority: "required",
          },
        ]
      );
      assert.equal(expanded.some((r) => r.id === "gdpr_articles_15_22_overview"), false);
      assert.equal(expanded.some((r) => r.id === "gdpr_articles_15_22_analysis"), false);
      for (const article of [15, 16, 17, 18, 19, 20, 21, 22]) {
        assert.ok(
          expanded.some((r) => r.id === `gdpr.article${article}.compliance`),
          `missing article ${article}`
        );
      }
      assert.equal(expanded.length, 8);
    });

    it("detects umbrella range requirements", () => {
      assert.equal(
        isUmbrellaRangeRequirement({
          id: "gdpr_articles_15_22_overview",
          description: "Overview of Articles 15-22",
          type: "verification",
          priority: "required",
        }),
        true
      );
      assert.equal(
        isUmbrellaRangeRequirement({
          id: "gdpr.article17.compliance",
          description: "Verify GDPR Article 17.",
          type: "verification",
          priority: "required",
        }),
        false
      );
    });
  });
