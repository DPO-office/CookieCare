import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IntentClassification, ReportOutlineItem } from "../../../models/intent.js";
import { deriveReportOutline } from "../derive-report-outline.js";

function intentWithRequirements(ids: string[]): IntentClassification {
  return {
    scope: "whole_document",
    operation: "compliance_check",
    standard: "none",
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

function analysisItems(outline: ReportOutlineItem[]) {
  return outline.filter(
    (i) =>
      i.role === "analysis" ||
      i.role === "chapeau_particulars" ||
      i.role === "requirements_matrix" ||
      i.role === "key_findings"
  );
}

const ART28_SECTIONS = [
  "scope",
  "chapeau_particulars",
  "requirements_detail",
  "qualifications",
  "recommendations",
  "missing_materials",
  "conclusion",
] as const;

const ART28_OUTLINE_EXTRAS = [
  {
    heading: "Processing particulars (Art 28(3) chapeau)",
    requirementTags: [
      "subject_matter",
      "duration",
      "nature_and_purpose",
      "categories_of_data",
      "categories_of_data_subjects",
      "controller_obligations_rights",
    ],
  },
  {
    heading: "Mandatory Article 28(3) clauses",
    requirementTags: ["mandatory_article_28_3_clauses", "clause_adequacy"],
  },
];

describe("deriveReportOutline", () => {
  it("splits Art 28 particulars and mandatory clauses into separate analysis items", () => {
    const ids = [
      "subject_matter",
      "duration",
      "nature_and_purpose",
      "categories_of_data",
      "categories_of_data_subjects",
      "controller_obligations_rights",
      "mandatory_article_28_3_clauses",
      "clause_adequacy",
    ];
    const intent = intentWithRequirements(ids);

    const outline = deriveReportOutline(
      intent,
      "regime_compliance_memo",
      "deep",
      [...ART28_SECTIONS],
      ART28_OUTLINE_EXTRAS
    );
    assert.equal(outline[0]?.role, "scope");
    assert.equal(outline[outline.length - 1]?.role, "conclusion");

    const analysis = analysisItems(outline);
    assert.equal(analysis.length, 2);

    const chapeau = analysis.find((i) => i.role === "chapeau_particulars")!;
    assert.deepEqual(
      new Set(chapeau.requirementIds),
      new Set([
        "subject_matter",
        "duration",
        "nature_and_purpose",
        "categories_of_data",
        "categories_of_data_subjects",
        "controller_obligations_rights",
      ])
    );
    assert.match(chapeau.heading, /Processing particulars/i);

    const mandatory = analysis.find((i) => i.role === "analysis")!;
    assert.deepEqual(
      new Set(mandatory.requirementIds),
      new Set(["mandatory_article_28_3_clauses", "clause_adequacy"])
    );
    assert.match(mandatory.heading, /Mandatory Article 28/);

    assert.ok(outline.some((i) => i.role === "missing_materials"));
    assert.ok(outline.some((i) => i.role === "recommendations"));
  });

  it("does not inject recommendations or qualifications unless the spec lists them", () => {
    const intent = intentWithRequirements(["subject_matter"]);
    const outline = deriveReportOutline(
      intent,
      "regime_compliance_memo",
      "standard",
      ["scope", "requirements_detail", "conclusion"]
    );
    assert.ok(!outline.some((i) => i.role === "recommendations"));
    assert.ok(!outline.some((i) => i.role === "qualifications"));
    assert.ok(outline.some((i) => i.role === "conclusion"));
  });

  it("emits extras as top-level sections with authored sectionId", () => {
    const intent = intentWithRequirements(["nda.confidentiality_definition"]);
    const outline = deriveReportOutline(
      intent,
      "regime_compliance_memo",
      "standard",
      ["executive_summary", "key_findings", "conclusion"],
      [
        {
          heading: "Confidentiality",
          sectionId: "key_findings",
          requirementTags: ["nda.confidentiality_definition"],
        },
      ]
    );
    const extra = outline.find((i) => i.heading === "Confidentiality");
    assert.equal(extra?.sectionId, "key_findings");
    assert.equal(extra?.role, "key_findings");
    assert.ok(!outline.some((i) => i.heading === "Requirements detail"));
  });

  it("returns scope + conclusion only for narrow depth", () => {
    const intent = intentWithRequirements(["subject_matter"]);
    const outline = deriveReportOutline(intent, "regime_compliance_memo", "narrow");
    assert.deepEqual(outline.map((i) => i.role), ["scope", "conclusion"]);
  });

  it("creates additional analysis items for remaining requirements", () => {
    const intent = intentWithRequirements([
      "subject_matter",
      "mandatory_article_28_3_clauses",
      "some_other_requirement",
    ]);
    const outline = deriveReportOutline(
      intent,
      "regime_compliance_memo",
      "standard",
      ["scope", "requirements_detail", "qualifications", "recommendations", "conclusion"],
      [ART28_OUTLINE_EXTRAS[1]!]
    );
    const analysis = analysisItems(outline);

    assert.ok(analysis.some((i) => i.requirementIds.includes("some_other_requirement")));
  });

  it("does not explode leftover requirements into many theme sections when extras exist", () => {
    const intent = intentWithRequirements([
      "mandatory_article_28_3_clauses",
      "clause_adequacy",
      "theme_alpha",
      "theme_beta",
      "theme_gamma",
      "theme_delta",
      "theme_epsilon",
    ]);
    const outline = deriveReportOutline(
      intent,
      "regime_compliance_memo",
      "standard",
      ["scope", "requirements_detail", "conclusion"],
      [ART28_OUTLINE_EXTRAS[1]!]
    );
    const analysis = analysisItems(outline);
    // One authored extra + at most one remainder bucket.
    assert.ok(analysis.length <= 2, `expected <=2 analysis sections, got ${analysis.length}`);
    assert.ok(
      analysis.some((item) =>
        item.requirementIds.some((id) => id.startsWith("theme_"))
      )
    );
  });

  it("builds analysis sections for multi-requirement qa_answer (not scope+conclusion only)", () => {
    const ids = [
      "nda.confidentiality.scope_of_information",
      "nda.confidentiality.permitted_disclosures",
      "nda.confidentiality.exceptions",
      "nda.confidentiality.survival_period",
      "nda.confidentiality.return_destruction_obligations",
      "nda.confidentiality.mutuality",
    ];
    const intent = intentWithRequirements(ids);
    const outline = deriveReportOutline(intent, "qa_answer", "standard");
    assert.ok(analysisItems(outline).length >= 1);
    assert.notDeepEqual(outline.map((i) => i.role), ["scope", "conclusion"]);
  });
});
