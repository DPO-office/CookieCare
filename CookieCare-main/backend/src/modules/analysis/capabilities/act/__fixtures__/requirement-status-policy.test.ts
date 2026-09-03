/**
 * Unit tests for deterministic requirement-status aggregation (ACT refactor doc §9).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveRequirementStatus } from "../requirement-status-policy.js";
import { displayRequirementStatus } from "../../../models/requirement-assessment.js";
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

  it("returns adequate when every element is present without a substantial quote", () => {
    assert.equal(
      deriveRequirementStatus([finding("present"), finding("present")]),
      "adequate"
    );
  });

  it("returns gap when there is a gap and nothing supporting", () => {
    assert.equal(
      deriveRequirementStatus([finding("absent_expected")]),
      "gap"
    );
  });

  it("returns conditional when some elements are present and others absent", () => {
    assert.equal(
      deriveRequirementStatus([finding("present"), finding("absent_expected")]),
      "conditional"
    );
  });

  it("returns conditional when supported but weakened by insufficient evidence", () => {
    assert.equal(
      deriveRequirementStatus([
        finding("present"),
        finding("insufficient_evidence"),
      ]),
      "conditional"
    );
  });

  it("returns cannot_determine when evidence is only insufficient", () => {
    assert.equal(
      deriveRequirementStatus([finding("insufficient_evidence")]),
      "cannot_determine"
    );
  });

  it("returns cannot_determine when the claim only points at an annex or SOW without binding coverage", () => {
    assert.equal(
      deriveRequirementStatus([
        {
          ...finding("insufficient_evidence"),
          claim: "Subject matter is incorporated by reference to Annex 2 of Addendum A1.",
        },
      ]),
      "cannot_determine"
    );
  });

  it("returns conditional when a Named matrix row still carries an implementation gap", () => {
    assert.equal(
      deriveRequirementStatus([
        {
          ...finding("present"),
          matrixAddressing: "named",
          gap: "Erasure limited to contract termination.",
        },
      ]),
      "conditional"
    );
  });

  it("never promotes generic matrix coverage to Strong", () => {
    assert.equal(
      deriveRequirementStatus([
        {
          ...finding("present"),
          matrixAddressing: "generic",
        },
      ]),
      "conditional"
    );
  });

  it("keeps Present compliance when a medium risk annotation is also linked", () => {
    assert.equal(
      deriveRequirementStatus([
        finding("present"),
        {
          ...finding("present"),
          kind: "risk",
          category: "portability_format_unaddressed",
          severity: "medium",
          gap: "No machine-readable format commitment.",
        },
      ]),
      "adequate"
    );
  });
});

describe("displayRequirementStatus", () => {
  it("maps the 5-tier vocab to counsel-facing labels", () => {
    assert.equal(displayRequirementStatus("strong"), "Strong");
    assert.equal(displayRequirementStatus("adequate"), "Present & adequate");
    assert.equal(displayRequirementStatus("covered"), "Present & adequate");
    assert.equal(displayRequirementStatus("conditional"), "Minor drafting gap");
    assert.equal(displayRequirementStatus("partial"), "Minor drafting gap");
    assert.equal(displayRequirementStatus("gap"), "Gap");
    assert.equal(displayRequirementStatus("cannot_determine"), "Cannot determine");
    assert.equal(
      displayRequirementStatus({
        status: "cannot_determine",
        judgement: {
          compliance: "insufficient_evidence",
          evidenceState: "not_found",
          referenceBinding: "none",
          evidenceConfidence: "low",
          draftingQuality: "clean",
          materiality: "low",
          recommendationKind: "obtain",
        },
      }),
      "Insufficient data"
    );
    assert.equal(
      displayRequirementStatus({
        status: "conditional",
        judgement: {
          compliance: "partial",
          evidenceState: "direct",
          referenceBinding: "none",
          evidenceConfidence: "medium",
          draftingQuality: "could_be_clearer",
          materiality: "high",
          recommendationKind: "clarify",
        },
      }),
      "Minor drafting gap"
    );
  });
});
