/**
 * Point 1 golden: PLAN Art 28 ids must resolve to package-native Present
 * findings and must not be flooded by unstamped same-article risks.
 */
process.env.GOOGLE_CLOUD_PROJECT ??= "canonical-requirement-aggregation-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { Finding } from "../../../models/finding.js";
import {
  displayRequirementStatus,
  type RequirementJudgement,
} from "../../../models/requirement-assessment.js";
import { findingsLinkedToRequirement } from "../../../shared/article-linkage.js";
import { aggregateRequirements } from "../aggregate-requirements.js";

function presentJudgement(
  overrides: Partial<RequirementJudgement> = {}
): RequirementJudgement {
  return {
    compliance: "present",
    evidenceState: "direct",
    referenceBinding: "none",
    evidenceConfidence: "high",
    draftingQuality: "clean",
    materiality: "low",
    nli: "entailed",
    recommendationKind: "none",
    ...overrides,
  };
}

function finding(overrides: Partial<Finding>): Finding {
  return {
    findingId: "f1",
    kind: "compliance",
    category: "processor_terms_incomplete",
    status: "present",
    claim: "claim",
    evidence: [],
    taxonomyVersion: "test",
    ...overrides,
  };
}

const planIds = [
  "gdpr.article28.subject_matter",
  "gdpr.article28.duration",
  "gdpr.article28.nature_and_purpose",
  "gdpr.article28.categories_of_data_and_subjects",
  "gdpr.article28.controller_obligations_and_rights",
  "gdpr.article28.mandatory_clauses_completeness",
] as const;

function art28State(extra?: Partial<AnalysisState>): AnalysisState {
  return {
    intent: {
      requirements: planIds.map((id) => ({
        id,
        type: "adequacy",
        priority: "required",
        description: id,
      })),
    },
    activeSkills: [
      {
        id: "gdpr",
        regimeRules: [
          {
            ruleId: "gdpr.art28.3.chapeau",
            findingCategory: "processor_terms_incomplete",
            label: "chapeau",
          },
          {
            ruleId: "gdpr.art28.3.h",
            findingCategory: "processor_audit_evidence_gap",
            label: "audit",
          },
          {
            ruleId: "gdpr.art28.2",
            findingCategory: "subprocessor_authorisation_or_flowdown_gap",
            label: "sub",
          },
        ],
      },
    ],
    ...extra,
  } as unknown as AnalysisState;
}

describe("canonical requirement aggregation (Art 28 PLAN bleed)", () => {
  it("attaches native duration Present to PLAN duration and ignores unstamped Art 28 risks", () => {
    const findings: Finding[] = [
      finding({
        findingId: "f_native_duration",
        requirementId: "duration",
        claim: "Duration is set forth in the Offer.",
        evidence: [
          {
            locator: { docId: "d", structuralPath: "p", charRange: [0, 60] },
            quotedText: "Duration of Processing is set forth in the Agreement and Offer.",
            sourceRole: "target",
          },
        ],
        judgement: presentJudgement(),
      }),
      finding({
        findingId: "f_native_conf",
        requirementId: "art28_3_b_confidentiality",
        claim: "Confidentiality is present.",
        evidence: [
          {
            locator: { docId: "d", structuralPath: "p", charRange: [0, 80] },
            quotedText: "x".repeat(80),
            sourceRole: "target",
          },
        ],
        judgement: presentJudgement(),
      }),
      finding({
        findingId: "f_risk_chapeau",
        kind: "risk",
        category: "processor_terms_incomplete",
        status: "present",
        severity: "high",
        claim:
          "The agreement lacks complete processing particulars such as categories of data.",
        gap: "Obtain particulars schedule.",
        judgement: {
          compliance: "partial",
          evidenceState: "not_found",
          referenceBinding: "floating",
          evidenceConfidence: "low",
          draftingQuality: "could_be_clearer",
          materiality: "high",
          nli: "not_mentioned",
          recommendationKind: "obtain",
        },
      }),
      finding({
        findingId: "f_risk_audit",
        kind: "risk",
        category: "processor_audit_evidence_gap",
        status: "present",
        severity: "high",
        claim: "Audit rights limited to third-party reports.",
        gap: "Add inspection rights.",
        judgement: {
          compliance: "partial",
          evidenceState: "direct",
          referenceBinding: "none",
          evidenceConfidence: "medium",
          draftingQuality: "could_be_clearer",
          materiality: "high",
          nli: "contradicted",
          recommendationKind: "amend",
        },
      }),
      finding({
        findingId: "f_risk_sub",
        kind: "risk",
        category: "subprocessor_authorisation_or_flowdown_gap",
        status: "present",
        severity: "medium",
        claim: "Subprocessor prior authorisation gap.",
        gap: "Add prior notice.",
        judgement: {
          compliance: "partial",
          evidenceState: "not_found",
          referenceBinding: "none",
          evidenceConfidence: "low",
          draftingQuality: "could_be_clearer",
          materiality: "medium",
          nli: "not_mentioned",
          recommendationKind: "amend",
        },
      }),
    ];

    const state = art28State();
    const linked = findingsLinkedToRequirement(
      "gdpr.article28.duration",
      findings,
      state
    );
    assert.deepEqual(
      linked.map((f) => f.findingId),
      ["f_native_duration"]
    );

    const result = aggregateRequirements(
      state,
      { workUnitId: "wu-aggregate", input: {} } as never,
      findings
    );
    const assessments = result.state.requirementAssessments ?? [];
    const byId = new Map(assessments.map((a) => [a.requirementId, a]));

    // One duration row (canonical), not PLAN + native duplicates.
    assert.ok(byId.has("duration") || byId.has("gdpr.article28.duration"));
    assert.equal(
      assessments.filter(
        (a) =>
          a.requirementId === "duration" ||
          a.requirementId === "gdpr.article28.duration"
      ).length,
      1
    );

    const duration =
      byId.get("duration") ?? byId.get("gdpr.article28.duration")!;
    assert.deepEqual(duration.supportingFindingIds, ["f_native_duration"]);
    assert.ok(
      duration.status === "strong" || duration.status === "adequate",
      `expected Present-like status, got ${duration.status}`
    );
    assert.match(displayRequirementStatus(duration), /Present|Strong/);
    assert.equal(duration.judgement?.compliance, "present");

    // Sibling PLAN particulars must not inherit the shared Art 28 risk bundle.
    for (const id of [
      "gdpr.article28.subject_matter",
      "subject_matter",
      "gdpr.article28.nature_and_purpose",
      "nature_purpose",
    ]) {
      const row = byId.get(id);
      if (!row) continue;
      assert.ok(
        !row.supportingFindingIds.includes("f_risk_chapeau"),
        `${id} must not attach f_risk_chapeau`
      );
      assert.ok(
        !row.supportingFindingIds.includes("f_risk_audit"),
        `${id} must not attach f_risk_audit`
      );
    }

    const conf =
      byId.get("art28_3_b_confidentiality") ??
      assessments.find((a) =>
        a.supportingFindingIds.includes("f_native_conf")
      );
    assert.ok(conf);
    assert.deepEqual(conf!.supportingFindingIds, ["f_native_conf"]);
  });

  it("still joins unstamped matrix findings to a whole-article requirement", () => {
    const findings = [
      finding({
        findingId: "f_matrix",
        matrixRowId: "row.erasure",
        claim: "Erasure is named.",
        category: "gdpr.art17.erasure_gap",
      }),
    ];
    const linked = findingsLinkedToRequirement(
      "gdpr.article17.compliance",
      findings
    );
    assert.equal(linked.some((f) => f.findingId === "f_matrix"), true);
  });
});
