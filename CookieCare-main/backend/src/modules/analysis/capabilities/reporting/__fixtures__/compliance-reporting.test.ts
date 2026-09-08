import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { CompliancePresentationPlan, ComplianceReportSnapshot } from "../../../models/compliance-report.js";
import { renderComplianceReport, type ComplianceCompletion } from "../compliance-reporting.js";
import { defaultCompliancePresentationPlan, deterministicComplianceDraft } from "../compliance-presentation.js";
import { hasValidatedComplianceReport, runComplianceReportGate, usesCanonicalComplianceReport } from "../compliance-release.js";
import { executeActPlan } from "../../act/execute-act-plan.js";
import { runAudit } from "../../audit/run-audit.js";
import { persistAnalysis } from "../../persist/persist-analysis.js";
import { initAgentRunState } from "../../../pac/types.js";

function fixture(status: ComplianceReportSnapshot["rows"][number]["status"] = "partial"): ComplianceReportSnapshot {
  const text = "4.1.1 The processor shall assist with requests.";
  return {
    version: 1, instruction: "Check compliance", scope: "The supplied DPA and requested processor obligations",
    documents: [{ documentId: "doc-1", title: "DPA", contentHash: createHash("sha256").update(text).digest("hex") }],
    rows: [{
      rowId: "row-1", requirementId: "req-assistance", canonicalKey: "requirement.assistance", lockedAssessmentId: "lock-1",
      title: "Assistance with requests", legalCitation: "GDPR Article 28", status, statusLabel: "Partial",
      recommendedAction: "Clarify the scope of the assistance obligation.", supportedElementIds: [], missingElementIds: [],
      evidence: [{ spanId: "span-1", citationId: "E1", documentId: "doc-1", documentTitle: "DPA", pointer: "Section 4.1.1",
        quote: "The processor shall assist with requests.", structuralPath: "source-clause", charRange: [6, text.length] }],
      whatTheDocumentProvides: "The processor commits to assist with requests.",
      whatIsMissingOrUnclear: "The scope of assistance is not fully defined.",
      whyItMatters: "The extent of the assistance obligation remains unclear.",
      conclusion: "Assistance is addressed but its scope is not fully defined.", documentHash: "source-hash", ruleVersion: "v1",
    }], outstandingChecks: [], limitations: [],
  };
}
function state(snapshot: ComplianceReportSnapshot | undefined = fixture()): AnalysisState {
  return {
    request: { sessionId: `report-test-${Math.random()}`, instruction: "Check compliance", documentIds: ["doc-1"],
      documentTexts: { "doc-1": "4.1.1 The processor shall assist with requests." } },
    intent: { operation: "compliance_check", standard: "none", scope: "whole_document", outputForm: "memo", compound: false,
      subIntents: [], requirements: [], confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 } },
    workspace: { sessionId: "report-test", documents: [{ docId: "doc-1", title: "DPA", role: "target",
      fullText: "4.1.1 The processor shall assist with requests.", segments: [], clauses: [] }] },
    findings: [], metadata: {}, activeSkills: [], complianceReportSnapshot: snapshot,
    plan: { workUnits: [{ workUnitId: "wu-render", tool: "render_output", input: {}, dependsOn: [], outputSchema: "string", status: "done" }] },
  } as unknown as AnalysisState;
}
function completion(snapshot: ComplianceReportSnapshot, calls: string[], override?: ComplianceCompletion): ComplianceCompletion {
  let plan = defaultCompliancePresentationPlan(snapshot, "layered");
  return async (stage, payload) => {
    calls.push(stage);
    if (override) {
      const replacement = await override(stage, payload);
      if (replacement !== undefined) return replacement;
    }
    if (stage === "outline") { plan = (payload as { defaultPlan: CompliancePresentationPlan }).defaultPlan; return plan; }
    if (stage === "check") return { passed: true, failures: [] };
    return deterministicComplianceDraft(snapshot, plan);
  };
}

describe("bounded compliance report generation", () => {
  it("plans, writes, and checks once without exposing raw documents or draft tokens", async () => {
    const snapshot = fixture(); const input = state(snapshot); const calls: string[] = []; const tokens: string[] = [];
    input.onToken = delta => tokens.push(delta);
    const before = structuredClone(snapshot);
    const result = await renderComplianceReport(input, completion(snapshot, calls, async (_stage, payload) => {
      const json = JSON.stringify(payload);
      assert.doesNotMatch(json, /documentTexts|fullText|unverifiedFindings/);
      return undefined;
    }));
    assert.deepEqual(calls, ["outline", "write", "check"]);
    assert.deepEqual(tokens, []);
    assert.equal(result.complianceReportValidation?.source, "validated_writer");
    assert.ok(hasValidatedComplianceReport(result));
    assert.deepEqual(snapshot, before);
    assert.match(result.renderedOutput!, /4(?:\.|&#46;)1(?:\.|&#46;)1/);
  });
  it("uses the default outline after one invalid planner response", async () => {
    const snapshot = fixture(); const calls: string[] = [];
    const result = await renderComplianceReport(state(snapshot), completion(snapshot, calls, async stage =>
      stage === "outline" ? { sections: [{ findingIds: ["invented"] }] } : undefined));
    assert.equal(calls.filter(c => c === "outline").length, 1);
    assert.equal(result.complianceReportValidation?.plannerFallback, true);
    assert.equal(result.complianceReportValidation?.source, "validated_writer");
  });
  it("repairs one semantic failure and rechecks without calling analysis", async () => {
    const snapshot = fixture(); const calls: string[] = []; let checks = 0;
    const result = await renderComplianceReport(state(snapshot), completion(snapshot, calls, async stage =>
      stage === "check" && checks++ === 0 ? { passed: false, failures: ["answer: unsupported conclusion"] } : undefined));
    assert.deepEqual(calls, ["outline", "write", "check", "repair", "check"]);
    assert.equal(result.complianceReportValidation?.repairAttempts, 1);
    assert.equal(result.complianceReportValidation?.source, "validated_writer");
  });
  it("falls back after the single repair fails and never leaks rejected prose", async () => {
    const snapshot = fixture(); const calls: string[] = [];
    const result = await renderComplianceReport(state(snapshot), completion(snapshot, calls, async stage =>
      stage === "write" || stage === "repair" ? { answer: "FABRICATED SECRET CONCLUSION", rows: [] } : undefined));
    assert.deepEqual(calls, ["outline", "write", "repair"]);
    assert.equal(result.complianceReportValidation?.source, "deterministic");
    assert.doesNotMatch(result.renderedOutput!, /FABRICATED/);
    assert.ok(hasValidatedComplianceReport(result));
  });
  it("never accepts a malformed or unavailable semantic check", async () => {
    const snapshot = fixture(); const calls: string[] = [];
    const result = await renderComplianceReport(state(snapshot), completion(snapshot, calls, async stage =>
      stage === "check" ? { passed: true } : undefined));
    assert.equal(result.complianceReportValidation?.source, "deterministic");
    assert.equal(calls.filter(c => c === "check").length, 2);
  });
  it("handles all provider failures with a deterministic report", async () => {
    const calls: string[] = [];
    const result = await renderComplianceReport(state(), async stage => { calls.push(stage); throw new Error("offline"); });
    assert.deepEqual(calls, ["outline", "write"]);
    assert.equal(result.complianceReportValidation?.source, "deterministic");
    assert.ok(result.renderedOutput);
  });
  it("makes no LLM calls for an empty accepted set and accounts for missing checks", async () => {
    const snapshot = fixture(); snapshot.rows = [];
    snapshot.outstandingChecks = [{ requirementId: "req-missing", title: "Assistance", kind: "rejected", reason: "Verification did not complete." }];
    const result = await renderComplianceReport(state(snapshot), async () => { assert.fail("No LLM call expected"); });
    assert.match(result.renderedOutput!, /No completed requirement assessments/);
    assert.match(result.renderedOutput!, /Assistance/);
    assert.equal(runComplianceReportGate(result).critique?.release?.verdict, "release_with_limitations");
  });
  it("does not reconstruct old findings without a saved canonical snapshot", async () => {
    const input = state(); input.complianceReportSnapshot = undefined;
    const result = await renderComplianceReport(input, async () => { assert.fail("No LLM call expected"); });
    assert.equal(result.complianceReportValidation?.source, "snapshot_unavailable");
    assert.match(result.renderedOutput!, /fresh compliance check/);
  });
});

describe("compliance execution and publication boundary", () => {
  it("retains canonical provenance across repeated Q&A follow-ups, not new analysis", () => {
    const input = state();
    input.intent!.operation = "explain_qa";
    input.priorAnalysis = { intent: input.intent, complianceReportSnapshot: fixture() } as AnalysisState["priorAnalysis"];
    input.plan!.workUnits[0].input.followUpKind = "conversational_qa";
    assert.equal(usesCanonicalComplianceReport(input), true);
    delete input.plan!.workUnits[0].input.followUpKind;
    assert.equal(usesCanonicalComplianceReport(input), false);
  });
  it("skips legacy verification even when the canonical pipeline produces no rows", async () => {
    const input = state(); input.complianceReportSnapshot = undefined;
    input.plan!.workUnits = [
      { workUnitId: "legacy", tool: "evaluate_package", input: {}, dependsOn: [], outputSchema: "Finding[]", status: "pending" },
      { workUnitId: "wu-render", tool: "render_output", input: {}, dependsOn: ["legacy"], outputSchema: "string", status: "pending" },
    ];
    const result = await executeActPlan(input);
    assert.equal(result.plan!.workUnits[0].status, "skipped");
    assert.equal(result.plan!.workUnits[1].status, "done");
    assert.deepEqual(result.complianceReportSnapshot?.rows, []);
    assert.match(result.renderedOutput!, /No completed requirement assessments/);
  });
  it("takes the render-only path for an old presentation follow-up without starting verification", async () => {
    const input = state(); input.complianceReportSnapshot = undefined;
    input.plan!.workUnits[0].status = "pending";
    input.plan!.workUnits[0].input.followUpKind = "presentation_change";
    const result = await executeActPlan(input);
    assert.equal(result.complianceReportSnapshot, undefined);
    assert.equal(result.complianceReportValidation?.source, "snapshot_unavailable");
    assert.equal(result.plan!.workUnits[0].status, "done");
  });
  it("does not append general audit prose, and withholds a changed report", async () => {
    const snapshot = fixture();
    const result = await renderComplianceReport(state(snapshot), completion(snapshot, []));
    const audited = await runAudit(result);
    assert.equal(audited.renderedOutput, result.renderedOutput);
    const modified = runComplianceReportGate({ ...audited, renderedOutput: `${audited.renderedOutput}\nUnsupported claim.` });
    assert.equal(modified.critique?.release?.verdict, "withhold");
    assert.doesNotMatch(modified.renderedOutput!, /Unsupported claim/);
  });
  it("publishes exactly the validated final report once during persistence", async () => {
    const snapshot = fixture(); const input = state(snapshot); const emitted: string[] = [];
    input.agent = { ...initAgentRunState("CREATE"), phase: "ACT" };
    input.onToken = delta => emitted.push(delta);
    const result = runComplianceReportGate(await renderComplianceReport(input, completion(snapshot, [])));
    assert.deepEqual(emitted, []);
    result.agent!.phase = "DONE";
    const saved = await persistAnalysis(result);
    assert.deepEqual(emitted, [result.renderedOutput]);
    await persistAnalysis(saved);
    assert.equal(emitted.length, 1);
  });
});
