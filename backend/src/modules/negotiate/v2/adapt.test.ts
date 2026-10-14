/**
 * Unit tests for finalize (critic application, degradation, L/N/P, confidence)
 * and markup mapping — pure, no LLM.
 *   node --import tsx --test backend/src/modules/negotiate/v2/adapt.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { finalizeFindings, toNegotiateMarkup } from "./adapt.js";
import type { MergedCandidate } from "./merge.js";
import type { CriticOutcome } from "./critic.js";
import { emptyFactors, CriticVerdict } from "./types.js";

const DOC = "Processor may process User Personal Data in Russian Federation. The objection is by reasonable efforts only.";

function mc(p: Partial<MergedCandidate>): MergedCandidate {
  return {
    source: "spotting", issueTag: "x", isAbsence: false, clauseRefs: ["c1"],
    evidence: [{ clauseRef: "c1", quote: "process User Personal Data in Russian Federation", charOffset: DOC.indexOf("process User") }],
    reasoning: "r", factors: emptyFactors(), members: [], duplicateOfRefs: [], votes: 3, ofRuns: 3, ...p,
  };
}
function crit(available: boolean, verdicts: Record<number, Partial<CriticVerdict>>): CriticOutcome {
  const m = new Map<number, CriticVerdict>();
  for (const [k, v] of Object.entries(verdicts))
    m.set(Number(k), { verdict: "keep", marketStandard: false, inScope: true, negotiable: true, reason: "", ...v });
  return { criticAvailable: available, verdicts: m, llmCalls: available ? 1 : 1 };
}

test("critic unavailable → findings KEPT but UNVERIFIED, confidence tentative, no aggressive drops", () => {
  const c = mc({ factors: { ...emptyFactors(), internationalTransferRisk: true } });
  const { findings } = finalizeFindings([c], crit(false, {}), DOC);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].verified, false);
  assert.equal(findings[0].confidence, "tentative");
  assert.ok(findings[0].confidenceSignals.includes("UNVERIFIED"));
  assert.equal(findings[0].riskLevel, "RED"); // deterministic severity still applied
});

test("critic drop on a non-must-catch candidate → dropped", () => {
  const c = mc({});
  const { findings, droppedCount } = finalizeFindings([c], crit(true, { 0: { verdict: "drop" } }), DOC);
  assert.equal(findings.length, 0);
  assert.equal(droppedCount, 1);
});

test("critic drop on a MUST-CATCH candidate → kept as minor, never dropped", () => {
  const c = mc({ mustCatchRule: true, isAbsence: true, evidence: [], issueTag: "missing_liability_cap" });
  const { findings } = finalizeFindings([c], crit(true, { 0: { verdict: "drop" } }), DOC);
  assert.equal(findings.length, 1, "must-catch survives a critic drop");
  assert.equal(findings[0].tier, "minor");
});

test("evidence hallucination guard: non-absence with no verbatim evidence is dropped (unless must-catch)", () => {
  const bad = mc({ evidence: [{ clauseRef: "c1", quote: "THIS TEXT IS NOT IN THE DOCUMENT", charOffset: -1 }] });
  const { findings, droppedCount } = finalizeFindings([bad], crit(true, { 0: { verdict: "keep" } }), DOC);
  assert.equal(findings.length, 0);
  assert.equal(droppedCount, 1);
});

test("critic market-standard flag forces GREEN + minor (trap suppression)", () => {
  const c = mc({ factors: { ...emptyFactors(), unilateralOrOneSidedRight: true } });
  const { findings } = finalizeFindings([c], crit(true, { 0: { verdict: "minor", marketStandard: true } }), DOC);
  assert.equal(findings[0].riskLevel, "GREEN");
  assert.equal(findings[0].tier, "minor");
});

test("verified + rubric-backed + full votes → strong confidence", () => {
  const c = mc({ ruleId: "neg.x", isAbsence: true, evidence: [], mustCatchRule: true });
  const { findings } = finalizeFindings([c], crit(true, { 0: { verdict: "keep" } }), DOC);
  assert.equal(findings[0].confidence, "strong");
});

test("toNegotiateMarkup keeps V1 shape + additive v2 block; clauseId = clauseRef", () => {
  const c = mc({ clauseRefs: ["c_abc"], factors: { ...emptyFactors(), internationalTransferRisk: true } });
  const { findings } = finalizeFindings([c], crit(true, { 0: { verdict: "keep" } }), DOC);
  const m = toNegotiateMarkup(findings[0]);
  for (const k of ["clauseId", "original", "replacement", "reasoning", "riskLevel", "clauseType", "charOffset", "matchedPlaybookTopic"])
    assert.ok(k in m, `markup must have V1 field ${k}`);
  assert.equal(m.clauseId, "c_abc");
  assert.equal(m.matchedPlaybookTopic, null);
  assert.ok(m.v2 && typeof m.v2 === "object" && "priorityScore" in m.v2);
});
