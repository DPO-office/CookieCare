process.env.GOOGLE_CLOUD_PROJECT ??= "evaluate-package-id-remap-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAllowedRequirementId } from "../evaluate-package.js";

describe("resolveAllowedRequirementId", () => {
  const allowed = [
    "subject_matter",
    "duration",
    "nature_purpose",
    "data_categories",
    "controller_obligations_rights",
    "art28_3_b_confidentiality",
  ];

  it("maps PLAN Art 28 aliases onto PLAN-shaped canonical ids", () => {
    assert.equal(
      resolveAllowedRequirementId("gdpr.article28.duration", allowed),
      "gdpr.article28.duration"
    );
    assert.equal(
      resolveAllowedRequirementId("gdpr.article28.nature_and_purpose", allowed),
      "gdpr.article28.nature_and_purpose"
    );
    assert.equal(
      resolveAllowedRequirementId("gdpr.article28.subject_matter", allowed),
      "gdpr.article28.subject_matter"
    );
  });

  it("maps package-native ids to PLAN-shaped canonicals", () => {
    assert.equal(
      resolveAllowedRequirementId("duration", allowed),
      "gdpr.article28.duration"
    );
    assert.equal(
      resolveAllowedRequirementId("art28_3_b_confidentiality", allowed),
      "art28_3_b_confidentiality"
    );
  });

  it("rejects unrelated ids so they become missing-results instead of silent drops", () => {
    assert.equal(resolveAllowedRequirementId("gdpr.article17.compliance", allowed), undefined);
    assert.equal(resolveAllowedRequirementId("totally_unrelated", allowed), undefined);
  });
});
