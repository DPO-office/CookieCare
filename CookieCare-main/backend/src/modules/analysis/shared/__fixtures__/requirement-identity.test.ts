import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalRequirementId,
  collapseToCanonicalRequirementIds,
  filterAssessmentsByRequirementIds,
  findingSupportsRequirement,
  isWholeArticleRequirement,
  requirementIdsEquivalent,
} from "../requirement-identity.js";

describe("requirement-identity", () => {
  it("maps PLAN Art 28 particulars to package-native canonical ids", () => {
    assert.equal(canonicalRequirementId("gdpr.article28.duration"), "duration");
    assert.equal(
      canonicalRequirementId("gdpr.article28.nature_and_purpose"),
      "nature_purpose"
    );
    assert.equal(
      canonicalRequirementId("gdpr.article28.controller_obligations_and_rights"),
      "controller_obligations_rights"
    );
    assert.ok(requirementIdsEquivalent("gdpr.article28.duration", "duration"));
    assert.ok(findingSupportsRequirement("duration", "gdpr.article28.duration"));
  });

  it("treats only whole-article ids as article-fallback eligible", () => {
    assert.equal(isWholeArticleRequirement("gdpr.article17.compliance"), true);
    assert.equal(isWholeArticleRequirement("gdpr.article28.duration"), false);
    assert.equal(isWholeArticleRequirement("duration"), false);
    assert.equal(isWholeArticleRequirement("art28_3_b_confidentiality"), false);
  });

  it("expands mandatory coverage umbrella to lettered natives when findings exist", () => {
    const ids = collapseToCanonicalRequirementIds(
      ["gdpr.article28.mandatory_clauses_completeness"],
      {
        expandUmbrellas: true,
        availableFindingRequirementIds: ["art28_3_b_confidentiality"],
      }
    );
    assert.deepEqual(ids, ["art28_3_b_confidentiality"]);
  });

  it("joins PLAN outline ids to native assessments", () => {
    const rows = [
      { requirementId: "duration" },
      { requirementId: "art28_3_h_audit" },
    ];
    const matched = filterAssessmentsByRequirementIds(rows, [
      "gdpr.article28.duration",
      "gdpr.article28.mandatory_clauses_completeness",
    ]);
    assert.deepEqual(
      matched.map((r) => r.requirementId),
      ["duration", "art28_3_h_audit"]
    );
  });
});
