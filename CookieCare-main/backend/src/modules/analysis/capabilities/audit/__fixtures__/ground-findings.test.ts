process.env.GOOGLE_CLOUD_PROJECT ??= "ground-findings-audit-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { Finding } from "../../../models/finding.js";
import { groundFindings } from "../ground-findings.js";
import { nextPhaseAfterAct } from "../../../pac/transitions.js";
import { resolveAnalysisProfile } from "../../../pac/analysis-profile.js";
import { initAgentRunState } from "../../../pac/types.js";
import { RISK_TAXONOMY_VERSION } from "../../../taxonomies/index.js";

const SOURCE = "The processor shall encrypt personal data at rest and in transit.";

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    findingId: "f1",
    kind: "compliance",
    category: "other_known_risk",
    status: "present",
    claim: "Encryption is named.",
    evidence: [
      {
        locator: {
          docId: "doc1",
          structuralPath: "p1",
          charRange: [0, SOURCE.length],
        },
        quotedText: SOURCE,
        sourceRole: "target",
      },
    ],
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    requirementId: "art28_3_c_security",
    ...overrides,
  };
}

function state(findings: Finding[], extra: Partial<AnalysisState> = {}): AnalysisState {
  return {
    request: {
      sessionId: "audit",
      instruction: "Check processor terms",
      documentIds: ["doc1"],
      documentTexts: { doc1: SOURCE },
    },
    workspace: {
      sessionId: "audit",
      documents: [
        {
          docId: "doc1",
          role: "target",
          fullText: SOURCE,
          segments: [],
          clauses: [
            {
              clauseId: "c1",
              clauseType: "information_security",
              text: SOURCE,
              locator: {
                docId: "doc1",
                structuralPath: "p1",
                charRange: [0, SOURCE.length],
              },
              taxonomyVersion: "test",
            },
          ],
        },
      ],
    },
    findings,
    requirementAssessments: [
      {
        requirementId: "art28_3_c_security",
        supportingFindingIds: findings.map((f) => f.findingId),
        status: "adequate",
        summary: "Security is named.",
      },
    ],
    draftTasks: [],
    metadata: {
      timestamp: "",
      clauseTaxonomyVersion: "",
      riskTaxonomyVersion: RISK_TAXONOMY_VERSION,
    },
    ...extra,
  } as AnalysisState;
}

describe("grounding audit", () => {
  it("keeps a present finding whose quote appears in the source", () => {
    const next = groundFindings(state([finding()]));
    assert.equal(next.findings[0]?.status, "present");
    assert.equal(next.auditReport?.findingsChanged.length, 0);
  });

  it("downgrades a present finding whose quote is not in the source", () => {
    const next = groundFindings(
      state([
        finding({
          evidence: [
            {
              locator: {
                docId: "doc1",
                structuralPath: "missing",
                charRange: [0, 5],
              },
              quotedText: "this quote is not in the document at all",
              sourceRole: "target",
            },
          ],
        }),
      ])
    );
    assert.equal(next.findings[0]?.status, "insufficient_evidence");
    assert.equal(next.auditReport?.findingsChanged[0]?.reason, "quote_not_in_source");
  });

  it("ACT-Phase 9: does not re-check a verifiedByProposition finding's quote against the source", () => {
    // VERIFY already ran its own deterministic quoteAppearsIn check against
    // the exact candidate passage before ever setting status="present" —
    // re-running groundFindings' broader (looser) whole-document search is
    // redundant work, not a correctness gap: skip it for this class of
    // finding rather than "re-doing grounding work ACT should never have
    // skipped in the first place" (research doc §2.1).
    const next = groundFindings(
      state([
        finding({
          verifiedByProposition: true,
          evidence: [
            {
              locator: { docId: "doc1", structuralPath: "missing", charRange: [0, 5] },
              quotedText: "this quote is not in the document at all",
              sourceRole: "target",
            },
          ],
        }),
      ])
    );
    assert.equal(next.findings[0]?.status, "present");
    assert.equal(next.auditReport?.findingsChanged.length, 0);
  });

  it("still downgrades a non-verified finding's fabricated quote alongside a verified one", () => {
    const verified = finding({
      findingId: "f-verified",
      verifiedByProposition: true,
      evidence: [
        {
          locator: { docId: "doc1", structuralPath: "elsewhere", charRange: [0, 5] },
          quotedText: "not actually in the document",
          sourceRole: "target",
        },
      ],
    });
    const unverified = finding({
      findingId: "f-unverified",
      evidence: [
        {
          locator: { docId: "doc1", structuralPath: "elsewhere", charRange: [0, 5] },
          quotedText: "also not actually in the document",
          sourceRole: "target",
        },
      ],
    });
    const next = groundFindings(state([verified, unverified]));
    const verifiedResult = next.findings.find((f) => f.findingId === "f-verified");
    const unverifiedResult = next.findings.find((f) => f.findingId === "f-unverified");
    assert.equal(verifiedResult?.status, "present");
    assert.equal(unverifiedResult?.status, "insufficient_evidence");
  });

  it("downgrades matrix findings that lack matrixRowId", () => {
    const next = groundFindings(
      state([finding({ matrixAddressing: "named", matrixRowId: undefined })])
    );
    assert.equal(next.findings[0]?.status, "insufficient_evidence");
    assert.ok(
      next.auditReport?.findingsChanged.some((c) => c.reason === "matrix_missing_row_id")
    );
  });

  it("does not let 28(3)(a)-(h) share an identical quote", () => {
    const a = finding({
      findingId: "fa",
      requirementId: "art28_3_a_instructions",
    });
    const b = finding({
      findingId: "fb",
      requirementId: "art28_3_b_confidentiality",
    });
    const next = groundFindings(state([a, b]));
    const statuses = next.findings.map((f) => f.status);
    assert.ok(statuses.includes("present"));
    assert.ok(statuses.includes("insufficient_evidence"));
    assert.ok(
      next.auditReport?.findingsChanged.some((c) => c.reason === "duplicate_sibling_quote")
    );
  });

  it("downgrades covered-like assessments with no supporting present finding", () => {
    const next = groundFindings(
      state([finding({ status: "absent_expected", evidence: [] })])
    );
    const assessment = next.requirementAssessments?.find(
      (item) => item.requirementId === "art28_3_c_security"
    );
    assert.ok(assessment);
    assert.notEqual(assessment?.status, "adequate");
    assert.notEqual(assessment?.status, "strong");
    assert.notEqual(assessment?.status, "covered");
  });

  it("routes lite ACT to DONE and deep ACT to AUDIT", () => {
    const lite = {
      analysisProfile: resolveAnalysisProfile("lite"),
      agent: initAgentRunState("CREATE"),
      request: { thinkingMode: "lite" },
    } as AnalysisState;
    const deep = {
      analysisProfile: resolveAnalysisProfile("deep"),
      agent: initAgentRunState("CREATE"),
      request: { thinkingMode: "deep" },
    } as AnalysisState;
    assert.equal(nextPhaseAfterAct(lite), "DONE");
    assert.equal(nextPhaseAfterAct(deep), "AUDIT");
  });
});
