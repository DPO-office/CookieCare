/**
 * Graded DSR schemas: one supported mandatory limb + one missing limb → Partial.
 *
 * Run:
 *   node --import ./node_modules/tsx/dist/loader.mjs --test \
 *     src/modules/analysis/capabilities/act/__fixtures__/dsr-graded-partial.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { elementSchemaFor } from "../element-schemas.js";
import { assessRequirement } from "../phase5-assess.js";
import type { ElementVerdict, RequirementMatrix } from "../phase4-verify.js";

function verdict(
  elementId: string,
  state: ElementVerdict["state"],
  establishedFact = "",
  gapDescription = ""
): ElementVerdict {
  return {
    elementId,
    state,
    evidenceSpanIds: state === "supported" ? ["span-1"] : [],
    quotes: [],
    scope: {},
    establishedFact,
    gapDescription,
    contribution: "individual",
  };
}

function matrixFor(
  requirementId: string,
  schemaVersion: string,
  reviewStatus: RequirementMatrix["reviewStatus"],
  elements: ElementVerdict[]
): RequirementMatrix {
  const ids = elements.map((e) => e.elementId);
  return {
    requirementId,
    bundleId: `B-${requirementId}`,
    schemaVersion,
    reviewStatus,
    elements,
    expectedElementIds: ids,
    returnedElementIds: ids,
    missingElementIds: [],
    estimatedTokens: 100,
  };
}

describe("DSR graded schemas → Partial on one-limb hit", () => {
  it("resolves art21_objection to a multi-element authored schema", () => {
    const schema = elementSchemaFor("art21_objection");
    assert.ok(schema);
    assert.equal(schema!.reviewStatus, "authored");
    assert.equal(schema!.elements.length, 2);
    assert.equal(schema!.elements[0]!.elementId, "O1");
    assert.equal(schema!.elements[1]!.elementId, "O2");
  });

  it("marks Art 21 Partial when only the LI objection limb is supported", () => {
    const schema = elementSchemaFor("art21_objection")!;
    const result = assessRequirement({
      requirementId: "art21_objection",
      schema,
      investigationComplete: true,
      unresolvedDependencyCount: 0,
      matrix: matrixFor("art21_objection", schema.version, schema.reviewStatus, [
        verdict("O1", "supported", "LI objection present"),
        verdict("O2", "not_located", "", "No unconditional marketing objection"),
      ]),
    });
    assert.equal(result.status, "partial");
  });

  it("marks Art 17 Partial when mid-term erasure is present but Art 17(2) notice is missing when applicable", () => {
    const schema = elementSchemaFor("art17_erasure")!;
    const result = assessRequirement({
      requirementId: "art17_erasure",
      schema,
      investigationComplete: true,
      unresolvedDependencyCount: 0,
      matrix: matrixFor("art17_erasure", schema.version, schema.reviewStatus, [
        verdict("E1", "supported", "Mid-term erasure on request"),
        verdict(
          "E2",
          "not_located",
          "",
          "Publication contemplated; no other-controller notice"
        ),
      ]),
    });
    assert.equal(result.status, "partial");
  });

  it("marks Art 22 not_applicable when both ADM limbs are not_applicable", () => {
    const schema = elementSchemaFor("art22_automated_decisions")!;
    const result = assessRequirement({
      requirementId: "art22_automated_decisions",
      schema,
      investigationComplete: true,
      unresolvedDependencyCount: 0,
      matrix: matrixFor(
        "art22_automated_decisions",
        schema.version,
        schema.reviewStatus,
        [
          verdict("AD1", "not_applicable", "", "No ADM described"),
          verdict("AD2", "not_applicable", "", "No ADM described"),
        ]
      ),
    });
    assert.equal(result.status, "not_applicable");
  });
});
