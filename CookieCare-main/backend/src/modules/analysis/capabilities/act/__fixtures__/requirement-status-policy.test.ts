/**
 * Unit tests for deterministic requirement-status aggregation (ACT refactor doc §9).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveRequirementStatus } from "../requirement-status-policy.js";
import type { Finding, FindingStatus } from "../../../models/finding.js";

function finding(status: FindingStatus, requirementId = "req.a"): Finding {
  return {
    findingId: `f_${status}_${Math.random().toString(36).slice(2, 8)}`,
    kind: "compliance",
    category: "processor_terms",
    status,
    claim: `claim for ${status}`,
    evidence: [],
    taxonomyVersion: "test",
    requirementId,
  };
}

describe("deriveRequirementStatus", () => {
  it("returns cannot_determine when there are no findings", () => {
    assert.equal(deriveRequirementStatus([]), "cannot_determine");
  });

  it("returns covered when every element is present", () => {
    assert.equal(
      deriveRequirementStatus([finding("present"), finding("present")]),
      "covered"
    );
  });

  it("returns missing when there is a gap and nothing supporting", () => {
    assert.equal(
      deriveRequirementStatus([finding("absent_expected")]),
      "missing"
    );
  });

  it("returns partial when some elements are present and others absent", () => {
    assert.equal(
      deriveRequirementStatus([finding("present"), finding("absent_expected")]),
      "partial"
    );
  });

  it("returns partial when supported but weakened by insufficient evidence", () => {
    assert.equal(
      deriveRequirementStatus([
        finding("present"),
        finding("insufficient_evidence"),
      ]),
      "partial"
    );
  });

  it("returns cannot_determine when evidence is only insufficient", () => {
    assert.equal(
      deriveRequirementStatus([finding("insufficient_evidence")]),
      "cannot_determine"
    );
  });

  it("returns not_applicable when only not_covered signals remain", () => {
    assert.equal(
      deriveRequirementStatus([finding("not_covered")]),
      "not_applicable"
    );
  });
});
