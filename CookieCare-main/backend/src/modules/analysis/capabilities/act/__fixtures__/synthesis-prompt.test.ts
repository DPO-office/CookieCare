import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupAssessmentsForReport } from "../group-assessments.js";
import { deriveRequirementStatus } from "../requirement-status-policy.js";
import { buildSynthesisUserPrompt } from "../../../prompts/synthesis.js";
import { buildEvaluatePackageUserPrompt } from "../../../prompts/evaluate-package.js";
import type { RequirementAssessment } from "../../../models/requirement-assessment.js";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { Finding } from "../../../models/finding.js";

function assessment(
  requirementId: string,
  status: RequirementAssessment["status"],
  summary = "summary"
): RequirementAssessment {
  return {
    requirementId,
    supportingFindingIds: [],
    status,
    summary,
  };
}

describe("groupAssessmentsForReport", () => {
  it("collapses overlapping sale/share requirements into one theme", () => {
    const groups = groupAssessmentsForReport([
      assessment("ccpa.no_sell_share", "missing", "No sale or sharing restriction found."),
      assessment(
        "ccpa.prohibited_from_selling_or_sharing_personal_information",
        "missing",
        "Prohibited from selling or sharing personal information is missing."
      ),
      assessment("ccpa.business_purpose", "missing", "Business-purpose limitation is missing."),
    ]);
    assert.equal(groups.length, 2);
    const saleShare = groups.find((g) =>
      g.members.some((m) => m.requirementId.includes("sell"))
    );
    assert.ok(saleShare);
    assert.equal(saleShare!.members.length, 2);
    assert.equal(saleShare!.status, "missing");
    const business = groups.find((g) =>
      g.members.some((m) => m.requirementId.includes("business_purpose"))
    );
    assert.ok(business);
    assert.equal(business!.members.length, 1);
  });

  it("marks mixed coverage in a group as partial", () => {
    const groups = groupAssessmentsForReport([
      assessment("ccpa.no_sell_share", "covered", "Sale restriction present."),
      assessment(
        "ccpa.prohibited_from_selling_or_sharing",
        "missing",
        "Selling or sharing prohibition missing."
      ),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].status, "partial");
  });
});

describe("deriveRequirementStatus referenced-elsewhere language", () => {
  it("does not treat annex/cross-reference gaps as missing", () => {
    const finding: Finding = {
      findingId: "f1",
      kind: "compliance",
      category: "processor_terms",
      status: "absent_expected",
      claim:
        "The operative security measures are referenced in Annex II and cannot be fully verified from the supplied materials.",
      evidence: [],
      taxonomyVersion: "test",
      requirementId: "gdpr.security",
    };
    assert.equal(deriveRequirementStatus([finding]), "cannot_determine");
  });
});

describe("synthesis user prompt", () => {
  it("structures the brief around the user request and theme groups", () => {
    const state = {
      request: {
        sessionId: "s1",
        instruction: "Check this DPA for CCPA service-provider restrictions.",
        documentIds: [],
        documentTexts: {},
      },
      intent: {
        scope: "whole_document",
        operation: "compliance_check",
        standard: "none",
        standardConcept: "CCPA",
        outputForm: "memo",
        compound: false,
        subIntents: [],
        requirements: [
          {
            id: "ccpa.service_provider",
            description: "Confirm CCPA service-provider restrictions",
            type: "verification",
            priority: "required",
          },
        ],
        confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
      },
      workspace: {},
      findings: [],
      draftTasks: [],
      metadata: {
        timestamp: "",
        clauseTaxonomyVersion: "",
        riskTaxonomyVersion: "",
      },
    } as unknown as AnalysisState;

    const prompt = buildSynthesisUserPrompt(
      state,
      [],
      [
        assessment("ccpa.no_sell_share", "missing", "No sell/share restriction identified."),
        assessment(
          "ccpa.prohibited_from_selling_or_sharing",
          "missing",
          "Selling or sharing prohibition not identified."
        ),
      ],
      {
        reportType: "regime_compliance_memo",
        depth: "standard",
        sections: ["scope_and_conclusion", "requirements_detail", "recommendations"],
      }
    );

    assert.match(prompt, /USER REQUEST/);
    assert.match(prompt, /LEGAL FRAMEWORK/);
    assert.match(prompt, /THEME GROUPS/);
    assert.match(prompt, /Write ONE assessment covering all members/);
    assert.match(prompt, /Named standard: CCPA/);
    assert.doesNotMatch(prompt, /Requirement assessments \(authoritative/);
  });
});

describe("evaluate-package prompt", () => {
  it("tells the model not to treat extraction misses as missing", () => {
    const prompt = buildEvaluatePackageUserPrompt({
      instruction: "Check CCPA",
      depth: "standard",
      requirementIds: ["ccpa.no_sell_share"],
      authoredRuleText: "[ccpa.no_sell_share] No sale or sharing.",
      evidenceLines: ["(E1) [use_limitation status=referenced_elsewhere] See Annex A"],
    });
    assert.match(prompt, /does NOT automatically mean missing/);
    assert.match(prompt, /cannot_determine \(not missing\)/);
    assert.match(prompt, /status=referenced_elsewhere/);
  });
});
