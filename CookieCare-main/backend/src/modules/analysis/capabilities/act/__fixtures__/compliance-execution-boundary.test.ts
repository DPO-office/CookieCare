import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { Finding } from "../../../models/finding.js";
import type { RequirementAssessment } from "../../../models/requirement-assessment.js";
import { aggregateRequirements } from "../aggregate-requirements.js";
import { deriveRequirementJudgement } from "../requirement-status-policy.js";
import { complianceRetrievalQuery } from "../evaluate-package.js";
import {
  filterCandidatesByEvidenceScope,
  inferEvidenceRelationshipScope,
} from "../select-candidates.js";
import { assessmentTableMarkdown } from "../../reporting/render-output.js";
import { deterministicFactRollup } from "../../../prompts/analytical-synthesis.js";
import { gdprSkill } from "../../../__test-helpers__/package-graph-fixtures.js";

describe("compliance evidence and execution boundary", () => {
  it("excludes an explicitly controller-to-controller section from a processor package", () => {
    const controllerSection = {
      ref: "S1",
      clauseType: "Data retention",
      quotedText: "Each party retains personal data for its own business purposes.",
      structuralPath: "clause-4.4.5",
      charRange: [0, 70] as [number, number],
      relationshipScope: inferEvidenceRelationshipScope({
        contextHeading: "Controller to Controller Terms",
        text: "Each party acts as an independent controller for its own business purposes.",
      }),
    };
    const processorSection = {
      ref: "S2",
      clauseType: "Roles",
      quotedText: "Supplier processes personal data on behalf of Customer.",
      structuralPath: "clause-3.3",
      charRange: [71, 130] as [number, number],
      relationshipScope: inferEvidenceRelationshipScope({
        contextHeading: "Controller to Processor Terms",
        text: "Supplier processes personal data on behalf of Customer.",
      }),
    };
    const unknownSection = {
      ref: "S3",
      clauseType: "Audit",
      quotedText: "The customer may conduct an audit.",
      structuralPath: "clause-9",
      charRange: [131, 170] as [number, number],
      relationshipScope: "unspecified" as const,
    };

    const filtered = filterCandidatesByEvidenceScope(
      [controllerSection, processorSection, unknownSection],
      { relationshipScopes: ["controller_to_processor"] }
    );
    assert.deepEqual(filtered.map(({ ref }) => ref), ["S2", "S3"]);
  });

  it("authors the Article 28 scope in skill data rather than the generic handler", () => {
    const packages = gdprSkill().evidencePackages ?? [];
    for (const id of [
      "gdpr.art28.particulars",
      "gdpr.art28.3.mandatory_clauses",
    ]) {
      const pkg = packages.find((candidate) => candidate.id === id);
      assert.deepEqual(pkg?.evidenceScope?.relationshipScopes, [
        "controller_to_processor",
      ]);
    }
  });

  it("retrieves with positive evidence language rather than proof-standard traps", () => {
    const query = complianceRetrievalQuery("The contract states the processing term.", {
      evidenceHints: ["duration", "end of services"],
      proofStandard:
        "A deletion deadline does not by itself prove the duration of processing.",
    });
    assert.equal(
      query,
      "The contract states the processing term. duration. end of services"
    );
    assert.doesNotMatch(query, /deletion deadline/i);
  });

  it("preserves a verified partial child when covered siblings are aggregated", () => {
    const base: Finding = {
      findingId: "f_present",
      kind: "compliance",
      category: "processor_terms",
      status: "present",
      claim: "One obligation is fully covered.",
      evidence: [],
      taxonomyVersion: "test",
      verifiedByProposition: true,
      judgement: {
        compliance: "present",
        evidenceState: "direct",
        referenceBinding: "none",
        evidenceConfidence: "high",
        materiality: "low",
        nli: "entailed",
        recommendationKind: "none",
      },
    };
    const partial: Finding = {
      ...base,
      findingId: "f_partial",
      claim: "Another obligation is only partly covered.",
      judgement: {
        ...base.judgement!,
        compliance: "partial",
        evidenceConfidence: "medium",
        materiality: "medium",
        recommendationKind: "clarify",
      },
    };
    assert.equal(
      deriveRequirementJudgement([base, partial]).compliance,
      "partial"
    );
  });

  it("uses an explicit partial label only for compliance reports", () => {
    const assessment: RequirementAssessment = {
      requirementId: "test.partial",
      supportingFindingIds: [],
      summary: "The clause establishes only part of the requirement.",
      status: "conditional",
      judgement: {
        compliance: "partial",
        evidenceState: "direct",
        referenceBinding: "none",
        evidenceConfidence: "medium",
        materiality: "medium",
        recommendationKind: "clarify",
      },
    };
    const complianceTable = assessmentTableMarkdown(
      [assessment],
      [],
      { intent: { operation: "compliance_check" } } as unknown as AnalysisState
    );
    assert.match(complianceTable, /Partially covered/i);

    const legacyTable = assessmentTableMarkdown([assessment], []);
    assert.match(legacyTable, /Minor drafting gap/i);
    assert.doesNotMatch(legacyTable, /Partially covered/i);
  });

  it("keeps a verifier timeout operational instead of presenting it as a contract gap", () => {
    const finding: Finding = {
      findingId: "f_timeout",
      kind: "compliance",
      category: "processor_terms",
      status: "insufficient_evidence",
      claim: "Candidate verification did not complete.",
      evidence: [],
      taxonomyVersion: "test",
      requirementId: "test.requirement",
      analysisExecution: {
        status: "timed_out",
        detail: "Verification exceeded the configured limit.",
      },
    };
    const result = aggregateRequirements(
      { findings: [finding] } as unknown as AnalysisState,
      { workUnitId: "wu-aggregate", input: {} } as never,
      [finding]
    );
    const assessment = result.state.requirementAssessments?.[0];
    assert.equal(assessment?.analysisExecution?.status, "timed_out");
    assert.match(assessment?.summary ?? "", /Analysis incomplete/i);
    assert.match(assessment?.recommendation ?? "", /Retry this requirement/i);

    const table = assessmentTableMarkdown([assessment!], [finding]);
    assert.match(table, /Analysis incomplete \(timed out\)/i);
    assert.match(table, /no document conclusion was reached/i);
    assert.match(table, /do not treat this as a contractual gap/i);
    assert.doesNotMatch(table, /Obtain the referenced schedule/i);
  });

  it("does not change legacy status wording when no execution failure is stamped", () => {
    const assessment: RequirementAssessment = {
      requirementId: "ordinary.question",
      supportingFindingIds: [],
      summary: "The available evidence is insufficient.",
      status: "cannot_determine",
      judgement: {
        compliance: "insufficient_evidence",
        evidenceState: "not_found",
        referenceBinding: "none",
        evidenceConfidence: "low",
        materiality: "medium",
        recommendationKind: "obtain",
      },
    };
    const table = assessmentTableMarkdown([assessment], []);
    assert.match(table, /Insufficient data/i);
    assert.doesNotMatch(table, /Analysis incomplete/i);
  });

  it("separates incomplete execution from insufficient document evidence in rollups", () => {
    const assessment: RequirementAssessment = {
      requirementId: "test.requirement",
      supportingFindingIds: [],
      summary: "Analysis incomplete.",
      status: "cannot_determine",
      analysisExecution: { status: "timed_out" },
      judgement: {
        compliance: "insufficient_evidence",
        evidenceState: "unavailable",
        referenceBinding: "none",
        evidenceConfidence: "low",
        materiality: "medium",
        recommendationKind: "confirm",
      },
    };
    const rollup = deterministicFactRollup([assessment]);
    assert.match(rollup, /0 Insufficient evidence, 1 Analysis incomplete/i);
    assert.match(rollup, /Analysis incomplete \(timed out\)/i);
  });
});
