import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { evaluateReviewDataset, type EvaluationJudge } from "../evaluation/review-dataset.js";

const bytes = Buffer.from("test PDF bytes");
const hash = createHash("sha256").update(bytes).digest("hex");
const caseRow = (id: string, review: "approved" | "pending" = "approved") => ({
  id, stage: "S6", title: "Find required passage", scope: "source_plus_authored_query",
  split: "development", severity: "critical", source_refs: ["provision:28.3.b"],
  physical_pages: [1], input: { mode: "query_published_kb" },
  expected: { direct_retrieval: { k: 10, must_include: ["Article 28(3)(b)"], exhaustive_relevance_labels: false } },
  must_not: ["Treat a recital as the operative rule"],
  grading: { method: "retrieval", match_policy: "equivalent facts" },
  human_review: { status: review, reviewer: review === "approved" ? "reviewer-1" : null,
    reviewed_at: review === "approved" ? "2026-10-19T00:00:00Z" : null, notes: "" },
});
const dataset = { schema_version: "gdpr-review-dataset/1.0", dataset_id: "test", source_family: "family-1",
  split: "development", source: { sha256: hash, page_count: 1, byte_size: bytes.length },
  stages: { S6: "Retrieval" }, cases: [caseRow("a"), caseRow("b", "pending")] };
const source = { source_sha256: hash, units: { "provision:28.3.b": { comparison_text: "Confidentiality or statutory duty." } } };
const run = () => ({ dataset_id: "test", source_sha256: hash, run_id: "run-1",
  provider: "kanon", model: "kanon-2", prompt_version: null, pipeline_version: "v1", reasoning_setting: null,
  model_assignments: [{ stage: "S6", task: "retrieval", provider: "digitalocean",
    model: "glm-5.3-flash", reasoning_setting: null, prompt_version: "retrieval-v1" }],
  artifacts: { search: { retrieved_targets: ["Article 28(3)(b)"], citation: "this PDF" } },
  results: ["a", "b"].map(case_id => ({ case_id, status: "not_run", observed: null,
    evidence_refs: ["search#"], failed_expected_fields: [], forbidden_claims_found: [], reviewer_notes: "" })) });
const judge: EvaluationJudge = { model: "judge-test", async judge(input) {
  return { fields: Object.keys(input.expected).map(field => ({ field, verdict: "pass" as const, reason: "Evidence supports target" })),
    forbidden: input.forbidden.map(claim => ({ claim, found: false, reason: "Absent" })) };
} };

test("scores provisional reference cases while retaining human review flags", async () => {
  const report = await evaluateReviewDataset(dataset, run(), source, bytes, judge);
  assert.equal(report.statuses.pass, 2);
  assert.equal(report.statuses.needs_review, 0);
  assert.equal(report.humanReviewPendingCases, 1);
  assert.equal(report.passRateIsHumanValidated, false);
  assert.equal(report.cases[1]?.reviewStatus, "pending");
  assert.equal(report.advisory.pass, 2);
  assert.deepEqual(report.requiredTargetRecall, { found: 2, total: 2, value: 1,
    note: "Required targets only; no full precision or nDCG claim" });
  assert.equal(report.humanReviewedRequiredTargetRecall.total, 1);
  assert.equal(report.evaluatedPassRate.value, 1);
  assert.equal(report.advisoryRequiredTargetRecall.total, 2);
  assert.equal(report.releaseQualified, false);
  assert.deepEqual(report.modelAssignments, run().model_assignments);
  assert.equal(report.judgeModel, "judge-test");
});

test("retries an incomplete judge rubric once before marking the case unresolved", async () => {
  let calls = 0;
  const flaky: EvaluationJudge = { model: "judge-test", async judge(input) {
    calls++;
    if (calls === 1) return { fields: [], forbidden: [] };
    return judge.judge(input);
  } };
  const oneCase = { ...dataset, cases: [dataset.cases[0]] };
  const oneRun = { ...run(), results: [run().results[0]] };
  const report = await evaluateReviewDataset(oneCase, oneRun, source, bytes, flaky);
  assert.equal(calls, 2);
  assert.equal(report.cases[0]?.status, "pass");
});

test("required-target omission fails even if judge passes", async () => {
  const candidate = run();
  candidate.artifacts.search.retrieved_targets = ["Article 28(3)(a)"];
  const report = await evaluateReviewDataset(dataset, candidate, source, bytes, judge);
  assert.equal(report.cases[0]?.status, "fail");
  assert.equal(report.requiredTargetRecall.value, 0);
});

test("missing artifact evidence is not run and wrong PDF hash is rejected", async () => {
  const candidate = run();
  candidate.results[0]!.evidence_refs = [];
  const report = await evaluateReviewDataset(dataset, candidate, source, bytes, judge);
  assert.equal(report.cases[0]?.status, "not_run");
  await assert.rejects(() => evaluateReviewDataset(dataset, candidate, source, Buffer.from("other"), judge), /same source/);
});

test("physical page inventory is checked from saved source-map output", async () => {
  const inventory = { ...caseRow("pages"), stage: "S1", expected: { physical_pages: [1] } };
  const candidateDataset = { ...dataset, cases: [inventory] };
  const candidateRun = { ...run(), artifacts: { source_map: { pages: [{ physicalPage: 1 }] } },
    results: [{ ...run().results[0]!, case_id: "pages", evidence_refs: ["source_map#"] }] };
  assert.equal((await evaluateReviewDataset(candidateDataset, candidateRun, source, bytes, judge)).cases[0]?.status, "pass");
  candidateRun.artifacts.source_map.pages = [];
  assert.equal((await evaluateReviewDataset(candidateDataset, candidateRun, source, bytes, judge)).cases[0]?.status, "fail");
});

test("downstream cases are blocked only by a named, failed prerequisite", async () => {
  const first = { ...caseRow("pages"), stage: "S1", expected: { physical_pages: [1] } };
  const second = { ...caseRow("boundary"), stage: "S2" };
  const candidateDataset = { ...dataset, cases: [first, second] };
  const candidateRun = { ...run(), artifacts: { source_map: { pages: [] } },
    results: [
      { ...run().results[0]!, case_id: "pages", evidence_refs: ["source_map#"] },
      { ...run().results[1]!, case_id: "boundary", evidence_refs: [], blocked_by_case_ids: ["pages"] },
    ] };
  const report = await evaluateReviewDataset(candidateDataset, candidateRun, source, bytes, judge);
  assert.equal(report.cases[0]?.status, "fail");
  assert.equal(report.cases[1]?.status, "blocked_by_upstream");
  const withoutClaim = await evaluateReviewDataset(candidateDataset,
    { ...candidateRun, results: [candidateRun.results[0],
      { ...candidateRun.results[1], blocked_by_case_ids: [] }] }, source, bytes, judge);
  assert.equal(withoutClaim.cases[1]?.status, "not_run");
});

test("v1.1 passage retrieval accepts source excerpts without requiring chunk labels", async () => {
  const row = { ...caseRow("passage"),
    grading: { method: "retrieval", match_policy: "equivalent source spans",
      accepted_variants: ["Different chunk IDs are acceptable"] },
    expected: { direct_retrieval: { k: 10, required_source_passages: ["Article 28(3)(b)"],
      match_by: "actual source span coverage" } } };
  const currentDataset = { ...dataset, schema_version: "gdpr-review-dataset/1.1", cases: [row] };
  const currentSource = { source_sha256: hash, units: { "provision:28.3.b": {
    fragments: [{ text: "Persons authorised to process the personal data must be bound to confidentiality." }] } } };
  const currentRun = { ...run(), artifacts: { search: { retrieved_passages: [
    { text: "Persons authorised to process the personal data must be bound to confidentiality.",
      source_ref: "provision:28.3.b" }] } },
    results: [{ ...run().results[0]!, case_id: "passage", evidence_refs: ["search#"] }] };
  const readingJudge: EvaluationJudge = { model: "judge-test", async judge(input) {
    assert.match(input.source[0]!.text, /bound to confidentiality/);
    assert.ok(input.evidence[0]!.value);
    assert.deepEqual(input.grading.accepted_variants, ["Different chunk IDs are acceptable"]);
    return { fields: [{ field: "direct_retrieval", verdict: "pass", reason: "Source span found" }],
      forbidden: row.must_not.map(claim => ({ claim, found: false, reason: "Absent" })) };
  } };
  const report = await evaluateReviewDataset(currentDataset, currentRun, currentSource, bytes, readingJudge);
  assert.equal(report.cases[0]?.status, "pass");
  assert.equal(report.requiredTargetRecall.value, null);
});

test("graph review reports individual missing nodes, edges and paths", async () => {
  const row = { ...caseRow("graph"), stage: "S3", grading: {
    method: "relation", match_policy: "match source text and graph relationships" },
    expected: {
      reference_tree: { nodes: [
        { id: "Article 28(3)", parent: "Article 28", exact_source_text: "Contract introduction" },
        { id: "Article 28(3)(c)", parent: "Article 28(3)", exact_source_text: "Security point" },
      ] },
      explicit_reference_edges: [{ from: "Article 28(3)(c)", to: "Article 32",
        type: "explicit_reference", source_wording: "Article 32" }],
      multi_hop_paths: [{ path: ["Article 28(3)(c)", "Article 32", "Article 32(1)"],
        purpose: "Security measures" }],
    } };
  const graphJudge: EvaluationJudge = { model: "judge-test", async judge(input) {
    assert.deepEqual(Object.keys(input.expected), [
      "node:Article 28(3)", "node:Article 28(3)(c)",
      "edge:Article 28(3)(c) -> Article 32",
      "path:Article 28(3)(c) -> Article 32 -> Article 32(1)",
    ]);
    return { fields: Object.keys(input.expected).map(field => ({ field,
      verdict: field.startsWith("edge:") ? "fail" as const : "pass" as const,
      reason: field.startsWith("edge:") ? "Reference absent from output" : "Found" })),
      forbidden: input.forbidden.map(claim => ({ claim, found: false, reason: "Absent" })) };
  } };
  const currentRun = { ...run(), artifacts: { graph: { nodes: [], edges: [] } },
    results: [{ ...run().results[0]!, case_id: "graph", evidence_refs: ["graph#"] }] };
  const report = await evaluateReviewDataset({ ...dataset, cases: [row] }, currentRun, source, bytes, graphJudge);
  assert.equal(report.cases[0]?.status, "fail");
  assert.deepEqual(report.cases[0]?.failedExpectedFields, ["edge:Article 28(3)(c) -> Article 32"]);
  assert.deepEqual(report.cases[0]?.expectedChecks,
    { passed: 3, failed: 1, needsReview: 0, total: 4 });
});
