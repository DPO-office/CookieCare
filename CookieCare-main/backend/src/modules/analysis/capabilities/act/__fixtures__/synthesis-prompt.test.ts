import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupAssessmentsForReport } from "../group-assessments.js";
import { deriveRequirementStatus } from "../requirement-status-policy.js";
import {
  SYNTHESIS_SYSTEM_PROMPT,
  buildSectionSynthesisUserPrompt,
  buildSynthesisUserPrompt,
  synthesisSectionSystemPrompt,
} from "../../../prompts/synthesis.js";
import { buildEvaluatePackageUserPrompt } from "../../../prompts/evaluate-package.js";
import type { RequirementAssessment } from "../../../models/requirement-assessment.js";
import type { ReportOutlineItem } from "../../../models/intent.js";
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
        sections: ["scope", "requirements_detail", "recommendations", "conclusion"],
      }
    );

    assert.match(prompt, /USER REQUEST/);
    assert.match(prompt, /LEGAL FRAMEWORK/);
    assert.match(prompt, /THEME GROUPS/);
    assert.match(prompt, /Write ONE assessment covering all members/);
    assert.match(prompt, /Named standard: CCPA/);
    assert.match(prompt, /SECTION ARCHITECTURE/);
    assert.doesNotMatch(prompt, /Requirement assessments \(authoritative/);
  });

  it("uses reportSpec.outline to drive analysis subsections", () => {
    const state = {
      request: {
        sessionId: "s1",
        instruction: "Check this DPA for GDPR Article 28 compliance.",
        documentIds: [],
        documentTexts: {},
      },
      intent: {
        scope: "whole_document",
        operation: "compliance_check",
        standard: "none",
        standardConcept: "GDPR Article 28",
        outputForm: "memo",
        compound: false,
        subIntents: [],
        requirements: [],
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

    const outline: ReportOutlineItem[] = [
      {
        id: "analysis.x",
        role: "analysis",
        heading: "Mandatory Article 28(3) clauses",
        requirementIds: ["gdpr.art28.3.f"],
        source: "deterministic",
      },
    ];

    const prompt = buildSynthesisUserPrompt(
      state,
      [],
      [assessment("gdpr.art28.3.f", "missing", "Test assessment")],
      {
        reportType: "regime_compliance_memo",
        depth: "standard",
        sections: ["scope", "requirements_detail", "recommendations", "conclusion"],
        outline,
      }
    );

    assert.match(prompt, /OUTLINE SECTIONS/);
    assert.match(prompt, /## Mandatory Article 28\(3\) clauses/);
    assert.doesNotMatch(prompt, /THEME GROUPS/);
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

  it("forbids missing and Amend when evidence is truncated or heading-only", () => {
    const prompt = buildEvaluatePackageUserPrompt({
      instruction: "Check GDPR Art 28",
      depth: "standard",
      requirementIds: ["gdpr.art28.3.b"],
      authoredRuleText: "[gdpr.art28.3.b] Persons authorised to process are under confidentiality.",
      evidenceLines: [
        "(E1) [confidentiality truncated=true heading_only=true] 3.6 Security of the Processing",
      ],
    });
    assert.match(prompt, /truncated=true or heading_only=true/);
    assert.match(prompt, /Do NOT use missing/);
    assert.match(
      prompt,
      /never recommend amending the agreement from cannot_determine, truncated, or heading_only/i
    );
    assert.match(prompt, /Recommend Amend only for missing or partial/);
  });
});

describe("synthesis prompt — incomplete evidence", () => {
  it("forbids Amend from cannot_determine or truncated quotes", () => {
    assert.match(
      SYNTHESIS_SYSTEM_PROMPT,
      /Never recommend amending the agreement from cannot_determine/
    );
    assert.match(SYNTHESIS_SYSTEM_PROMPT, /truncated quotes/);
    assert.match(SYNTHESIS_SYSTEM_PROMPT, /Obtain \/ Confirm \/ re-read only/);
    assert.match(
      SYNTHESIS_SYSTEM_PROMPT,
      /Use Amend only when the assessment status is missing or partial/
    );
  });
});

describe("per-section synthesis prompt", () => {
  it("includes only mapped assessments and instructs a top-level H2", () => {
    const state = {
      request: {
        sessionId: "s1",
        instruction: "Review this NDA.",
        documentIds: [],
        documentTexts: {},
      },
      intent: {
        scope: "whole_document",
        operation: "compliance_check",
        standard: "none",
        outputForm: "memo",
        compound: false,
        subIntents: [],
        requirements: [],
        confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
      },
      workspace: {},
      findings: [],
      analysisArtifacts: {},
    } as unknown as AnalysisState;

    const prompt = buildSectionSynthesisUserPrompt({
      state,
      findings: [],
      assessments: [
        assessment("nda.confidentiality_definition", "covered"),
        assessment("nda.term_and_survival", "missing"),
      ],
      reportSpec: {
        reportType: "regime_compliance_memo",
        depth: "standard",
        sections: ["executive_summary", "key_findings", "conclusion"],
      },
      item: {
        id: "analysis.confidentiality",
        role: "key_findings",
        sectionId: "key_findings",
        heading: "Confidentiality",
        requirementIds: ["nda.confidentiality_definition"],
        source: "deterministic",
      },
    });

    assert.match(prompt, /THIS SECTION ONLY/);
    assert.match(prompt, /## Confidentiality/);
    assert.match(prompt, /nda\.confidentiality_definition|Confidentiality/);
    assert.doesNotMatch(prompt, /term_and_survival/);
  });

  it("enforces a table-first contract when answerStyle is tabular", () => {
    const state = {
      request: {
        sessionId: "s1",
        instruction: "Check processor terms.",
        documentIds: [],
        documentTexts: {},
        answerStyle: "tabular",
      },
      intent: {
        scope: "whole_document",
        operation: "compliance_check",
        standard: "none",
        outputForm: "memo",
        compound: false,
        subIntents: [],
        requirements: [],
        confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
      },
      workspace: {},
      findings: [],
      analysisArtifacts: {},
    } as unknown as AnalysisState;

    const system = synthesisSectionSystemPrompt(state);
    assert.match(system, /tabular form/i);
    assert.match(system, /Requirement \| Status \| Evidence \| Finding/);

    const prompt = buildSectionSynthesisUserPrompt({
      state,
      findings: [],
      assessments: [assessment("req.instructions", "partial")],
      reportSpec: {
        reportType: "regime_compliance_memo",
        depth: "standard",
        sections: ["executive_summary", "requirements_matrix", "conclusion"],
      },
      item: {
        id: "analysis.matrix",
        role: "requirements_matrix",
        sectionId: "requirements_matrix",
        heading: "Requirements matrix",
        requirementIds: ["req.instructions"],
        source: "deterministic",
      },
    });
    assert.match(prompt, /ANSWER STYLE/);
    assert.match(prompt, /tabular/);
    assert.match(prompt, /TABLE CONTRACT/);
    assert.match(prompt, /Requirement \| Status \| Evidence \| Finding/);
    assert.doesNotMatch(prompt, /\bgdpr\b/i);
  });
});
