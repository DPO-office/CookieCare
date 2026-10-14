import assert from "node:assert/strict";
import test from "node:test";
import { gdprRegimeSkill } from "../../../../../../backend/src/modules/analysis/skills/regimes/data-protection/gdpr/skill.config.js";
import { importAuthoredComparisons } from "../evaluation/authored-profiles.js";
import { validateCorpus } from "../evaluation/contracts.js";
import { compareRuns, evaluateRun } from "../evaluation/evaluate.js";
import { loadPilotCorpus, referenceRun } from "../evaluation/fixtures/pilot.js";
import { hashRevision } from "../schemas/index.js";

test("reference self-check reports counts without claiming ingestion or legal qualification", () => {
  const report = evaluateRun(loadPilotCorpus(), referenceRun());
  assert.equal(report.artifactChecksPassed, true);
  assert.equal(report.releaseQualified, false);
  assert.equal(report.corpus.caseCount, 12);
  assert.equal(report.corpus.humanCheckedCases, 0);
  assert.equal(report.corpus.splitCounts.held_out, 0);
  assert.ok(report.blockers.some(message => message.includes("Original pilot PDF")));
});

for (const defect of ["continuation", "spurious_heading", "parent", "exception", "alternative", "dependency", "numbering", "missing_page", "missing_case", "coverage"] as const) {
  test(`evaluation rejects seeded ${defect} defects`, () => {
    const corpus = loadPilotCorpus();
    const run = referenceRun(corpus);
    const points = run.cases[0], continuation = run.cases[1];
    if (defect === "continuation") continuation.provisions[0].text = corpus[1].blocks[0].text;
    if (defect === "spurious_heading") continuation.provisions.push({ ...continuation.provisions[1], id: "fake-article-42" });
    if (defect === "parent") points.provisions[1].parentId = null;
    if (defect === "exception") points.requirements[0].exceptions = [];
    if (defect === "alternative") points.requirements[1].alternatives = ["Personnel confidentiality commitment AND statutory confidentiality obligation"];
    if (defect === "dependency") points.requirements[3].dependencies.pop();
    if (defect === "numbering") run.cases.find(c => c.caseId === "numbering-restart")!.provisions[1].citation.path = ["schedule", "A", "1"];
    if (defect === "missing_page") run.cases.find(c => c.caseId === "missing-extraction-block")!.missingPages = [];
    if (defect === "missing_case") run.cases.pop();
    if (defect === "coverage") run.cases.find(c => c.caseId === "unreadable-input")!.coverageStatus = "partial";
    const report = evaluateRun(corpus, run);
    assert.equal(report.artifactChecksPassed, false);
    assert.ok(report.criticalErrorCount > 0);
  });
}

test("invalid run schemas, duplicate cases and unknown cases fail rather than producing a good score", () => {
  const corpus = loadPilotCorpus(), run = referenceRun(corpus);
  assert.throws(() => evaluateRun(corpus, { ...run, corpusVersion: "obsolete" }));
  assert.throws(() => evaluateRun(corpus, { ...run, cases: [...run.cases, run.cases[0]] }), /Duplicate output/);
  assert.throws(() => evaluateRun(corpus, { ...run, cases: [{ ...run.cases[0], caseId: "unknown" }] }), /Unknown output/);
  assert.throws(() => evaluateRun(corpus, { ...run, cases: [{ ...run.cases[0], coverageStatus: "complete" }] }));
  assert.throws(() => evaluateRun([], run), /empty/);
});

test("comparison reports a new regression even if total errors stay the same", () => {
  const corpus = loadPilotCorpus(), before = referenceRun(corpus), after = referenceRun(corpus);
  before.pipelineVersion = "before"; after.pipelineVersion = "after";
  before.cases[0].requirements[0].exceptions = [];
  after.cases[0].requirements[1].alternatives = [];
  const comparison = compareRuns(corpus, before, after);
  assert.equal(comparison.criticalErrorDelta, 0);
  assert.ok(comparison.regressions.some(row => row.error.includes("gdpr.art28.3.b")));
});

test("source versions and generated variants cannot leak between dataset splits", () => {
  const corpus = loadPilotCorpus();
  corpus[1].split = "held_out";
  assert.throws(() => validateCorpus(corpus), /leaks between splits/);
  const duplicate = loadPilotCorpus();
  assert.throws(() => validateCorpus([...duplicate, duplicate[0]]), /Duplicate evaluation case/);
  const falseFamily = loadPilotCorpus();
  falseFamily[1].sourceFamily = "disguised-version";
  assert.throws(() => validateCorpus(falseFamily), /conflicting families/);
});

test("authored comparison snapshots preserve every serialized rule field and provenance", () => {
  const ids = gdprRegimeSkill.regimeRules.filter(r => r.ruleId.startsWith("gdpr.art28.")).map(r => r.ruleId);
  const inputs = importAuthoredComparisons(gdprRegimeSkill, "gdpr/skill.config.ts", ids);
  assert.equal(inputs.length, 14);
  for (const input of inputs) {
    const original = gdprRegimeSkill.regimeRules.find(r => r.ruleId === input.ruleId)!;
    assert.deepEqual(input.rawRule, JSON.parse(JSON.stringify(original)));
    assert.equal(input.provenance.contentHash, hashRevision(input.rawRule));
    assert.equal(input.provenance.skillVersion, gdprRegimeSkill.version);
    assert.equal(input.provenance.declaredReviewStatus, "authored");
    assert.equal(input.requiresLegalReview, true);
    assert.equal(input.purpose, "comparison_only");
  }
  inputs[0].rawRule.ruleText = "changed snapshot";
  assert.notEqual(inputs[0].rawRule.ruleText, gdprRegimeSkill.regimeRules.find(r => r.ruleId === ids[0])!.ruleText);
  assert.throws(() => importAuthoredComparisons(gdprRegimeSkill, "path", ["missing"]), /Missing/);
  assert.throws(() => importAuthoredComparisons(gdprRegimeSkill, "path", [ids[0], ids[0]]), /Duplicate/);
});
