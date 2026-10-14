import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextPhaseAfterAct,
  nextPhaseAfterAsk,
  nextPhaseAfterCritique,
  nextPhaseAfterPlan,
} from "../src/modules/drafting/pac/transitions.js";
import { initAgentRunState } from "../src/modules/drafting/pac/types.js";
import type { DraftState } from "../src/modules/drafting/models/draft-state.js";
import type { CritiqueReport } from "../src/modules/drafting/models/critique-report.js";

function baseState(overrides: Partial<DraftState> = {}): DraftState {
  return {
    agent: initAgentRunState("CREATE"),
    request: { intent: "CREATE", rawInstructions: "Draft a DPA" },
    requirements: null,
    retrieval: {
      matchedTemplate: null,
      applicablePlaybookRules: [],
      fallbackClauses: [],
      historicalReferences: [],
    },
    context: null,
    draft: null,
    validation: null,
    riskReview: null,
    metadata: {
      generationParameters: {},
      playbookVersion: "1.0.0",
      timestamp: new Date().toISOString(),
    },
    ...overrides,
  };
}

test("PLAN → ASK when critical gap present", () => {
  const state = baseState({
    plan: {
      documentType: "dpa",
      packId: "dpa",
      title: "DPA",
      workUnits: [],
      structuredFacts: {},
      missingFacts: [
        {
          field: "governingLaw",
          question: "Governing law?",
          severity: "critical",
        },
      ],
      applicableRegimes: [],
      mandatoryChecklist: [],
      loadedSkillPaths: [],
      selectedClauseIds: [],
      negotiationPositions: [],
      glossary: {},
    },
  });
  assert.equal(nextPhaseAfterPlan(state), "ASK");
});

test("PLAN → ACT when no critical gap", () => {
  const state = baseState({
    plan: {
      documentType: "dpa",
      packId: "dpa",
      title: "DPA",
      workUnits: [],
      structuredFacts: { governingLaw: "Ireland" },
      missingFacts: [],
      applicableRegimes: [],
      mandatoryChecklist: [],
      loadedSkillPaths: [],
      selectedClauseIds: [],
      negotiationPositions: [],
      glossary: {},
    },
  });
  assert.equal(nextPhaseAfterPlan(state), "ACT");
});

test("ASK → PLAN when user submits answers", () => {
  const state = baseState();
  assert.equal(nextPhaseAfterAsk(state, true), "PLAN");
});

test("ASK stays paused when no answers", () => {
  const state = baseState({
    agent: initAgentRunState("CREATE", { askRounds: 2, maxAskRounds: 2, openQuestions: [{ id: "1", field: "x", question: "?", severity: "critical" }] }),
  });
  assert.equal(nextPhaseAfterAsk(state, false), "STAY_PAUSED");
});

test("ACT → CRITIQUE", () => {
  assert.equal(nextPhaseAfterAct(baseState()), "CRITIQUE");
});

test("CRITIQUE → DONE when green", () => {
  const critique: CritiqueReport = {
    isGreen: true,
    iteration: 1,
    results: [],
    fixPlan: [],
    skeletonMismatch: false,
  };
  assert.equal(nextPhaseAfterCritique(baseState(), critique), "DONE");
});

test("CRITIQUE → PLAN on skeleton mismatch", () => {
  const critique: CritiqueReport = {
    isGreen: false,
    iteration: 1,
    results: [],
    fixPlan: [],
    skeletonMismatch: true,
  };
  assert.equal(nextPhaseAfterCritique(baseState(), critique), "PLAN");
});

test("CRITIQUE → ACT for targeted fix", () => {
  const critique: CritiqueReport = {
    isGreen: false,
    iteration: 1,
    results: [{ itemId: "x", status: "fail", evidenceVerified: false }],
    fixPlan: [{ workUnitId: "sec-security", instruction: "Add TOMs", sourceChecklistItemId: "dpa-security" }],
    skeletonMismatch: false,
  };
  assert.equal(nextPhaseAfterCritique(baseState(), critique), "ACT");
});

test("CRITIQUE → ASK when critical fact surfaced", () => {
  const critique: CritiqueReport = {
    isGreen: false,
    iteration: 1,
    results: [],
    fixPlan: [],
    skeletonMismatch: false,
    criticalFactSurfaced: true,
  };
  assert.equal(nextPhaseAfterCritique(baseState(), critique), "ASK");
});

test("budget / max turns → DONE from PLAN", () => {
  const state = baseState({
    agent: initAgentRunState("CREATE", { turn: 8, maxTurns: 8 }),
  });
  assert.equal(nextPhaseAfterPlan(state), "DONE");
});
