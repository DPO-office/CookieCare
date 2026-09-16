/**
 * Validation tests for the Stage 0 benchmark harness scoring itself.
 * Pure — no DB, no LLM. Run:
 *   node --import tsx --test backend/src/modules/negotiate/eval/match.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { findingMatchesGold, anchorTokenContainment } from "./match.js";
import { scoreDocument } from "./score.js";
import { computeStability } from "./stability.js";
import type { GoldFinding, V1Finding } from "./types.js";

function gold(p: Partial<GoldFinding>): GoldFinding {
  return {
    id: "g", docId: "D", kind: "issue",
    anchor: { headingPath: "§1", quote: "Alaio may process User Personal Data in Russian Federation" },
    issueTag: "intl_transfer_non_adequate", expectedSeverityBand: "RED",
    importance: "must_catch", matchKeywords: ["russian federation"], notes: "",
    ...p,
  };
}
function finding(p: Partial<V1Finding>): V1Finding {
  return { clauseId: "c1", original: "", reasoning: "", replacement: "", riskLevel: "RED", clauseType: "data_protection", charOffset: 0, ...p };
}

test("exact match: identical anchor text + keyword → matches", () => {
  const g = gold({});
  const f = finding({ original: "Alaio may process User Personal Data in Russian Federation subject to article 46.", reasoning: "Processing in the russian federation is high risk." });
  assert.equal(findingMatchesGold(g, f), true);
});

test("paraphrase with same anchor/tag (whitespace, case, extra words) → matches", () => {
  const g = gold({});
  const f = finding({ original: "3.1  ALAIO   may  process   user personal   DATA in  Russian Federation (see schedule 11.4)", reasoning: "Data processed in the Russian Federation." });
  assert.equal(findingMatchesGold(g, f), true);
});

test("wrong issueTag (anchor matches, keyword absent) → no match", () => {
  const g = gold({ matchKeywords: ["china", "prc"] }); // keyword not present
  const f = finding({ original: "Alaio may process User Personal Data in Russian Federation subject to article 46.", reasoning: "transfer risk" });
  assert.equal(findingMatchesGold(g, f), false);
});

test("wrong anchor (keyword present, anchor tokens absent) → no match", () => {
  const g = gold({});
  const f = finding({ original: "Governing law shall be the courts of Cyprus.", reasoning: "This clause mentions the russian federation only in passing." });
  // anchor tokens (process, personal, data, russian, federation) mostly absent from original
  assert.ok(anchorTokenContainment(g.anchor.quote, f.original) < 0.6);
  assert.equal(findingMatchesGold(g, f), false);
});

test("absence gold requires an absence assertion", () => {
  const g = gold({ kind: "absence", issueTag: "missing_liability_cap", anchor: { headingPath: "doc" }, matchKeywords: ["limitation of liability"] });
  const present = finding({ original: "The limitation of liability is set at fees paid.", reasoning: "standard cap" });
  const absent = finding({ original: "note", reasoning: "The DPA contains no limitation of liability clause." });
  assert.equal(findingMatchesGold(g, present), false, "present-clause finding must NOT satisfy an absence gold");
  assert.equal(findingMatchesGold(g, absent), true, "finding that asserts the absence satisfies it");
});

test("trap detection: a v1 finding on a trap gold is scored as surfaced", () => {
  const trap = gold({ id: "t1", kind: "trap", importance: "must_not_flag", expectedSeverityBand: "NONE",
    anchor: { headingPath: "def", quote: "unsuccessful log-in attempts, pings, port scans, denial of service attacks" },
    issueTag: "dos_exclusion", matchKeywords: ["denial of service"] });
  const f = finding({ clauseId: "cX", original: "Data Incidents exclude unsuccessful log-in attempts, pings, port scans, denial of service attacks.", reasoning: "excluding DoS may create loopholes" });
  const s = scoreDocument("D", [trap], [f]);
  assert.equal(s.fpTrapRateHard.num, 1);
  assert.equal(s.fpTrapRateHard.den, 1);
  assert.equal(s.trapHits[0].clauseIds[0], "cX");
});

test("dedup group scoring: two findings across a dupGroup = not collapsed; one = collapsed", () => {
  const g1 = gold({ id: "g2a", issueTag: "breach", dupGroup: "DUP", anchor: { headingPath: "§8", quote: "notify Administrator of the Data Incident without undue delay" }, matchKeywords: ["undue delay"] });
  const g2 = gold({ id: "g2b", issueTag: "breach", dupGroup: "DUP", importance: "should_catch", anchor: { headingPath: "app", quote: "Alaio monitors communication channels for security breaches" }, matchKeywords: ["security breaches"] });
  const fa = finding({ clauseId: "cA", original: "Alaio will notify Administrator of the Data Incident without undue delay.", reasoning: "no deadline" });
  const fb = finding({ clauseId: "cB", original: "Alaio monitors communication channels for security breaches and reacts promptly.", reasoning: "no timeframe" });

  const two = scoreDocument("D", [g1, g2], [fa, fb]);
  assert.equal(two.dedupCorrect.num, 0, "two distinct findings for one issue must score as NOT collapsed");
  assert.equal(two.dedupDetail[0].distinctV1Findings, 2);

  const one = scoreDocument("D", [g1, g2], [fa]);
  assert.equal(one.dedupCorrect.num, 1, "a single finding covering the group scores as collapsed");
});

test("severity scoring: exact vs within-one band", () => {
  const g = gold({ id: "s", issueTag: "x", expectedSeverityBand: "YELLOW", importance: "severity_check",
    anchor: { headingPath: "§2", quote: "free plan inactive account is archived" }, matchKeywords: ["free plan"] });
  const overClassified = finding({ original: "A free plan inactive account is archived and deleted.", reasoning: "risk", riskLevel: "RED" });
  const s = scoreDocument("D", [g], [overClassified]);
  assert.equal(s.severityExactBand.num, 0, "RED vs YELLOW is not exact");
  assert.equal(s.severityWithinOneBand.num, 1, "RED vs YELLOW is within one band");
});

test("stability calculation: known runs → known Jaccard and flip rate", () => {
  const mk = (orig: string, band: any = "YELLOW"): V1Finding => finding({ original: orig, riskLevel: band, clauseType: "t" });
  // run1: {A,B,C} run2: {A,B} run3: {A,B,D}; A flips severity in run3
  const A1 = mk("clause alpha text", "RED");
  const A2 = mk("clause alpha text", "RED");
  const A3 = mk("clause alpha text", "YELLOW"); // flip
  const B = () => mk("clause beta text");
  const runs = [
    [A1, B(), mk("clause gamma text")],
    [A2, B()],
    [A3, B(), mk("clause delta text")],
  ];
  const st = computeStability(runs);
  assert.equal(st.runSizes.join(","), "3,2,3");
  // Jaccard(run1,run2) = |{A,B}| / |{A,B,C}| = 2/3
  assert.ok(Math.abs(st.pairwiseJaccard[0] - 2 / 3) < 1e-9);
  // A and B are shared (>=2 runs); A flips severity → 1 flip / 2 shared
  assert.equal(st.sharedSignatures, 2);
  assert.equal(st.severityFlips, 1);
  assert.ok(Math.abs((st.severityFlipRate ?? 0) - 0.5) < 1e-9);
});

test("merge group: ONE finding matching all members satisfies the group (a2+g3 case)", () => {
  const g3 = gold({ id: "g3", issueTag: "objection_weak", mergeGroup: "M",
    anchor: { headingPath: "§7.4", quote: "object within five business days" }, matchKeywords: ["five business days"] });
  const a2 = gold({ id: "a2", kind: "absence", issueTag: "objection_no_teeth", mergeGroup: "M",
    anchor: { headingPath: "§7.4", quote: "reasonable efforts to make available a change" }, matchKeywords: ["reasonable efforts"] });
  // A single MERGED finding whose original spans both sentences and asserts the absence.
  const merged = finding({ clauseId: "cM",
    original: "You may object within five business days; thereafter Vendor will use reasonable efforts to make available a change.",
    reasoning: "objection is illusory — there is no right to block the sub-processor." });
  const s = scoreDocument("D", [g3, a2], [merged]);
  const mg = s.mergeGroupDetail.find((m) => m.mergeGroup === "M")!;
  assert.equal(mg.allMembersCaught, true, "both members caught");
  assert.equal(mg.satisfiedBySingleFinding, true, "one finding satisfies the whole group");
  assert.equal(mg.distinctFindingsCovering, 1);
  // recall still counts both members individually (coverage)
  assert.equal(s.recallMustCatchIssues.num, 1); // g3 is the only must_catch ISSUE
  assert.equal(s.recallMustCatchAbsence.num, 1); // a2 is the only must_catch ABSENCE
});

test("merge group: v1-style (g3 only, a2 absent) → partial, not satisfied by one finding", () => {
  const g3 = gold({ id: "g3", issueTag: "objection_weak", mergeGroup: "M",
    anchor: { headingPath: "§7.4", quote: "object within five business days" }, matchKeywords: ["five business days"] });
  const a2 = gold({ id: "a2", kind: "absence", issueTag: "objection_no_teeth", mergeGroup: "M",
    anchor: { headingPath: "§7.4", quote: "reasonable efforts to make available a change" }, matchKeywords: ["reasonable efforts"] });
  const only5day = finding({ clauseId: "c5", original: "Controller may object within five business days.", reasoning: "window too short" });
  const s = scoreDocument("D", [g3, a2], [only5day]);
  const mg = s.mergeGroupDetail.find((m) => m.mergeGroup === "M")!;
  assert.equal(mg.allMembersCaught, false);
  assert.equal(mg.satisfiedBySingleFinding, false);
  assert.deepEqual(mg.caughtMemberGoldIds, ["g3"]);
});

test("recall counts a dup-group issue once (multi-location golds do not double-count)", () => {
  const g1 = gold({ id: "g2a", issueTag: "breach", dupGroup: "DUP", anchor: { headingPath: "§8", quote: "notify without undue delay" }, matchKeywords: ["undue delay"] });
  const g2 = gold({ id: "g2b", issueTag: "breach", dupGroup: "DUP", anchor: { headingPath: "app", quote: "monitors communication channels" }, matchKeywords: ["communication channels"] });
  const fa = finding({ clauseId: "cA", original: "notify without undue delay", reasoning: "" });
  const s = scoreDocument("D", [g1, g2], [fa]);
  // both are must_catch issue with the same issueTag → one distinct must-catch, caught
  assert.equal(s.recallMustCatchIssues.den, 1);
  assert.equal(s.recallMustCatchIssues.num, 1);
});
