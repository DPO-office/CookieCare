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

  it("marks mixed coverage in a group as conditional", () => {
    const groups = groupAssessmentsForReport([
      assessment("ccpa.no_sell_share", "covered", "Sale restriction present."),
      assessment(
        "ccpa.prohibited_from_selling_or_sharing",
        "missing",
        "Selling or sharing prohibition missing."
      ),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].status, "conditional");
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
      requirements: [
        {
          requirementId: "ccpa.no_sell_share",
          hypothesis: "The contract prohibits selling or sharing personal information.",
          candidateEvidenceRefs: ["E1"],
        },
      ],
      authoredRuleText: "[ccpa.no_sell_share] No sale or sharing.",
      evidenceLines: ["(E1) [use_limitation status=referenced_elsewhere] See Annex A"],
    });
    assert.match(prompt, /not_mentioned is not a gap/);
    assert.match(prompt, /Do not mark present merely because a pointer exists/);
    assert.match(prompt, /Baseline contractual substance/);
    assert.match(prompt, /status=referenced_elsewhere/);
  });

  it("forbids missing and Amend when evidence is truncated or heading-only", () => {
    const prompt = buildEvaluatePackageUserPrompt({
      instruction: "Check processor confidentiality",
      depth: "standard",
      requirements: [
        {
          requirementId: "confidentiality_of_staff",
          hypothesis: "Authorized personnel are bound by confidentiality.",
          candidateEvidenceRefs: ["E1"],
        },
      ],
      authoredRuleText: "[confidentiality] Persons authorised to process are under confidentiality.",
      evidenceLines: [
        "(E1) [confidentiality truncated=true heading_only=true] 3.6 Security of the Processing",
      ],
    });
    assert.match(prompt, /truncated=true or heading_only=true/);
    assert.match(prompt, /Do NOT use gap/);
    assert.match(
      prompt,
      /never recommend amending the agreement from insufficient_evidence, truncated, heading_only/i
    );
    assert.match(prompt, /Recommend Amend only for gap or partial/);
    assert.match(prompt, /Evaluate each requirementId independently/);
    assert.match(prompt, /Do not copy another requirement's rationale/);
  });

  it("partitions evidence so duration cannot see sibling retention extracts", () => {
    const prompt = buildEvaluatePackageUserPrompt({
      instruction: "Article 28 particulars",
      depth: "standard",
      requirements: [
        {
          requirementId: "duration",
          hypothesis: "The contract sets out the duration of the processing.",
          candidateEvidenceRefs: ["E2"],
          evidenceLines: [
            "(E2) [processor_terms candidates=supporting] The duration of the Processing is determined by You and as set forth in the Agreement.",
          ],
          packetRoles: { supporting: ["E2"], contextual: [] },
        },
        {
          requirementId: "art28_3_g_deletion_return",
          hypothesis: "The processor deletes or returns personal data at the end of the services.",
          candidateEvidenceRefs: ["E1"],
          evidenceLines: [
            "(E1) [processor_terms candidates=contextual] Under Argentine law personal data may be retained and destroyed up to two years.",
          ],
          packetRoles: { supporting: [], contextual: ["E1"] },
        },
      ],
      authoredRuleText: "[gdpr.art28.3.chapeau] Duration of processing.",
      evidenceLines: [],
    });
    assert.match(prompt, /supportingRefs: E2/);
    assert.match(prompt, /contextualRefs: E1/);
    assert.match(
      prompt,
      /Contextual evidence alone cannot make compliance=present|contextual-only packet cannot|only contextual refs are available/i
    );
    assert.match(prompt, /candidates=supporting/);
    const durationBlock = prompt.slice(
      prompt.indexOf("- duration"),
      prompt.indexOf("- art28_3_g_deletion_return")
    );
    assert.match(durationBlock, /duration of the Processing/);
    assert.doesNotMatch(durationBlock, /Argentine law/);
    assert.match(prompt, /Do not use another requirement's evidence packet/);
  });

  it("includes an authored proof standard in grouped package evaluation", () => {
    const prompt = buildEvaluatePackageUserPrompt({
      instruction: "Review the agreement.",
      depth: "standard",
      requirements: [
        {
          requirementId: "destination_particulars",
          hypothesis: "The agreement identifies permitted destinations.",
          proofStandard:
            "A reference to an unavailable schedule does not establish the actual destination list.",
          candidateEvidenceRefs: ["E1"],
          evidenceLines: ["(E1) See Schedule 1 for permitted destinations."],
        },
      ],
      authoredRuleText: "Transfers require appropriate safeguards.",
      evidenceLines: [],
    });

    assert.match(prompt, /proofStandard: A reference to an unavailable schedule/);
    assert.match(prompt, /apply it exactly/);
  });
});

describe("synthesis prompt - incomplete evidence", () => {
  it("forbids Amend from cannot_determine or truncated quotes", () => {
    assert.match(
      SYNTHESIS_SYSTEM_PROMPT,
      /Never recommend amending the agreement from cannot_determine/
    );
    assert.match(SYNTHESIS_SYSTEM_PROMPT, /truncated quotes/);
    assert.match(SYNTHESIS_SYSTEM_PROMPT, /Obtain \/ Confirm \/ re-read only/);
    assert.match(
      SYNTHESIS_SYSTEM_PROMPT,
      /Use Amend only when the assessment status is gap or partial/
    );
  });

  it("forbids a fully-complete conclusion when particulars live in a schedule", () => {
    assert.match(
      SYNTHESIS_SYSTEM_PROMPT,
      /If any supplied assessment is Present, particulars in schedule/
    );
    assert.match(SYNTHESIS_SYSTEM_PROMPT, /free of residual uncertainty/);
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
    assert.match(prompt, /Do not emit a markdown findings table/);
    assert.match(prompt, /Requirement \| Status \| Evidence \| Finding/);
    assert.doesNotMatch(prompt, /\bgdpr\b/i);
  });

  it("uses a numbered-list contract for narrative rights-matrix sections", () => {
    const state = {
      request: {
        sessionId: "s1",
        instruction: "How does this agreement address data subject rights?",
        documentIds: [],
        documentTexts: {},
        answerStyle: "narrative",
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
      assessments: [assessment("req.access", "partial")],
      reportSpec: {
        reportType: "rights_matrix",
        depth: "standard",
        sections: ["executive_summary", "requirements_matrix", "conclusion"],
      },
      item: {
        id: "analysis.matrix",
        role: "requirements_matrix",
        sectionId: "requirements_matrix",
        heading: "Requirements matrix",
        requirementIds: ["req.access"],
        source: "deterministic",
      },
    });
    assert.match(prompt, /NARRATIVE CONTRACT/);
    assert.match(prompt, /numbered list/);
    assert.doesNotMatch(prompt, /Prefer a markdown table/);
    assert.doesNotMatch(prompt, /TABLE CONTRACT FOR THIS SECTION/);
  });
});
