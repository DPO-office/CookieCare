process.env.GOOGLE_CLOUD_PROJECT ??= "article-linkage-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Finding } from "../../../models/finding.js";
import {
  findingsLinkedToRequirement,
  subprovisionKeyFromId,
} from "../../../shared/article-linkage.js";
import { humanizeRequirementId } from "../../../shared/group-assessments.js";
import { aggregateRequirements } from "../aggregate-requirements.js";
import type { AnalysisState } from "../../../models/analysis-state.js";

function finding(overrides: Partial<Finding>): Finding {
  return {
    findingId: "f1",
    kind: "compliance",
    category: "processor_terms",
    status: "present",
    claim: "claim",
    evidence: [],
    taxonomyVersion: "test",
    ...overrides,
  };
}

describe("subprovisionKeyFromId", () => {
  it("isolates lettered and paragraph keys", () => {
    assert.equal(subprovisionKeyFromId("art28_3_a_instructions"), "28.3.a");
    assert.equal(subprovisionKeyFromId("gdpr.art28.3.g"), "28.3.g");
    assert.equal(subprovisionKeyFromId("art28_4_subprocessor_flow_down"), "28.4");
    assert.equal(subprovisionKeyFromId("gdpr.art28.3.chapeau"), "28.3.chapeau");
    assert.equal(subprovisionKeyFromId("gdpr.art12.3"), "12.3");
    assert.equal(subprovisionKeyFromId("subject_matter"), undefined);
  });
});

describe("findingsLinkedToRequirement", () => {
  it("does not attach a deletion finding to confidentiality or chapeau rows", () => {
    const findings = [
      finding({
        findingId: "f_g",
        requirementId: "art28_3_g_deletion_return",
        ruleId: "gdpr.art28.3.g",
        claim: "Deletion exception is too broad.",
        evidence: [
          {
            locator: { docId: "d", structuralPath: "p", charRange: [0, 10] },
            quotedText: "unless applicable local law requires storage",
            sourceRole: "target",
          },
        ],
      }),
      finding({
        findingId: "f_b",
        requirementId: "art28_3_b_confidentiality",
        ruleId: "gdpr.art28.3.b",
        claim: "Staff confidentiality is present.",
        evidence: [
          {
            locator: { docId: "d", structuralPath: "p", charRange: [0, 10] },
            quotedText: "Personnel shall keep personal data confidential.",
            sourceRole: "target",
          },
        ],
      }),
    ];

    const confidentiality = findingsLinkedToRequirement(
      "art28_3_b_confidentiality",
      findings
    );
    assert.deepEqual(
      confidentiality.map((f) => f.findingId),
      ["f_b"]
    );

    const chapeau = findingsLinkedToRequirement("article28.subject_matter", findings);
    assert.equal(chapeau.length, 0);

    const deletion = findingsLinkedToRequirement("art28_3_g_deletion_return", findings);
    assert.deepEqual(
      deletion.map((f) => f.findingId),
      ["f_g"]
    );
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
    const linked = findingsLinkedToRequirement("gdpr.article17.compliance", findings);
    assert.equal(linked.some((f) => f.findingId === "f_matrix"), true);
  });
});

describe("aggregateRequirements lettered isolation", () => {
  it("does not copy a sibling letter's status onto another letter", () => {
    const findings = [
      finding({
        findingId: "f_g",
        requirementId: "art28_3_g_deletion_return",
        status: "absent_expected",
        claim: "Deletion exception is too broad.",
        gap: "Restrict retention to Union or Member State law.",
      }),
      finding({
        findingId: "f_b",
        requirementId: "art28_3_b_confidentiality",
        status: "present",
        claim: "Staff confidentiality is present.",
        evidence: [
          {
            locator: { docId: "d", structuralPath: "p", charRange: [0, 80] },
            quotedText: "x".repeat(80),
            sourceRole: "target",
          },
        ],
      }),
    ];
    const state = {
      findings,
      intent: {
        requirements: [
          { id: "art28_3_b_confidentiality", description: "", type: "verification", priority: "required" },
          { id: "art28_3_g_deletion_return", description: "", type: "verification", priority: "required" },
        ],
      },
    } as unknown as AnalysisState;
    const result = aggregateRequirements(state, { workUnitId: "wu-aggregate", input: {} } as never, findings);
    const byId = new Map(
      (result.state.requirementAssessments ?? []).map((a) => [a.requirementId, a])
    );
    assert.equal(byId.get("art28_3_b_confidentiality")?.status, "strong");
    assert.equal(byId.get("art28_3_g_deletion_return")?.status, "gap");
    assert.deepEqual(byId.get("art28_3_b_confidentiality")?.supportingFindingIds, ["f_b"]);
  });
});

describe("humanizeRequirementId", () => {
  it("prints lettered ids as Art n(m)(x) rather than Art28 3 A", () => {
    assert.equal(
      humanizeRequirementId("art28_3_a_instructions"),
      "Art 28(3)(a) Instructions"
    );
    assert.equal(humanizeRequirementId("dpa.subject_matter_defined"), "Subject Matter Defined");
  });
});
