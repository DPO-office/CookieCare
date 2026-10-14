process.env.GOOGLE_CLOUD_PROJECT ??= "refine-outline-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IntentClassification, ReportOutlineItem } from "../../../models/intent.js";
import { deriveReportOutline } from "../derive-report-outline.js";

const { refineReportOutlineViaLLM } = await import(
  "../refine-report-outline.js"
);

function intentWithRequirements(ids: string[]): IntentClassification {
  return {
    scope: "whole_document",
    operation: "compliance_check",
    standard: "none",
    standardConcept: "GDPR",
    outputForm: "memo",
    compound: false,
    subIntents: [],
    requirements: ids.map((id) => ({
      id,
      description: id,
      type: "verification",
      priority: "required",
    })),
    confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
  } as unknown as IntentClassification;
}

describe("refineReportOutlineViaLLM", () => {
  it("accepts a valid refined merge of analysis items", async () => {
    const intent = intentWithRequirements([
      "subject_matter",
      "duration",
      "mandatory_article_28_3_clauses",
      "clause_adequacy",
    ]);

    const seedOutline = deriveReportOutline(
      intent,
      "regime_compliance_memo",
      "deep"
    );

    const seedAnalysis = seedOutline.filter(
      (i) =>
        i.role === "analysis" ||
        i.role === "chapeau_particulars" ||
        i.role === "key_findings" ||
        i.role === "requirements_matrix"
    );
    assert.ok(seedAnalysis.length >= 2);

    const mergedReqIds = seedAnalysis.flatMap((i) => i.requirementIds);
    const mergedUnique = [...new Set(mergedReqIds)];

    const refined = await refineReportOutlineViaLLM({
      instruction: "Perform a rigorous GDPR Article 28(3) review.",
      intent,
      reportType: "regime_compliance_memo",
      depth: "deep",
      seedOutline,
      executeJsonCompletionFn: async () => ({
        analysisItems: [
          {
            id: "analysis.merged",
            role: "analysis",
            heading: "Merged analysis heading",
            requirementIds: mergedUnique,
            source: "catalog_llm",
          },
        ],
      } as never),
    });

    const refinedAnalysis = refined.filter(
      (i) =>
        i.role === "analysis" ||
        i.role === "chapeau_particulars" ||
        i.role === "key_findings" ||
        i.role === "requirements_matrix"
    );
    assert.equal(refinedAnalysis.length, 1);
    assert.equal(refinedAnalysis[0]?.heading, "Merged analysis heading");
    assert.deepEqual(
      new Set(refinedAnalysis[0]?.requirementIds ?? []),
      new Set(mergedUnique)
    );
  });

  it("rejects invalid refined output with duplicate requirementIds and falls back to seed", async () => {
    const intent = intentWithRequirements([
      "subject_matter",
      "mandatory_article_28_3_clauses",
    ]);

    const seedOutline = deriveReportOutline(intent, "regime_compliance_memo", "deep");

    const refined = await refineReportOutlineViaLLM({
      instruction: "Perform a rigorous GDPR Article 28 review.",
      intent,
      reportType: "regime_compliance_memo",
      depth: "deep",
      seedOutline,
      executeJsonCompletionFn: async () => ({
        analysisItems: [
          {
            id: "a1",
            role: "analysis",
            heading: "A1",
            requirementIds: ["subject_matter", "mandatory_article_28_3_clauses"],
            source: "catalog_llm",
          },
          {
            id: "a2",
            role: "analysis",
            heading: "A2",
            // Duplicate requirementIds on purpose.
            requirementIds: ["subject_matter"],
            source: "catalog_llm",
          },
        ],
      } as never),
    });

    // Should be exactly the seed outline (fallback).
    assert.deepEqual(refined, seedOutline);
  });
});

