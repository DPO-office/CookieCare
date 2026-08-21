process.env.GOOGLE_CLOUD_PROJECT ??= "render-output-nda-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("render output NDA safety", () => {
  it("selectRenderer chooses memo for NDA structural review not brief_summary GDPR path", async () => {
    const { selectRenderer } = await import("../../../skills/runtime/graph/build-act-graph.js");
    const schema = selectRenderer({
      docType: "nda",
      reportSpec: {
        reportType: "regime_compliance_memo",
        depth: "standard",
        sections: ["scope", "requirements_detail", "conclusion"],
      },
      hasReference: false,
      hasMatrixFocus: false,
      requirementCount: 6,
    });
    assert.equal(schema, "memo");
  });

  it("sanitizeRenderedOutput strips internal routing diagnostics", async () => {
    const { sanitizeRenderedOutput } = await import("../render-output.js");
    const cleaned = sanitizeRenderedOutput(
      "Analysis failed: packageId=nda.structural_review workUnitId=wu-pkg-eval not_supported"
    );
    assert.doesNotMatch(cleaned, /packageId=/);
    assert.doesNotMatch(cleaned, /workUnitId=/);
    assert.doesNotMatch(cleaned, /not_supported/);
  });
});
