import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createVerificationDiagnosticRun } from "../../../../temp/compliance-verification/index.js";
import { createRun } from "../runtime/create-run.js";
import { executeChecks } from "../runtime/execute-checks.js";
import { assessRequirement, assessRequirementWithReason, lockOutcome, lockOutcomeWithAudit } from "../assessment/index.js";
import { runVerification } from "../verification/index.js";
import { requestFixture, responseFixture } from "./verification-fixture.js";
import { executeCompliancePipeline } from "../runtime/index.js";
import { checksFromState } from "../adapters/index.js";
import type { AnalysisState } from "../../../../models/analysis-state.js";

function directory(t: { after: (fn: () => void) => void }): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "compliance-verification-test-"));
  t.after(() => {
    assert.ok(path.basename(root).startsWith("compliance-verification-test-"));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}
const read = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
function payloads(runDirectory: string): Array<Record<string, any>> {
  return fs.readFileSync(path.join(runDirectory, "events.jsonl"), "utf8").trim().split("\n")
    .map(line => read(path.join(runDirectory, JSON.parse(line).file)));
}

test("file trace preserves raw failed responses, repair errors, and the final stopping gate", async t => {
  const root = directory(t), r = requestFixture();
  const trace = createVerificationDiagnosticRun({ sessionId: "failed-model", mode: "canonical", checks: [r.check], directory: root, enabled: true });
  const run = createRun({ analysisId: "failed-model", checks: [r.check], context: r.context, budget: { concurrency: 4, stageMs: null },
    emit: event => { trace.record(event); }, complete: async () => ({ ...responseFixture(r), checkId: "wrong-check" }) });
  await executeChecks(run, { bundle: () => r.bundle });
  trace.finish();
  const location = trace.health().runDirectory!, events = payloads(location), summary = read(path.join(location, "summary.json"));
  assert.equal(summary.status, "complete");
  assert.equal(summary.checks[0].status, "verification_incomplete");
  assert.equal(summary.checks[0].modelCalls, 2);
  assert.equal(summary.checks[0].repairCalls, 1);
  assert.equal(summary.activeCalls.length, 0);
  assert.equal(summary.checks[0].validationFailures.length, 2);
  assert.equal(summary.checks[0].gate.gate, "verification_not_validated");
  assert.equal(events.filter(e => e.event.endsWith("attempt.response")).length, 2);
  assert.equal(events.find(e => e.event.endsWith("attempt.response"))!.rawResponse.checkId, "wrong-check");
  assert.ok(events.find(e => e.event.endsWith("attempt.started") && e.attempt === 2)!.prompt.includes("identity_or_version_mismatch"));
  const audit = events.find(e => e.event === "compliance.lock.audit")!;
  assert.deepEqual(audit.verificationResult.errors, ["identity_or_version_mismatch"]);
  assert.equal(audit.verificationResult.attempts, 2);
  assert.equal(read(path.join(root, "latest.json")).runDirectory, location);
  assert.deepEqual(trace.health().writeErrors, []);
});

test("review trace retains both decisions and field-level disagreements", async t => {
  const root = directory(t), r = requestFixture();
  r.bundle.passages[0].role = "supporting";
  const trace = createVerificationDiagnosticRun({ sessionId: "review", mode: "canonical", checks: [r.check], directory: root, enabled: true });
  let calls = 0;
  const result = await runVerification(r, async () => {
    const raw = responseFixture(r);
    raw.elements[0].roleReassessment = "The supporting passage directly establishes the duty.";
    if (++calls === 2) raw.elements[0].state = "ambiguous";
    return raw;
  }, new AbortController().signal, { phase: "verify", round: 0, emit: (event, data) => {
    trace.record({ event: "compliance.verification." + event, timestamp: new Date().toISOString(), checkId: r.check.checkId, ...data });
  } });
  assert.equal(result.kind, "verified");
  if (result.kind === "verified") assert.deepEqual(result.decision.reviewRequired, ["semantic_disagreement"]);
  const events = payloads(trace.health().runDirectory!);
  const comparison = events.find(e => e.event.endsWith("review.comparison"))!;
  assert.equal(comparison.agree, false);
  assert.ok(comparison.first.decision && comparison.second.decision);
  assert.ok(comparison.differences.some((d: any) => d.first === "supported" && d.second === "ambiguous"));
  assert.ok(events.find(e => e.event.endsWith("attempt.started") && e.phase === "review")!.prompt.includes("Independently review concerns:"));
});

test("observer exceptions and mutation cannot change a valid verification", async () => {
  const r = requestFixture();
  const result = await runVerification(r, async () => responseFixture(r), new AbortController().signal, {
    phase: "verify", round: 0, emit: (_event, data) => {
      if (data.request) (data.request as typeof r).check.checkId = "mutated";
      throw Error("observer unavailable");
    },
  });
  assert.equal(result.kind, "verified");
  assert.notEqual(r.check.checkId, "mutated");
});

test("stopping-gate audit preserves coverage policy and exposes lock rejection details", async () => {
  const r = requestFixture(), result = await runVerification(r, async () => responseFixture(r), new AbortController().signal);
  r.bundle.executionStatus = "incomplete"; r.bundle.coverageReasons = ["role_budget:context"];
  assert.equal(assessRequirement(r, result), "cannot_determine");
  assert.equal(assessRequirementWithReason(r, result).gate, "investigation_execution_not_complete");
  assert.deepEqual(lockOutcomeWithAudit(r, result).outcome, lockOutcome(r, result));
  assert.equal(result.kind, "verified");
  if (result.kind === "verified") result.decision.checkId = "wrong-check";
  const locked = lockOutcomeWithAudit(r, result);
  assert.equal(locked.outcome.kind, "incomplete");
  assert.ok(locked.audit.validationErrors.includes("decision_identity_or_version_mismatch"));
});

test("separate runs retain history and path-like IDs cannot escape the trace directory", t => {
  const root = directory(t);
  const options = { sessionId: "../../same/session", mode: "canonical", checks: [{ checkId: "../../check", ruleId: "fixture" }], directory: root, enabled: true };
  const first = createVerificationDiagnosticRun(options), second = createVerificationDiagnosticRun(options);
  assert.notEqual(first.health().runDirectory, second.health().runDirectory);
  assert.ok(path.relative(root, first.health().runDirectory!).split(path.sep).every(part => part !== ".."));
  first.record({ event: "compliance.verification.attempt.started", checkId: "../../check", timestamp: new Date().toISOString(), phase: "verify", round: 0, attempt: 1 });
  const summary = read(path.join(first.health().runDirectory!, "summary.json"));
  assert.equal(summary.status, "running"); assert.equal(summary.activeCalls.length, 1);
  assert.equal(read(path.join(root, "latest.json")).runDirectory, second.health().runDirectory);
  assert.ok(fs.existsSync(path.join(first.health().runDirectory!, "manifest.json")));
});

test("disabled tracing does not write files; write failures are observable and non-fatal", t => {
  const root = directory(t), disabledRoot = path.join(root, "disabled");
  const disabled = createVerificationDiagnosticRun({ sessionId: "off", mode: "canonical", checks: [], directory: disabledRoot, enabled: false });
  disabled.record({ event: "test", timestamp: "now" }); disabled.finish();
  assert.equal(fs.existsSync(disabledRoot), false);
  const file = path.join(root, "not-a-directory"); fs.writeFileSync(file, "fixture");
  const failed = createVerificationDiagnosticRun({ sessionId: "fail", mode: "canonical", checks: [], directory: file, enabled: true });
  assert.doesNotThrow(() => { failed.record({ event: "test", timestamp: "now" }); failed.finish(); });
  assert.ok(failed.health().writeErrors.length > 0);
});

test("transient Windows summary locks retry without losing payload links", async t => {
  const trace = createVerificationDiagnosticRun({ sessionId: "windows-lock", mode: "canonical", checks: [], directory: directory(t), enabled: true });
  const rename = fs.renameSync;
  let failed = false;
  t.mock.method(fs, "renameSync", (from: fs.PathLike, to: fs.PathLike) => {
    if (!failed && String(to).endsWith("summary.json")) {
      failed = true;
      throw Object.assign(new Error("simulated Windows sharing violation"), { code: "EPERM" });
    }
    return rename(from, to);
  });
  const payload = trace.record({ event: "fixture.event", timestamp: "now" });
  assert.ok(payload && fs.existsSync(payload));
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(read(path.join(trace.health().runDirectory!, "summary.json")).eventCounts["fixture.event"], 1);
  assert.deepEqual(trace.health().writeErrors, []);
});

test("application pipeline writes a terminal file trace even when the baseline is unavailable", async t => {
  const state = {
    request: { sessionId: "application-trace", instruction: "Review the selected check" }, activeSkills: [],
    workspace: { documents: [{ docId: "document", fullText: "Contract text" }] },
    plan: { workUnits: [{ tool: "run_compliance_pipeline", input: { docId: "document", requirementIds: ["uninstalled.rule"] } }] },
  } as unknown as AnalysisState;
  const trace = createVerificationDiagnosticRun({ sessionId: "application-trace", mode: "canonical", checks: checksFromState(state), directory: directory(t), enabled: true });
  await executeCompliancePipeline(state, { mode: "canonical", verificationDiagnostics: trace, emit: () => {},
    complete: async () => { throw Error("No model call is expected"); },
    investigate: async () => ({ bundlesByRequirement: new Map(), resolutionIssues: [], timings: { indexMs: 0, retrievalMs: 0, reviewMs: 0, expansionMs: 0, totalMs: 0 } }),
  });
  const summary = read(path.join(trace.health().runDirectory!, "summary.json"));
  assert.equal(summary.status, "complete");
  assert.equal(summary.checks[0].reportedStatus, "verification_incomplete");
  assert.equal(summary.checks[0].gate.gate, "baseline_unavailable");
  assert.equal(summary.checks[0].modelCalls, 0);
});
