process.env.GOOGLE_CLOUD_PROJECT ??= "finalize-report-spec-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSkillById, resetSkillRegistryForTests } from "../../../skills/runtime/catalog/registry.js";
import { buildFinalReportSpec, mergeAuthoredReportSections } from "../../plan/resolve-report-spec.js";
import { finalizeReportSpec } from "../finalize-report-spec.js";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { IntentClassification } from "../../../models/intent.js";
import type { RequirementAssessment } from "../../../models/requirement-assessment.js";
import { outlineItemSectionId } from "../../../prompts/report-sections.js";

function intent(ids: string[]): IntentClassification {
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
  };
}

function assessment(
  requirementId: string,
  status: RequirementAssessment["status"]
): RequirementAssessment {
  return {
    requirementId,
    supportingFindingIds: [],
    status,
    summary: `${requirementId} ${status}`,
    recommendation: status === "missing" || status === "partial" ? "Address the gap." : undefined,
  };
}

function stateFromPackages(
  packages: Parameters<typeof mergeAuthoredReportSections>[0]["packages"],
  requirementIds: string[],
  assessments: RequirementAssessment[],
  extras?: Partial<AnalysisState>
): AnalysisState {
  const merged = mergeAuthoredReportSections({
    reportType: "regime_compliance_memo",
    depth: "standard",
    packages,
  });
  const spec = buildFinalReportSpec({
    intent: intent(requirementIds),
    reportType: merged.reportType,
    depth: "standard",
    sections: merged.sections,
    outlineExtras: merged.outlineExtras ?? [],
    instruction: "Review the agreement.",
  });
  return {
    plan: { reportSpec: spec },
    requirementAssessments: assessments,
    findings: [],
    analysisArtifacts: {},
    ...extras,
  } as unknown as AnalysisState;
}

describe("finalizeReportSpec", () => {
  it("produces different structures for NDA, Article 28, and transfers", () => {
    resetSkillRegistryForTests();
    const nda = getSkillById("doc-types/nda")!;
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const transfers = getSkillById("regimes/data-protection/international-transfers")!;

    const ndaPkg = nda.evidencePackages!.find((p) => p.id === "nda.structural_review")!;
    const art28 = gdpr.evidencePackages!.filter((p) => p.id.includes("art28"));
    const transferPkg = transfers.evidencePackages!.find(
      (p) => p.id === "international_transfer_inventory"
    )!;

    const ndaSpec = finalizeReportSpec(
      stateFromPackages(
        [ndaPkg],
        ["nda.confidentiality_definition"],
        [assessment("nda.confidentiality_definition", "missing")]
      )
    );
    const art28Spec = finalizeReportSpec(
      stateFromPackages(
        art28,
        ["subject_matter", "mandatory_article28_clauses"],
        [
          assessment("subject_matter", "cannot_determine"),
          assessment("mandatory_article28_clauses", "partial"),
        ]
      )
    );
    const transferSpec = finalizeReportSpec(
      stateFromPackages(
        [transferPkg],
        ["international_data_transfer"],
        [assessment("international_data_transfer", "missing")],
        {
          analysisArtifacts: {
            inv: {
              id: "inv",
              type: "transfer_inventory",
              packageId: "international_transfer_inventory",
              data: { transfers: [] },
            },
          },
        }
      )
    );

    const ndaIds = ndaSpec.sections.join(",");
    const artIds = art28Spec.sections.join(",");
    const xferIds = transferSpec.sections.join(",");
    assert.ok(ndaSpec.sections.includes("key_findings"));
    assert.ok(!ndaSpec.sections.includes("requirements_matrix"));
    assert.ok(art28Spec.sections.includes("requirements_matrix"));
    assert.ok(!art28Spec.sections.includes("key_findings"));
    assert.ok(art28Spec.sections.includes("missing_materials"));
    assert.ok(!ndaSpec.sections.includes("missing_materials"));
    assert.ok(xferIds.includes("key_findings"));
    assert.notEqual(ndaIds, artIds);
    assert.ok(
      (transferSpec.outline ?? []).some((item) =>
        (item.artifactTypes ?? []).includes("transfer_inventory")
      )
    );
    assert.ok(
      (ndaSpec.outline ?? []).some((item) => item.heading === "Confidentiality")
    );
    assert.ok(
      (art28Spec.outline ?? []).some((item) => /particulars/i.test(item.heading))
    );
  });

  it("omits recommendations and missing materials when assessments do not need them", () => {
    resetSkillRegistryForTests();
    const nda = getSkillById("doc-types/nda")!;
    const pkg = nda.evidencePackages!.find((p) => p.id === "nda.structural_review")!;
    const spec = finalizeReportSpec(
      stateFromPackages(
        [pkg],
        ["nda.confidentiality_definition"],
        [assessment("nda.confidentiality_definition", "covered")]
      )
    );
    assert.ok(!spec.sections.includes("recommendations"));
    assert.ok(!spec.sections.includes("material_gaps"));
    assert.ok(!spec.sections.includes("missing_materials"));
    assert.ok(spec.sections.includes("executive_summary"));
    assert.ok(spec.sections.includes("conclusion"));
  });

  it("uses evidence + conclusion for narrow Q&A", () => {
    const seed = buildFinalReportSpec({
      intent: intent(["q1"]),
      reportType: "qa_answer",
      depth: "narrow",
      sections: ["evidence", "conclusion"],
      outlineExtras: [],
      instruction: "What is the term?",
    });
    const spec = finalizeReportSpec({
      plan: { reportSpec: seed },
      requirementAssessments: [assessment("q1", "covered")],
      findings: [],
    } as unknown as AnalysisState);
    assert.deepEqual(
      spec.outline?.map((item) => outlineItemSectionId(item)),
      ["evidence", "conclusion"]
    );
  });

  it("skips qualifications when missing_materials already covers indeterminate items", () => {
    const seed = buildFinalReportSpec({
      intent: intent(["req.a"]),
      reportType: "regime_compliance_memo",
      depth: "standard",
      sections: [
        "scope",
        "requirements_detail",
        "qualifications",
        "missing_materials",
        "conclusion",
      ],
      outlineExtras: [],
      instruction: "Review the agreement.",
    });
    const spec = finalizeReportSpec({
      plan: { reportSpec: seed },
      requirementAssessments: [assessment("req.a", "cannot_determine")],
      findings: [],
    } as unknown as AnalysisState);
    assert.ok(spec.sections.includes("missing_materials"));
    assert.ok(!spec.sections.includes("qualifications"));
  });
});
