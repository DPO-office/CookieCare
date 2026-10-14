import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { segmentDocument, resolveSpan } from "../src/modules/analysis/segmentation/segment-document.js";
import {
  isClauseTaxonomyId,
  CLAUSE_TAXONOMY_VERSION,
} from "../src/modules/analysis/taxonomies/clause-taxonomy.js";
import {
  isRiskTaxonomyId,
  RISK_TAXONOMY_VERSION,
} from "../src/modules/analysis/taxonomies/index.js";
import {
  nextPhaseAfterPlan,
  nextPhaseAfterAct,
  nextPhaseAfterCritique,
} from "../src/modules/analysis/pac/transitions.js";
import { initAgentRunState } from "../src/modules/analysis/pac/types.js";
import { isOutOfScope } from "../src/modules/analysis/pac/policy.js";
import type { AnalysisState } from "../src/modules/analysis/models/analysis-state.js";
import type { CritiqueReport } from "../src/modules/analysis/models/critique-report.js";
import { heuristicClassify, LEGAL_ADVICE_RE } from "../src/modules/analysis/capabilities/plan/intent-heuristics.js";
import { buildActGraph } from "../src/modules/analysis/skills/runtime/graph/build-act-graph.js";
import { getSkillById } from "../src/modules/analysis/skills/runtime/catalog/registry.js";
import {
  LEGAL_ADVICE_DECLINE_MESSAGE,
  type IntentClassification,
} from "../src/modules/analysis/models/intent.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(
    join(
      __dirname,
      "../src/modules/analysis/eval/fixtures/short-msa-risk.json"
    ),
    "utf8"
  )
);

function baseState(overrides: Partial<AnalysisState> = {}): AnalysisState {
  return {
    agent: initAgentRunState("CREATE"),
    request: {
      sessionId: "an_test",
      instruction: fixture.instruction,
      documentIds: ["doc_golden"],
      documentTexts: { doc_golden: fixture.document },
      documentTitles: { doc_golden: fixture.title },
    },
    workspace: { sessionId: "an_test", documents: [] },
    findings: [],
    draftTasks: [],
    metadata: {
      timestamp: new Date().toISOString(),
      clauseTaxonomyVersion: CLAUSE_TAXONOMY_VERSION,
      riskTaxonomyVersion: RISK_TAXONOMY_VERSION,
    },
    ...overrides,
  };
}

test("taxonomy versions are pinned and closed", () => {
  assert.equal(CLAUSE_TAXONOMY_VERSION, "1.2.0");
  assert.equal(RISK_TAXONOMY_VERSION, "1.1.0");
  assert.equal(isClauseTaxonomyId("indemnity"), true);
  assert.equal(isClauseTaxonomyId("made_up_clause"), false);
  assert.equal(isRiskTaxonomyId("missing_limitation_of_liability"), true);
  assert.equal(isRiskTaxonomyId("invented_risk"), false);
});

test("segmentDocument produces stable locators with charRange", () => {
  const doc = segmentDocument("doc_golden", fixture.document, { title: fixture.title });
  assert.ok(doc.segments.length > 0);
  const clauseSeg = doc.segments.find((s) => s.kind === "clause");
  assert.ok(clauseSeg, "expected numbered clause segment");
  assert.match(clauseSeg!.locator.structuralPath, /^clause-/);
  const [start, end] = clauseSeg!.locator.charRange;
  assert.ok(end > start);
  const resolved = resolveSpan(doc, clauseSeg!.locator);
  assert.ok(resolved && resolved.includes(clauseSeg!.text.slice(0, 10)));
});

test("heuristicClassify maps risk instruction to risk_flag", () => {
  const raw = heuristicClassify(fixture.instruction);
  assert.equal(raw.operation, fixture.expectedOperation);
  assert.ok(raw.confidence.operation >= 0.7);
});

test("legal-advice heuristic path is out_of_scope via regex gate", () => {
  assert.ok(LEGAL_ADVICE_RE.test("Should I sign this contract?"));
  assert.ok(LEGAL_ADVICE_DECLINE_MESSAGE.includes("does not provide legal advice"));
});

test("PLAN → DONE when out_of_scope", () => {
  const intent: IntentClassification = {
    scope: "whole_document",
    operation: "out_of_scope",
    standard: "none",
    outputForm: "memo",
    compound: false,
    subIntents: [],
    requirements: [],
    confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
    outOfScopeReason: LEGAL_ADVICE_DECLINE_MESSAGE,
  };
  const state = baseState({
    intent,
    declineMessage: LEGAL_ADVICE_DECLINE_MESSAGE,
    plan: {
      intent,
      workUnits: [],
      missingClarifications: [],
      outputForm: "memo",
      rendererSchemaId: "memo",
      pinnedVersions: {
        clauseTaxonomyVersion: CLAUSE_TAXONOMY_VERSION,
        riskTaxonomyVersion: RISK_TAXONOMY_VERSION,
      },
    },
  });
  assert.equal(isOutOfScope(state), true);
  assert.equal(nextPhaseAfterPlan(state), "DONE");
});

test("risk_flag produces a skill-scoped ACT graph", () => {
  const intent: IntentClassification = {
    scope: "whole_document",
    operation: "risk_flag",
    standard: "none",
    outputForm: "checklist",
    compound: false,
    subIntents: [],
    requirements: [],
    confidence: { scope: 0.9, operation: 0.9, standard: 0.9, outputForm: 0.9 },
  };
  const skill = getSkillById("general-review")!;
  assert.ok(skill);
  const workUnits = buildActGraph({ docId: "doc_golden", instruction: fixture.instruction, skills: [skill], intent });
  const tools = workUnits.map((u) => u.tool);
  assert.ok(tools.length >= 2);
  assert.ok(
    tools.includes("extract_clauses") ||
      tools.includes("flag_risk") ||
      tools.includes("evaluate_package") ||
      tools.includes("check_expected_clauses")
  );
  assert.ok(tools.includes("render_output"));
});

test("ACT → DONE for lite; CRITIQUE always exits DONE", () => {
  const state = baseState();
  assert.equal(nextPhaseAfterAct(state), "DONE");
  const deep = baseState({
    analysisProfile: {
      thinkingMode: "deep",
      maxTurns: 1,
      enableDeepCritique: false,
      maxTier2Attempts: 0,
      maxReplans: 0,
      thinkingByTask: {},
      critiqueUsesProChecklist: true,
      synthesisCeilingFactor: 1.75,
      synthesisHardCap: 6400,
      evidenceCharBudget: 8000,
      verifyCandidateCap: 10,
      selectedVerifyCandidateCap: 4,
      verifyRequirementConcurrency: 2,
      verifyCandidateTimeoutMs: 90_000,
      verifySkipSupportingPriority: false,
    },
  });
  assert.equal(nextPhaseAfterAct(deep), "AUDIT");
  const green: CritiqueReport = {
    isGreen: true,
    iteration: 1,
    results: [],
    fixPlan: [],
    skeletonMismatch: false,
  };
  assert.equal(nextPhaseAfterCritique(state, green), "DONE");
});

test("CRITIQUE → DONE when allUnitsTerminal even if isGreen is false", () => {
  const state = baseState();
  const terminal: CritiqueReport = {
    isGreen: false,
    allUnitsTerminal: true,
    iteration: 2,
    results: [],
    fixPlan: [],
    skeletonMismatch: false,
  };
  assert.equal(nextPhaseAfterCritique(state, terminal), "DONE");
});

test("golden fixture expects missing LoL as absent category", () => {
  assert.ok(
    fixture.expectedAbsentCategories.includes("missing_limitation_of_liability")
  );
  // Document text must not contain a limitation of liability heading
  assert.equal(
    /limitation of liability/i.test(fixture.document),
    false,
    "fixture must omit LoL clause for absent_expected regression"
  );
  assert.match(fixture.document, /Customer shall indemnify/i);
});
