process.env.GOOGLE_CLOUD_PROJECT ??= "critique-redesign-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { CritiqueResult } from "../../models/critique-report.js";
import type { Finding } from "../../models/finding.js";
import { initAgentRunState } from "../../pac/types.js";
import { nextPhaseAfterCritique } from "../../pac/transitions.js";
import { classifyFailureReason } from "../../capabilities/critique/classify-failure-reason.js";
import { formatFeedback } from "../../capabilities/critique/format-feedback.js";
import {
  hasAuthoredContent,
  targetIdForUnit,
} from "../../capabilities/critique/has-authored-content.js";
import { hashFindingsForUnit } from "../../capabilities/critique/output-hash.js";
import { getSkillById, resetSkillRegistryForTests } from "../registry.js";

const {
  markBudgetExhaustedOutcomes,
  MAX_TIER2_ATTEMPTS,
  resolveWorkUnits,
} = await import("../../capabilities/critique/resolve-work-unit.js");
const { buildRightsMatrixMemoDocument } = await import(
  "../../capabilities/act/render-output.js"
);

function baseState(overrides: Partial<AnalysisState> = {}): AnalysisState {
  return {
    agent: initAgentRunState("CREATE"),
    request: {
      sessionId: "critique_test",
      instruction: "Check GDPR Article 99",
      documentIds: ["doc1"],
      documentTexts: { doc1: "Sample agreement text." },
    },
    workspace: { sessionId: "critique_test", documents: [] },
    findings: [],
    draftTasks: [],
    metadata: {
      timestamp: new Date().toISOString(),
      clauseTaxonomyVersion: "1.2.0",
      riskTaxonomyVersion: "1.1.0",
    },
    activeSkills: [],
    activeSkillIds: [],
    ...overrides,
  };
}

function workUnit(overrides: Partial<AnalysisWorkUnit> = {}): AnalysisWorkUnit {
  return {
    workUnitId: "wu-rule-gdpr-art99",
    tool: "check_against_rule",
    input: { ruleId: "gdpr.art99.1", docId: "doc1" },
    dependsOn: [],
    outputSchema: "Finding[]",
    status: "done",
    ...overrides,
  };
}

describe("critique redesign", () => {
  it("hasAuthoredContent returns false for unauthored rule targets", () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    assert.equal(hasAuthoredContent("gdpr.art99.1", [gdpr]), false);
    assert.equal(hasAuthoredContent("gdpr.art12.3", [gdpr]), true);
  });

  it("classifies not_authored when regime finding is missing for unauthored rule", () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const unit = workUnit();
    const reason = classifyFailureReason({
      unit,
      unitResults: [
        {
          itemId: "regime:gdpr.art99.1",
          status: "missing",
          evidenceVerified: false,
          workUnitId: unit.workUnitId,
          detail: "No compliance finding for rule gdpr.art99.1",
        },
      ],
      skills: [gdpr],
    });
    assert.equal(reason.kind, "not_authored");
  });

  it("classifies verification_rejected for weak entailment on authored rules", () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const unit = workUnit({
      workUnitId: "wu-rule-gdpr-art12-3",
      input: { ruleId: "gdpr.art12.3", docId: "doc1" },
    });
    const reason = classifyFailureReason({
      unit,
      unitResults: [
        {
          itemId: "entail:f1",
          status: "fail",
          evidenceVerified: false,
          workUnitId: unit.workUnitId,
          detail: "Quote does not support the claim",
        },
      ],
      skills: [gdpr],
    });
    assert.equal(reason.kind, "verification_rejected");
    const feedback = formatFeedback(reason);
    assert.match(feedback, /Previous attempt was rejected/);
  });

  it("resolveWorkUnits emits not_covered with zero tier-2 retries when not authored", async () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const unit = workUnit();
    const state = baseState({
      activeSkills: [gdpr],
      activeSkillIds: [gdpr.skillId],
      plan: {
        intent: {
          scope: "whole_document",
          operation: "compliance_check",
          standard: "regime_pack:gdpr",
          outputForm: "memo",
          compound: false,
          subIntents: [],
          confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
        },
        workUnits: [unit],
        missingClarifications: [],
        outputForm: "memo",
        rendererSchemaId: "rights_matrix_memo",
        pinnedVersions: {
          clauseTaxonomyVersion: "1.2.0",
          riskTaxonomyVersion: "1.1.0",
        },
      },
      tierCCache: {
        "gdpr.art99.1": {
          reliable: false,
          claim: "No reliable web source",
        },
      },
    });
    const results: CritiqueResult[] = [
      {
        itemId: "regime:gdpr.art99.1",
        status: "missing",
        evidenceVerified: false,
        workUnitId: unit.workUnitId,
      },
    ];
    const { state: next, resolved } = await resolveWorkUnits(state, results, [
      {
        workUnitId: unit.workUnitId,
        instruction: "Evaluate rule gdpr.art99.1",
        sourceItemId: "regime:gdpr.art99.1",
      },
    ]);
    assert.equal(resolved.fixPlan.length, 0);
    assert.equal(resolved.allUnitsTerminal, true);
    const outcome = resolved.outcomes[0];
    assert.equal(outcome?.terminalStatus, "not_covered");
    assert.equal(outcome?.attempts.length, 1);
    const notCovered = next.findings.find((f) => f.status === "not_covered");
    assert.ok(notCovered);
    assert.match(notCovered!.claim, /not yet covered by an authored rule/i);
  });

  it("resolveWorkUnits attaches previousAttemptFeedback for tier-2 redo", async () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const unit = workUnit({
      workUnitId: "wu-rule-gdpr-art12-3",
      input: { ruleId: "gdpr.art12.3", docId: "doc1" },
    });
    const finding: Finding = {
      findingId: "f1",
      kind: "compliance",
      category: "response_timeframe_gap",
      status: "present",
      claim: "One month response",
      evidence: [{ locator: { docId: "doc1", structuralPath: "c1", charRange: [0, 10] }, quotedText: "month", sourceRole: "target" }],
      severity: "medium",
      taxonomyVersion: "1.1.0",
      workUnitId: unit.workUnitId,
      ruleId: "gdpr.art12.3",
    };
    const state = baseState({
      activeSkills: [gdpr],
      findings: [finding],
      plan: {
        intent: {
          scope: "whole_document",
          operation: "compliance_check",
          standard: "regime_pack:gdpr",
          outputForm: "memo",
          compound: false,
          subIntents: [],
          confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
        },
        workUnits: [unit],
        missingClarifications: [],
        outputForm: "memo",
        rendererSchemaId: "rights_matrix_memo",
        pinnedVersions: {
          clauseTaxonomyVersion: "1.2.0",
          riskTaxonomyVersion: "1.1.0",
        },
      },
    });
    const { resolved } = await resolveWorkUnits(
      state,
      [
        {
          itemId: "entail:f1",
          status: "fail",
          evidenceVerified: false,
          workUnitId: unit.workUnitId,
          detail: "Evidence does not entail claim",
        },
      ],
      [
        {
          workUnitId: unit.workUnitId,
          instruction: "Re-verify entailment",
          sourceItemId: "f1",
        },
      ]
    );
    assert.equal(resolved.fixPlan.length, 1);
    assert.ok(resolved.fixPlan[0]?.previousAttemptFeedback);
    assert.match(resolved.fixPlan[0]!.previousAttemptFeedback!, /Previous attempt was rejected/);
  });

  it("stops at retries_exhausted when outputHash repeats", async () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const unit = workUnit({
      workUnitId: "wu-rule-gdpr-art12-3",
      input: { ruleId: "gdpr.art12.3", docId: "doc1" },
    });
    const finding: Finding = {
      findingId: "f1",
      kind: "compliance",
      category: "response_timeframe_gap",
      status: "present",
      claim: "One month response",
      evidence: [{ locator: { docId: "doc1", structuralPath: "c1", charRange: [0, 10] }, quotedText: "month", sourceRole: "target" }],
      severity: "medium",
      taxonomyVersion: "1.1.0",
      workUnitId: unit.workUnitId,
      ruleId: "gdpr.art12.3",
    };
    const hash = hashFindingsForUnit([finding], unit.workUnitId);
    const state = baseState({
      activeSkills: [gdpr],
      findings: [finding],
      plan: {
        intent: {
          scope: "whole_document",
          operation: "compliance_check",
          standard: "regime_pack:gdpr",
          outputForm: "memo",
          compound: false,
          subIntents: [],
          confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
        },
        workUnits: [unit],
        missingClarifications: [],
        outputForm: "memo",
        rendererSchemaId: "rights_matrix_memo",
        pinnedVersions: {
          clauseTaxonomyVersion: "1.2.0",
          riskTaxonomyVersion: "1.1.0",
        },
      },
      workUnitOutcomes: {
        [unit.workUnitId]: {
          workUnitId: unit.workUnitId,
          attempts: [
            {
              attemptNumber: 1,
              outcome: "rejected",
              outputHash: hash,
              rejectionReason: "first",
            },
          ],
        },
      },
    });
    const { resolved } = await resolveWorkUnits(
      state,
      [
        {
          itemId: "entail:f1",
          status: "fail",
          evidenceVerified: false,
          workUnitId: unit.workUnitId,
          detail: "Same reasoning again",
        },
      ],
      [
        {
          workUnitId: unit.workUnitId,
          instruction: "Retry",
          sourceItemId: "f1",
        },
      ]
    );
    assert.equal(resolved.fixPlan.length, 0);
    assert.equal(resolved.outcomes[0]?.terminalStatus, "retries_exhausted");
  });

  it("markBudgetExhaustedOutcomes tags open units", () => {
    const unit = workUnit();
    const state = baseState({
      plan: {
        intent: {
          scope: "whole_document",
          operation: "compliance_check",
          standard: "regime_pack:gdpr",
          outputForm: "memo",
          compound: false,
          subIntents: [],
          confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
        },
        workUnits: [unit],
        missingClarifications: [],
        outputForm: "memo",
        rendererSchemaId: "rights_matrix_memo",
        pinnedVersions: {
          clauseTaxonomyVersion: "1.2.0",
          riskTaxonomyVersion: "1.1.0",
        },
      },
      workUnitOutcomes: {
        [unit.workUnitId]: {
          workUnitId: unit.workUnitId,
          attempts: [],
        },
      },
    });
    const next = markBudgetExhaustedOutcomes(state);
    assert.equal(
      next.workUnitOutcomes?.[unit.workUnitId]?.terminalStatus,
      "retries_exhausted"
    );
    assert.equal(
      next.workUnitOutcomes?.[unit.workUnitId]?.failureReason?.kind,
      "tool_execution_error"
    );
  });

  it("nextPhaseAfterCritique stops when allUnitsTerminal even if not green", () => {
    const state = baseState();
    assert.equal(
      nextPhaseAfterCritique(state, {
        isGreen: false,
        allUnitsTerminal: true,
        iteration: 1,
        results: [],
        fixPlan: [],
        skeletonMismatch: false,
      }),
      "DONE"
    );
  });

  it("render distinguishes not_covered from insufficient_evidence in matrix", () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const state = baseState({
      activeSkills: [gdpr],
      activeSkillIds: [gdpr.skillId],
    });
    const insufficient: Finding = {
      findingId: "insufficient",
      kind: "compliance",
      category: "automated_decision_gap",
      status: "insufficient_evidence",
      claim: "Cannot confirm Art 22 applicability.",
      evidence: [],
      severity: "medium",
      taxonomyVersion: "1.1.0",
      matrixRowId: "gdpr.right.automated_decisions",
      visibility: "user_facing",
      ruleSourceTier: "B",
    };
    const notCovered: Finding = {
      findingId: "not-covered",
      kind: "compliance",
      category: "automated_decision_gap",
      status: "not_covered",
      claim: "Article 99 could not be evaluated — not yet covered by an authored rule.",
      evidence: [],
      severity: "medium",
      taxonomyVersion: "1.1.0",
      matrixRowId: "gdpr.right.portability",
      visibility: "user_facing",
      ruleSourceTier: "B",
    };
    const memoInsufficient = buildRightsMatrixMemoDocument(state, [insufficient], "");
    const memoNotCovered = buildRightsMatrixMemoDocument(state, [notCovered], "");
    assert.match(memoInsufficient, /Insufficient evidence/);
    assert.doesNotMatch(memoInsufficient, /Not yet supported/);
    assert.match(memoNotCovered, /Not yet supported/);
    assert.match(memoNotCovered, /Coverage limitations/);
  });

  it("MAX_TIER2_ATTEMPTS allows two retries after first attempt", () => {
    assert.equal(MAX_TIER2_ATTEMPTS, 2);
    assert.equal(targetIdForUnit(workUnit()), "gdpr.art99.1");
  });
});
