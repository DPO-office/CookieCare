import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalRequirementId,
  collapseToCanonicalRequirementIds,
  filterAssessmentsByRequirementIds,
  findingSupportsRequirement,
  getUmbrellaMembers,
  isWholeArticleRequirement,
  requirementIdsEquivalent,
} from "../requirement-identity.js";

describe("requirement-identity", () => {
  it("maps package-native Art 28 ids to PLAN-shaped canonical ids", () => {
    assert.equal(canonicalRequirementId("duration"), "gdpr.article28.duration");
    assert.equal(
      canonicalRequirementId("nature_purpose"),
      "gdpr.article28.nature_and_purpose"
    );
    assert.equal(
      canonicalRequirementId("controller_obligations_rights"),
      "gdpr.article28.controller_obligations_and_rights"
    );
    assert.equal(
      canonicalRequirementId("gdpr.article28.controller_obligations_rights"),
      "gdpr.article28.controller_obligations_and_rights"
    );
    assert.ok(requirementIdsEquivalent("gdpr.article28.duration", "duration"));
    assert.ok(findingSupportsRequirement("duration", "gdpr.article28.duration"));
  });

  it("aliases live PLAN spellings that omit of_/and_ and use article28_3", () => {
    assert.equal(
      canonicalRequirementId("gdpr.article28.categories_data_and_subjects"),
      "gdpr.article28.categories_of_data_and_subjects"
    );
    assert.equal(
      canonicalRequirementId("gdpr.article28.controller_obligations_rights"),
      "gdpr.article28.controller_obligations_and_rights"
    );
    assert.equal(
      canonicalRequirementId("gdpr.article28_3.mandatory_clauses_adequacy"),
      "gdpr.article28_3.mandatory_clauses_adequacy"
    );
    assert.ok(
      findingSupportsRequirement(
        "data_categories",
        "gdpr.article28.categories_data_and_subjects"
      )
    );
    assert.ok(
      findingSupportsRequirement(
        "art28_3_b_confidentiality",
        "gdpr.article28_3.mandatory_clauses_adequacy"
      )
    );
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

  it("keeps PLAN umbrella as one locked row when expandUmbrellas is false", () => {
    const ids = collapseToCanonicalRequirementIds(
      ["gdpr.article28_3.mandatory_clauses_adequacy"],
      { expandUmbrellas: false }
    );
    assert.deepEqual(ids, ["gdpr.article28_3.mandatory_clauses_adequacy"]);
  });

  it("joins PLAN outline ids to PLAN assessments and native member tags", () => {
    const rows = [
      { requirementId: "gdpr.article28.duration" },
      { requirementId: "gdpr.article28_3.mandatory_clauses_adequacy" },
    ];
    const matched = filterAssessmentsByRequirementIds(rows, [
      "duration",
      "art28_3_h_audit",
      "gdpr.article28.mandatory_clauses_completeness",
    ]);
    assert.deepEqual(
      matched.map((r) => r.requirementId),
      ["gdpr.article28.duration", "gdpr.article28_3.mandatory_clauses_adequacy"]
    );
  });

  it("dynamically resolves umbrella members for categories and mandatory clauses", () => {
    assert.deepEqual(
      getUmbrellaMembers("article28.categories_of_data_and_data_subjects"),
      ["data_categories", "data_subject_categories"]
    );
    assert.ok(
      getUmbrellaMembers("mandatory_art28_clauses")?.includes("art28_3_b_confidentiality")
    );
  });
});
