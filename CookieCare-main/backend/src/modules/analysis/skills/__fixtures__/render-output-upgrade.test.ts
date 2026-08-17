import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { ClauseObject } from "../../models/clause-object.js";
import type { Finding } from "../../models/finding.js";
import { getSkillById, getSkillRegistry, resetSkillRegistryForTests } from "../registry.js";

process.env.GOOGLE_CLOUD_PROJECT ??= "render-output-test";
const {
  buildBriefSummaryDocument,
  buildRightsMatrixMemoDocument,
  consolidateFindingsForRender,
  getEligibleRemedialFindings,
} = await import("../../capabilities/act/render-output.js");
const { hasAutomatedDecisionContext } = await import(
  "../../capabilities/act/evaluate-matrix-row.js"
);
const { findAssistanceClauseWithSilentCost } = await import(
  "../../capabilities/act/flag-risk.js"
);

const locator = {
  docId: "cisco-dpa",
  structuralPath: "section-5",
  charRange: [0, 120] as [number, number],
};

function finding(overrides: Partial<Finding>): Finding {
  return {
    findingId: String(overrides.findingId ?? "finding"),
    kind: "risk",
    category: "other_known_risk",
    status: "absent_expected",
    claim: "The agreement leaves a material obligation unresolved.",
    evidence: [
      {
        locator,
        quotedText: "Processor shall assist Controller with data subject requests.",
        sourceRole: "target",
      },
    ],
    severity: "medium",
    taxonomyVersion: "test",
    visibility: "user_facing",
    ruleSourceTier: "B",
    ...overrides,
  };
}

describe("render-output legal memo upgrade", () => {
  it("requires a human-readable display label for every configured category", () => {
    resetSkillRegistryForTests();
    for (const skill of Object.values(getSkillRegistry())) {
      assert.ok(
        skill.riskCategories.every((category) => category.displayLabel.trim().length > 0),
        `${skill.skillId} contains a category without displayLabel`
      );
    }
  });

  it("renders fixed numbered sections, labels, citations, and one remedy per gap", () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const findings = [
      finding({
        findingId: "erasure",
        category: "erasure_termination_only_gap",
        kind: "compliance",
        matrixRowId: "gdpr.right.erasure",
        matrixAddressing: "generic",
        gap: "mid-term erasure is not expressly supported",
        claim: "Deletion is described only at contract termination.",
      }),
      finding({
        findingId: "cost",
        category: "cost_allocation_silent",
        claim: "The assistance clause does not allocate assistance costs.",
      }),
      finding({
        findingId: "art22",
        category: "automated_decision_gap",
        kind: "compliance",
        status: "insufficient_evidence",
        matrixRowId: "gdpr.right.automated_decisions",
        matrixAddressing: "absent",
        evidence: [],
        gap: "Article 22 applies only if qualifying automated decision-making is involved",
        claim: "No automated-decision language establishes that Article 22 applies.",
      }),
    ];
    const state = {
      request: {
        sessionId: "test",
        instruction: "Review GDPR Articles 15-22.",
        documentIds: ["cisco-dpa"],
        documentTexts: {},
        documentTitles: { "cisco-dpa": "Cisco Data Processing Addendum.pdf" },
      },
      workspace: {
        sessionId: "test",
        documents: [
          {
            docId: "cisco-dpa",
            title: "Cisco Data Processing Addendum.pdf",
            role: "target",
            fullText: "Processor shall assist Controller with data subject requests.",
            segments: [],
            clauses: [],
          },
        ],
      },
      activeSkills: [gdpr],
      activeSkillIds: [gdpr.skillId],
      mergedRegimeRules: gdpr.regimeRules,
      findings,
      draftTasks: [],
      metadata: {
        timestamp: "2026-08-15T00:00:00.000Z",
        clauseTaxonomyVersion: "test",
        riskTaxonomyVersion: "test",
      },
    } as unknown as AnalysisState;

    const eligible = getEligibleRemedialFindings(findings);
    const output = buildRightsMatrixMemoDocument(
      state,
      findings,
      "The agreement provides broad assistance but leaves several operational points unresolved."
    );

    for (const heading of [
      "## 1. Architecture / Obligations Summary",
      "## 2. Rights Matrix / Mapping",
      "## 3. Response Timeframes",
      "## 4. Gaps That Could Result in a Violation",
      "## 5. Suggested Remedial Points",
      "## 6. Related, Not Requested",
      "## 7. Bottom Line",
      "## 8. References",
    ]) {
      assert.match(output, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }

    const remedies = output
      .split("## 5. Suggested Remedial Points")[1]
      .split("## 6. Related, Not Requested")[0]
      .match(/^\d+\. \*\*/gm);
    assert.equal(remedies?.length ?? 0, eligible.length);
    assert.match(output, /\[1\] Cisco Data Processing Addendum\.pdf/);
    assert.match(output, /Erasure limited to contract termination \(Art 17\)/);
    assert.match(
      output,
      /\| Automated individual decision-making \| 22 \| Insufficient evidence \|/
    );
    for (const rawCategory of findings.map((item) => item.category)) {
      assert.doesNotMatch(output, new RegExp(rawCategory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("detects silent assistance-cost allocation and hedges unsupported Article 22", () => {
    const clauses = [
      {
        clauseId: "assistance",
        clauseType: "processor_assistance_obligation",
        text: "Processor shall assist Controller with data subject requests.",
        locator,
      },
    ] as ClauseObject[];

    assert.equal(findAssistanceClauseWithSilentCost(clauses)?.clauseId, "assistance");
    assert.equal(
      findAssistanceClauseWithSilentCost([
        { ...clauses[0], text: `${clauses[0].text} Assistance is provided at no additional charge.` },
      ]),
      null
    );
    assert.equal(hasAutomatedDecisionContext("The DPA contains only general DSR assistance."), false);
    assert.equal(
      hasAutomatedDecisionContext("Solely automated decisions require human review."),
      true
    );
  });

  it("consolidates one user-facing conclusion per authored rule", () => {
    const duplicates = Array.from({ length: 8 }, (_, index) =>
      finding({
        findingId: `art28-${index}`,
        kind: "compliance",
        ruleId: "gdpr.art28.3.e",
        category: "dsr_assistance_not_operational",
        status: index === 0 ? "present" : "insufficient_evidence",
        claim:
          index === 1
            ? "Could not verify that the target document satisfies rule gdpr.art28.3.e: no verbatim supporting quote was returned."
            : `Clause-level result ${index}.`,
      })
    );
    const consolidated = consolidateFindingsForRender(duplicates);
    assert.equal(consolidated.length, 1);
    assert.doesNotMatch(consolidated[0].claim, /Could not verify that/);
  });

  it("renders constrained articles in a genuinely brief summary shape", () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const findings = [
      finding({
        findingId: "access",
        kind: "compliance",
        status: "present",
        category: "gdpr.art15.access_gap",
        matrixRowId: "gdpr.right.access",
        matrixAddressing: "named",
        claim: "The agreement expressly supports access requests.",
      }),
      finding({
        findingId: "rectification",
        kind: "compliance",
        category: "gdpr.art16.rectification_gap",
        matrixRowId: "gdpr.right.rectification",
        matrixAddressing: "absent",
        claim: "Rectification is not expressly addressed.",
      }),
      finding({
        findingId: "erasure",
        kind: "compliance",
        category: "gdpr.art17.erasure_gap",
        matrixRowId: "gdpr.right.erasure",
        matrixAddressing: "generic",
        claim: "Erasure is covered only by general request language.",
      }),
    ];
    const state = {
      request: {
        sessionId: "brief",
        instruction:
          "Give me a brief overview of GDPR articles 15 16 17, nothing more than that.",
        documentIds: ["cisco-dpa"],
        documentTexts: {},
      },
      workspace: { sessionId: "brief", documents: [] },
      activeSkills: [gdpr],
      activeSkillIds: [gdpr.skillId],
      findings,
      draftTasks: [],
      metadata: {
        timestamp: "2026-08-17T00:00:00.000Z",
        clauseTaxonomyVersion: "test",
        riskTaxonomyVersion: "test",
      },
    } as unknown as AnalysisState;

    const output = buildBriefSummaryDocument(state, findings);
    assert.match(output, /## Quick reference/);
    assert.match(output, /\| Article 15 \| A person can ask what personal data/);
    assert.match(output, /\*\*Article 16\.\*\*/);
    assert.match(output, /## Practical bottom line/);
    assert.match(output, /extend this to Articles 18–22/);
    assert.doesNotMatch(output, /Gaps That Could Result in a Violation/);
    assert.doesNotMatch(output, /Suggested Remedial Points/);
  });
});
