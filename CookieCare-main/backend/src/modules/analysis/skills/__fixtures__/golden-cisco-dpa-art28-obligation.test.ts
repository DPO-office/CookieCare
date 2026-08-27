import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupedResultsToFindings } from "../../capabilities/act/grouped-results-to-findings.js";
import { deriveRequirementJudgement } from "../../capabilities/act/requirement-status-policy.js";
import { aggregateRequirements } from "../../capabilities/act/aggregate-requirements.js";
import { displayRequirementStatus } from "../../models/requirement-assessment.js";
import { guardUnsupportedInference } from "../../capabilities/reporting/unsupported-inference.js";
import {
  assessmentTableMarkdown,
  enforceAnswerStyleLayout,
} from "../../capabilities/reporting/render-output.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { SharedEvidenceBundle } from "../../models/evidence-package.js";
import type { Finding } from "../../models/finding.js";
import type { AnalysisState } from "../../models/analysis-state.js";

const unit = {
  workUnitId: "wu-pkg-eval",
  tool: "evaluate_package",
  input: {},
  dependsOn: [],
  outputSchema: "Finding[]",
  status: "succeeded",
} as unknown as AnalysisWorkUnit;

describe("Art 28 obligation golden (deterministic)", () => {
  it("does not treat a floating annex pointer as Present or Amend", () => {
    const bundle: SharedEvidenceBundle = {
      packageId: "pkg.mandatory",
      docId: "d1",
      items: [
        {
          ref: "E1",
          clauseType: "processor_terms",
          quotedText: "See Schedule X.",
          structuralPath: "c1",
          charRange: [0, 16],
          evidenceStatus: "referenced_elsewhere",
        },
      ],
    };
    const findings = groupedResultsToFindings(
      [
        {
          requirementId: "art28_3_c_security",
          status: "missing",
          compliance: "gap",
          evidenceState: "incorporated",
          referenceBinding: "floating",
          nli: "not_mentioned",
          rationale: "Security measures are only pointed to in Schedule X.",
          evidenceRefs: ["E1"],
        },
      ],
      {
        unit,
        docId: "d1",
        packageId: "pkg.mandatory",
        sourceMode: "authored",
        findingCategory: "processor_terms",
        bundle,
      }
    );
    assert.equal(findings[0]?.status, "insufficient_evidence");
    const judgement = deriveRequirementJudgement(findings);
    assert.equal(judgement.compliance, "insufficient_evidence");
    assert.notEqual(judgement.recommendationKind, "amend");
    assert.equal(displayRequirementStatus({ status: "cannot_determine", judgement }), "Cannot determine");
  });

  it("keeps confidentiality present when its own extract supports the hypothesis", () => {
    const bundle: SharedEvidenceBundle = {
      packageId: "pkg.mandatory",
      docId: "d1",
      items: [
        {
          ref: "E2",
          clauseType: "confidentiality",
          quotedText:
            "Personnel of the Processor shall be bound by a duty of confidentiality.",
          structuralPath: "c2",
          charRange: [0, 70],
        },
      ],
    };
    const findings = groupedResultsToFindings(
      [
        {
          requirementId: "art28_3_b_confidentiality",
          status: "adequate",
          compliance: "present",
          evidenceState: "direct",
          referenceBinding: "none",
          nli: "entailed",
          rationale: "Staff confidentiality is stated in the processed clause.",
          evidenceRefs: ["E2"],
        },
      ],
      {
        unit,
        docId: "d1",
        packageId: "pkg.mandatory",
        sourceMode: "authored",
        findingCategory: "processor_terms",
        bundle,
      }
    );
    assert.equal(findings[0]?.status, "present");
    const judgement = deriveRequirementJudgement(findings);
    assert.equal(judgement.compliance, "present");
    assert.equal(judgement.nli, "entailed");
    assert.equal(displayRequirementStatus({ status: "adequate", judgement }), "Present & adequate");
  });

  it("allows entailed NLI with partial compliance", () => {
    const findings: Finding[] = [
      {
        findingId: "f1",
        kind: "compliance",
        category: "processor_terms",
        status: "present",
        claim: "Audit information is provided but inspection is not clearly granted.",
        evidence: [],
        taxonomyVersion: "test",
        requirementId: "art28_3_h_audit",
        judgement: {
          compliance: "partial",
          evidenceState: "direct",
          referenceBinding: "none",
          evidenceConfidence: "medium",
          draftingQuality: "could_be_clearer",
          materiality: "medium",
          nli: "entailed",
          recommendationKind: "clarify",
        },
      },
    ];
    const judgement = deriveRequirementJudgement(findings);
    assert.equal(judgement.nli, "entailed");
    assert.equal(judgement.compliance, "partial");
  });

  it("flags memo claims that cannot be traced to locked rows", () => {
    const assessments = aggregateRequirements(
      { findings: [] } as unknown as AnalysisState,
      { workUnitId: "wu-aggregate", input: {} } as never,
      [
        {
          findingId: "f-conf",
          kind: "compliance",
          category: "processor_terms",
          status: "present",
          claim: "Confidentiality is present.",
          evidence: [],
          taxonomyVersion: "test",
          requirementId: "art28_3_b_confidentiality",
        },
      ]
    ).state.requirementAssessments ?? [];
    const hits = guardUnsupportedInference(
      "The DPA is missing an audit right and must be amended immediately.",
      assessments
    );
    assert.ok(hits.length > 0);
  });
});

const CISCO_UNIT = unit;

function ciscoCtx(bundle: SharedEvidenceBundle) {
  return {
    unit: CISCO_UNIT,
    docId: "cisco-dpa",
    packageId: bundle.packageId,
    sourceMode: "authored" as const,
    findingCategory: "processor_terms",
    bundle,
  };
}

function item(
  ref: string,
  quotedText: string,
  extra: Partial<SharedEvidenceBundle["items"][number]> = {}
): SharedEvidenceBundle["items"][number] {
  return {
    ref,
    clauseType: "processor_terms",
    quotedText,
    structuralPath: ref,
    charRange: [0, quotedText.length],
    ...extra,
  };
}

function lockRow(
  requirementId: string,
  result: {
    status: "strong" | "adequate" | "conditional" | "gap" | "covered" | "partial" | "missing" | "not_applicable" | "cannot_determine";
    compliance?: "present" | "partial" | "gap" | "insufficient_evidence" | "not_applicable";
    evidenceState?: "direct" | "incorporated" | "truncated" | "unavailable" | "conflicting" | "not_found";
    referenceBinding?: "binding" | "floating" | "none";
    nli?: "entailed" | "contradicted" | "not_mentioned";
    draftingQuality?: "clean" | "could_be_clearer" | "operational_weakness";
    materiality?: "low" | "medium" | "high";
    rationale: string;
    gap?: string;
    evidenceRefs: string[];
  },
  bundle: SharedEvidenceBundle
) {
  const findings = groupedResultsToFindings(
    [{ requirementId, ...result }],
    ciscoCtx(bundle)
  );
  const judgement = deriveRequirementJudgement(findings);
  const label = displayRequirementStatus({
    status: "adequate",
    judgement,
  });
  return { findings, judgement, label };
}

describe("Art 28 Cisco-like extracts (locked rows)", () => {
  it("treats duration substance plus an Agreement cross-ref as Present, not Cannot determine or Gap", () => {
    const quote =
      "The duration of the Processing under this DPA is determined by You and as set forth in the Agreement. The DPA remains in force for the term of the Agreement.";
    const bundle: SharedEvidenceBundle = {
      packageId: "gdpr.art28.particulars",
      docId: "cisco-dpa",
      items: [item("E_duration", quote)],
    };
    const row = lockRow(
      "duration",
      {
        status: "cannot_determine",
        compliance: "insufficient_evidence",
        evidenceState: "incorporated",
        referenceBinding: "floating",
        nli: "entailed",
        rationale:
          "Duration cannot be fully verified without the underlying Agreement.",
        evidenceRefs: ["E_duration"],
      },
      bundle
    );
    assert.equal(row.judgement.compliance, "present");
    assert.match(row.label, /Present/);
    assert.doesNotMatch(row.label, /Cannot determine/);
    assert.notEqual(row.label, "Gap");
    assert.notEqual(row.judgement.recommendationKind, "amend");
  });

  it("treats controller obligations in the instrument as Present", () => {
    const quote =
      "You shall comply with Data Protection Laws, ensure instructions are lawful, ensure personal data was collected lawfully, and minimise the data provided.";
    const bundle: SharedEvidenceBundle = {
      packageId: "gdpr.art28.particulars",
      docId: "cisco-dpa",
      items: [item("E_ctrl", quote)],
    };
    const row = lockRow(
      "controller_obligations_rights",
      {
        status: "adequate",
        compliance: "present",
        evidenceState: "direct",
        referenceBinding: "none",
        nli: "entailed",
        rationale: "Controller duties are stated in the DPA.",
        evidenceRefs: ["E_ctrl"],
      },
      bundle
    );
    assert.equal(row.judgement.compliance, "present");
    assert.match(row.label, /Present|Strong/);
  });

  it("treats subprocessor notice, objection, and liability as Present, never Amend", () => {
    const quote =
      "Cisco shall provide 30 days' advance notice of each new Subprocessor and You may object on reasonable grounds. Cisco remains liable for Subprocessors' acts and omissions to the same extent as its own. Each Subprocessor is bound by a written agreement at least as protective as this DPA.";
    const bundle: SharedEvidenceBundle = {
      packageId: "gdpr.art28.3.mandatory_clauses",
      docId: "cisco-dpa",
      items: [item("E_sub", quote, { clauseType: "subprocessor_flow_down" })],
    };
    const row = lockRow(
      "art28_3_d_subprocessors",
      {
        status: "adequate",
        compliance: "present",
        evidenceState: "direct",
        referenceBinding: "none",
        nli: "entailed",
        rationale: "Notice, objection, flow-down, and liability are stated.",
        evidenceRefs: ["E_sub"],
      },
      bundle
    );
    assert.equal(row.judgement.compliance, "present");
    assert.match(row.label, /Present|Strong/);
    assert.notEqual(row.judgement.recommendationKind, "amend");
    assert.notEqual(row.label, "Minor drafting gap");
  });

  it("treats assistance, deletion, and confidentiality as Present", () => {
    const bundle: SharedEvidenceBundle = {
      packageId: "gdpr.art28.3.mandatory_clauses",
      docId: "cisco-dpa",
      items: [
        item(
          "E_assist",
          "Cisco shall assist You with Data Subject requests, DPIAs, prior consultation, and supervisory-authority notifications."
        ),
        item(
          "E_del",
          "Upon termination Cisco shall delete or return Personal Data and existing copies at Your choice."
        ),
        item(
          "E_conf",
          "Personnel authorised to process Personal Data are committed to confidentiality."
        ),
      ],
    };
    for (const [id, ref] of [
      ["art28_3_e_dsr_assistance", "E_assist"],
      ["art28_3_g_deletion_return", "E_del"],
      ["art28_3_b_confidentiality", "E_conf"],
    ] as const) {
      const row = lockRow(
        id,
        {
          status: "adequate",
          compliance: "present",
          evidenceState: "direct",
          nli: "entailed",
          rationale: "The obligation is stated in the DPA.",
          evidenceRefs: [ref],
        },
        bundle
      );
      assert.equal(row.judgement.compliance, "present", id);
      assert.match(row.label, /Present|Strong/, id);
    }
  });

  it("treats audit information without a clear inspection right as a minor drafting gap, not Gap", () => {
    const quote =
      "Cisco shall make available information necessary to demonstrate compliance and will provide third-party audit reports and certifications. The supplied text does not expressly grant a controller inspection right.";
    const bundle: SharedEvidenceBundle = {
      packageId: "gdpr.art28.3.mandatory_clauses",
      docId: "cisco-dpa",
      items: [item("E_audit", quote, { clauseType: "audit_and_compliance_evidence" })],
    };
    const row = lockRow(
      "art28_3_h_audit",
      {
        status: "partial",
        compliance: "partial",
        evidenceState: "direct",
        referenceBinding: "none",
        nli: "entailed",
        draftingQuality: "could_be_clearer",
        materiality: "high",
        rationale: "Compliance information is provided but inspection is not clearly granted.",
        gap: "No express controller inspection right.",
        evidenceRefs: ["E_audit"],
      },
      bundle
    );
    assert.equal(row.judgement.compliance, "partial");
    assert.equal(row.label, "Minor drafting gap");
  });

  it("treats subject matter and purpose with Offer baseline as Present, not Gap", () => {
    const quote =
      "This DPA applies to processing when Cisco provides Cisco Offers. The purpose of processing is the provision of those Cisco Offers. Further detail is in the Offer Disclosures.";
    const bundle: SharedEvidenceBundle = {
      packageId: "gdpr.art28.particulars",
      docId: "cisco-dpa",
      items: [item("E_sm", quote)],
    };
    const row = lockRow(
      "subject_matter",
      {
        status: "missing",
        compliance: "gap",
        evidenceState: "incorporated",
        referenceBinding: "floating",
        nli: "entailed",
        rationale: "Subject matter cannot be fully verified; see Offer Disclosures.",
        evidenceRefs: ["E_sm"],
      },
      bundle
    );
    assert.equal(row.judgement.compliance, "present");
    assert.match(row.label, /Present/);
    assert.notEqual(row.label, "Gap");
  });

  it("allows Cannot determine when data categories are only a disclosure pointer", () => {
    const bundle: SharedEvidenceBundle = {
      packageId: "gdpr.art28.particulars",
      docId: "cisco-dpa",
      items: [
        item("E_cats", "See Offer Disclosures.", {
          evidenceStatus: "referenced_elsewhere",
        }),
      ],
    };
    const row = lockRow(
      "data_categories",
      {
        status: "cannot_determine",
        compliance: "insufficient_evidence",
        evidenceState: "incorporated",
        referenceBinding: "floating",
        nli: "not_mentioned",
        rationale: "Categories of personal data are only pointed to in Offer Disclosures.",
        evidenceRefs: ["E_cats"],
      },
      bundle
    );
    assert.equal(row.judgement.compliance, "insufficient_evidence");
    assert.equal(row.label, "Cannot determine");
    assert.notEqual(row.judgement.recommendationKind, "amend");
  });

  it("replaces an LLM Gap table with the locked duration label and that row's quote", () => {
    const quote =
      "The duration of the Processing under this DPA is determined by You and as set forth in the Agreement.";
    const durationFinding: Finding = {
      findingId: "f_duration",
      kind: "compliance",
      category: "processor_terms",
      status: "present",
      claim: "Duration is tied to the term of the Agreement.",
      evidence: [
        {
          locator: { docId: "cisco-dpa", structuralPath: "c2", charRange: [0, quote.length] },
          quotedText: quote,
          sourceRole: "target",
        },
      ],
      taxonomyVersion: "test",
      requirementId: "duration",
      judgement: {
        compliance: "present",
        evidenceState: "incorporated",
        referenceBinding: "binding",
        evidenceConfidence: "medium",
        draftingQuality: "clean",
        materiality: "low",
        nli: "entailed",
        recommendationKind: "obtain",
      },
    };
    const markdown = [
      "## Processing particulars (Art 28(3) chapeau)",
      "The review is mixed.",
      "",
      "| Requirement | Status | Evidence | Finding |",
      "| :--- | :--- | :--- | :--- |",
      "| Duration | **Gap** | The processor shall implement encryption. | Amend to state duration. |",
      "",
      "## Conclusion",
      "See the table.",
    ].join("\n");
    const state = {
      request: {
        sessionId: "s1",
        instruction: "Present findings as a table.",
        documentIds: ["cisco-dpa"],
        documentTexts: {},
        answerStyle: "tabular",
      },
      intent: { outputForm: "table" },
      workspace: {},
      findings: [durationFinding],
      requirementAssessments: [
        {
          requirementId: "duration",
          supportingFindingIds: ["f_duration"],
          status: "adequate",
          summary: "Duration is tied to the term of the Agreement.",
          judgement: durationFinding.judgement,
        },
      ],
      plan: {
        outputForm: "table",
        reportSpec: {
          reportType: "regime_compliance_memo",
          depth: "standard",
          sections: ["requirements_matrix", "conclusion"],
          outline: [
            {
              id: "chapeau",
              role: "chapeau_particulars",
              sectionId: "chapeau_particulars",
              heading: "Processing particulars (Art 28(3) chapeau)",
              requirementIds: ["duration"],
              source: "deterministic",
            },
          ],
        },
      },
    } as unknown as AnalysisState;

    const table = assessmentTableMarkdown(
      state.requirementAssessments ?? [],
      state.findings ?? [],
      state
    );
    assert.match(table, /Present/);
    assert.match(table, /determined by You and as set forth in the Agreement/);
    assert.doesNotMatch(table, /implement encryption/);

    const out = enforceAnswerStyleLayout(markdown, state);
    assert.match(out, /Present/);
    assert.doesNotMatch(out, /\|\s*Duration\s*\|\s*\*\*Gap\*\*/);
    assert.match(out, /determined by You and as set forth in the Agreement/);
    assert.doesNotMatch(out, /implement encryption/);
  });
});
