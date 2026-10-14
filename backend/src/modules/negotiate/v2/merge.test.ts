/**
 * Unit tests for merge/dedup + spotting helpers (pure).
 *   node --import tsx --test backend/src/modules/negotiate/v2/merge.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeCandidates, sameIssue, tagSimilar } from "./merge.js";
import { adaptiveK } from "./spotting.js";
import { Candidate, emptyFactors } from "./types.js";

function cand(p: Partial<Candidate>): Candidate {
  return { source: "spotting", issueTag: "x", isAbsence: false, clauseRefs: ["c1"], evidence: [], reasoning: "", factors: emptyFactors(), ...p };
}

test("structural + spotting on the SAME clause merge into one (a2+g3 case)", () => {
  const structural = cand({ source: "structural", ruleId: "neg.subprocessor_objection_has_teeth", issueTag: "dpa_subprocessor_gap", isAbsence: true, clauseRefs: ["c_74"], evidence: [{ clauseRef: "c_74", quote: "reasonable efforts", charOffset: 10 }], mustCatchRule: true });
  const spotting = cand({ source: "spotting", issueTag: "subprocessor_objection_window", clauseRefs: ["c_74"], evidence: [{ clauseRef: "c_74", quote: "five business days", charOffset: 40 }], votes: 3, ofRuns: 3 });
  const merged = mergeCandidates([structural, spotting]);
  assert.equal(merged.length, 1, "same clause → one merged finding");
  assert.equal(merged[0].source, "structural", "structural provides the headline framing");
  assert.equal(merged[0].isAbsence, true);
  assert.equal(merged[0].evidence.length, 2, "evidence unioned from both members");
  assert.equal(merged[0].mustCatchRule, true);
});

test("cross-location duplicate (same issueTag, different clauseRefs) merges (G-DPA-06)", () => {
  const body = cand({ issueTag: "breach_notice_no_deadline", clauseRefs: ["c_s4"], evidence: [{ clauseRef: "c_s4", quote: "without undue delay", charOffset: 5 }] });
  const annex = cand({ issueTag: "breach_notice_no_deadline", clauseRefs: ["c_annexB"], evidence: [{ clauseRef: "c_annexB", quote: "no specific deadline", charOffset: 90 }] });
  const merged = mergeCandidates([body, annex]);
  assert.equal(merged.length, 1, "same issueTag across locations → one finding");
  assert.ok(merged[0].duplicateOfRefs.includes("c_annexB") || merged[0].duplicateOfRefs.includes("c_s4"), "other location recorded in duplicateOfRefs");
  assert.equal(merged[0].evidence.length, 2);
});

test("distinct issues on the SAME clause do NOT over-merge", () => {
  const a = cand({ issueTag: "governing_law_foreign", clauseRefs: ["c_12"] });
  const b = cand({ issueTag: "audit_cost_barrier", clauseRefs: ["c_12"] });
  const merged = mergeCandidates([a, b]);
  assert.equal(merged.length, 2, "same clause but unrelated tags stay separate");
});

test("distinct clauses with different tags do NOT merge", () => {
  const a = cand({ issueTag: "unlimited_liability", clauseRefs: ["c_6"] });
  const b = cand({ issueTag: "foreign_governing_law", clauseRefs: ["c_8"] });
  assert.equal(mergeCandidates([a, b]).length, 2);
});

test("two structural rules with different ruleId (different topics) stay separate", () => {
  const a = cand({ source: "structural", ruleId: "r1", topic: "termination", clauseRefs: ["c1"] });
  const b = cand({ source: "structural", ruleId: "r2", topic: "governing_law", clauseRefs: ["c1"] });
  assert.equal(sameIssue(a, b), false);
  assert.equal(mergeCandidates([a, b]).length, 2);
});

test("two structural rules, same SPECIFIC topic, different ruleIds+locations → merge (sub-processor)", () => {
  const regime = cand({ source: "structural", ruleId: "dpa.subprocessor_flowdown_present", topic: "subprocessor_flow_down", issueTag: "dpa_subprocessor_gap", clauseRefs: ["c_s3"] });
  const expected = cand({ source: "structural", ruleId: "expected.subprocessor_flow_down", topic: "subprocessor_flow_down", issueTag: "other_known_risk", clauseRefs: ["c_annexA"] });
  assert.equal(sameIssue(regime, expected), true);
  assert.equal(mergeCandidates([regime, expected]).length, 1);
});

test("generic topic (data_protection) does NOT cross-merge distinct clauses", () => {
  const a = cand({ source: "structural", ruleId: "r1", topic: "data_protection", issueTag: "cat1", clauseRefs: ["c1"] });
  const b = cand({ source: "structural", ruleId: "r2", topic: "data_protection", issueTag: "cat2", clauseRefs: ["c2"] });
  assert.equal(mergeCandidates([a, b]).length, 2);
});

test("mergeFactors: market-standard kept only if ALL members agree; risk factors OR-ed", () => {
  const std = cand({ issueTag: "t", clauseRefs: ["c1"], factors: { ...emptyFactors(), marketStandardLanguage: true } });
  const risky = cand({ issueTag: "t", clauseRefs: ["c1"], factors: { ...emptyFactors(), uncappedOrBroadExposure: true } });
  const merged = mergeCandidates([std, risky]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].factors.marketStandardLanguage, false, "not market-standard if any member is risky");
  assert.equal(merged[0].factors.uncappedOrBroadExposure, true, "risk factor OR-ed in");
});

test("tagSimilar: token-Jaccard threshold", () => {
  assert.equal(tagSimilar("breach_notice_no_deadline", "breach_notice_no_deadline"), true);
  assert.equal(tagSimilar("subprocessor_objection_window", "subprocessor_objection_teeth"), true);
  assert.equal(tagSimilar("governing_law", "audit_cost"), false);
});

test("adaptiveK: large doc → 3, small → 2, override respected", () => {
  assert.equal(adaptiveK(20000), 3);
  assert.equal(adaptiveK(500), 2);
  assert.equal(adaptiveK(20000, 1), 1);
});
