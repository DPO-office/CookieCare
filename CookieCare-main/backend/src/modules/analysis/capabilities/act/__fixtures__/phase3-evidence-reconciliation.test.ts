import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Finding } from "../../../models/finding.js";
import type { VerifyPropositionResult } from "../verify-proposition.js";
import {
  firstDistinctScopePair,
  completeEvidenceQuote,
  verifyOutcomesHaveDistinctScopes,
} from "../evaluate-package.js";
import { deriveRequirementJudgement } from "../requirement-status-policy.js";
import { buildSectionCandidates } from "../select-candidates.js";
import { segmentDocument } from "../../../segmentation/segment-document.js";
import { operationSupportsOpenProposition } from "../../plan/generate-propositions.js";
import { shouldPreferOpenAnalysisLane } from "../../plan/build-plan.js";
import { operationNeedsOpenInventory } from "../../plan/build-open-plan.js";
import {
  isConfirmedRiskFinding,
  isProtectiveFinding,
  normalizeFindingSemantics,
} from "../../../shared/finding-semantics.js";

function verifyResult(
  overrides: Partial<VerifyPropositionResult>
): VerifyPropositionResult {
  return {
    verdict: "proves",
    quote: "The processor shall act only on documented instructions.",
    rationale: "The quoted obligation establishes the proposition.",
    quoteVerified: true,
    ...overrides,
  };
}

function finding(overrides: Partial<Finding>): Finding {
  return {
    findingId: "f1",
    kind: "risk",
    category: "test",
    status: "present",
    claim: "Test finding",
    evidence: [],
    taxonomyVersion: "v1",
    visibility: "user_facing",
    ...overrides,
  };
}

describe("Phase 3 applicability reconciliation", () => {
  it("routes direct extraction Q&A through the open proposition spine", () => {
    assert.equal(operationSupportsOpenProposition("extract"), true);
    assert.equal(
      shouldPreferOpenAnalysisLane({
        enabled: true,
        operation: "extract",
        standard: "regime_pack:regimes/data-protection/gdpr",
      }),
      true
    );
  });

  it("keeps explicit regime compliance checks on the authored catalog path", () => {
    assert.equal(
      shouldPreferOpenAnalysisLane({
        enabled: true,
        operation: "compliance_check",
        standard: "regime_pack:regimes/data-protection/gdpr",
      }),
      false
    );
  });

  it("skips broad PLAN inventory for focused Q&A but keeps it for survey operations", () => {
    assert.equal(operationNeedsOpenInventory("extract"), false);
    assert.equal(operationNeedsOpenInventory("explain_qa"), false);
    assert.equal(operationNeedsOpenInventory("risk_flag"), true);
    assert.equal(operationNeedsOpenInventory("compare"), true);
    assert.equal(operationNeedsOpenInventory("compliance_check"), true);
  });

  it("recognizes different jurisdictions as distinct scopes", () => {
    const eu = verifyResult({
      applicabilityScope: { jurisdictions: ["European Economic Area"] },
    });
    const us = verifyResult({
      verdict: "contradicts",
      applicabilityScope: { jurisdictions: ["United States"] },
    });
    assert.equal(verifyOutcomesHaveDistinctScopes(eu, us), true);
  });

  it("recognizes a main rule and express exception as distinct scopes", () => {
    const main = verifyResult({ scopeRole: "main_rule" });
    const exception = verifyResult({
      verdict: "contradicts",
      scopeRole: "exception",
    });
    assert.equal(verifyOutcomesHaveDistinctScopes(main, exception), true);
  });

  it("does not invent a scope split when VERIFY supplied no scope evidence", () => {
    assert.equal(
      verifyOutcomesHaveDistinctScopes(
        verifyResult({}),
        verifyResult({ verdict: "contradicts" })
      ),
      false
    );
  });

  it("retains enclosing section headings as generic applicability context", () => {
    const doc = segmentDocument(
      "doc1",
      [
        "CONTROLLER TO PROCESSOR SPECIFIC TERMS",
        "3.3. Roles of the Parties. Mastercard is Controller and Supplier is Processor for the covered processing.",
        "CONTROLLER TO CONTROLLER SPECIFIC TERMS",
        "4.3. Roles of the Parties. Each party is an independent Controller for its own business purposes.",
      ].join("\n")
    );
    const candidates = buildSectionCandidates(doc);
    const c2p = candidates.find((item) => item.structuralPath === "clause-3.3");
    const c2c = candidates.find((item) => item.structuralPath === "clause-4.3");

    assert.equal(c2p?.contextHeading, "CONTROLLER TO PROCESSOR SPECIFIC TERMS");
    assert.equal(c2c?.contextHeading, "CONTROLLER TO CONTROLLER SPECIFIC TERMS");
    assert.equal(
      verifyOutcomesHaveDistinctScopes(
        verifyResult({ applicabilityScope: { conditions: [c2p!.contextHeading!] } }),
        verifyResult({
          verdict: "contradicts",
          applicabilityScope: { conditions: [c2c!.contextHeading!] },
        })
      ),
      true
    );
  });

  it("preserves grounded Q&A evidence when relevant passages have distinct scopes", () => {
    const pair = firstDistinctScopePair([
      {
        item: {
          ref: "S1",
          sourceDocId: "doc1",
          structuralPath: "scope-a",
          clauseType: "scope-a",
          quotedText: "Rule for scope A.",
          charRange: [0, 17],
        },
        result: verifyResult({
          verdict: "related_not_proof",
          applicabilityScope: { conditions: ["Scope A"] },
        }),
      },
      {
        item: {
          ref: "S2",
          sourceDocId: "doc1",
          structuralPath: "scope-b",
          clauseType: "scope-b",
          quotedText: "Rule for scope B.",
          charRange: [18, 35],
        },
        result: verifyResult({
          verdict: "contradicts",
          applicabilityScope: { conditions: ["Scope B"] },
        }),
      },
    ]);
    assert.deepEqual(pair?.map(({ item }) => item.ref), ["S1", "S2"]);
  });

  it("extends a verified quote fragment to a real source boundary", () => {
    assert.equal(
      completeEvidenceQuote(
        "Each party is an independent Controller for its own purposes. A later sentence follows.",
        "Each party is an independent Contr"
      ),
      "Each party is an independent Controller for its own purposes."
    );
  });
});

describe("Phase 3 polarity and perspective channels", () => {
  it("normalizes risk, control, compliance, and neutral findings without prompt-specific ids", () => {
    const normalized = normalizeFindingSemantics(
      [
        finding({ findingId: "risk", judgement: { compliance: "present", evidenceState: "direct", referenceBinding: "none", evidenceConfidence: "high", materiality: "high", nli: "entailed", recommendationKind: "none" } }),
        finding({ findingId: "control", judgement: { compliance: "present", evidenceState: "direct", referenceBinding: "none", evidenceConfidence: "high", materiality: "low", nli: "contradicted", recommendationKind: "none" } }),
        finding({ findingId: "compliance", kind: "compliance" }),
        finding({ findingId: "summary", kind: "summary_point" }),
      ],
      { intent: { partyPerspective: "the customer" } as never }
    );
    assert.deepEqual(
      normalized.map((item) => [item.findingId, item.polarity, item.partyPerspective]),
      [
        ["risk", "risk_present", "customer"],
        ["control", "control_present", "customer"],
        ["compliance", "compliance_met", "customer"],
        ["summary", "neutral_fact", "customer"],
      ]
    );
    assert.equal(isConfirmedRiskFinding(normalized[0]!), true);
    assert.equal(isConfirmedRiskFinding(normalized[1]!), false);
    assert.equal(isProtectiveFinding(normalized[1]!), true);
  });

  it("a high-severity protective control cannot inflate a compliant row's materiality", () => {
    const compliance = finding({
      findingId: "compliance",
      kind: "compliance",
      polarity: "compliance_met",
      judgement: {
        compliance: "present",
        evidenceState: "direct",
        referenceBinding: "none",
        evidenceConfidence: "high",
        materiality: "low",
        nli: "entailed",
        recommendationKind: "none",
      },
    });
    const control = finding({
      findingId: "control",
      polarity: "control_present",
      severity: "high",
      judgement: {
        compliance: "present",
        evidenceState: "direct",
        referenceBinding: "none",
        evidenceConfidence: "high",
        materiality: "high",
        nli: "entailed",
        recommendationKind: "none",
      },
    });
    assert.equal(deriveRequirementJudgement([compliance, control]).materiality, "low");
  });

  it("a related-only risk cannot enter the primary risk lane", () => {
    const relatedRisk = finding({
      kind: "risk",
      status: "present",
      polarity: "risk_present",
      relatedNotRequested: true,
    });

    assert.equal(isConfirmedRiskFinding(relatedRisk), false);
  });
});
