import assert from "node:assert/strict";
import test from "node:test";
import { requestFixture, responseFixture } from "./verification-fixture.js";
import { verifyRequirement, validateVerification, runVerification } from "../verification/index.js";
import { assessRequirement, lockOutcome } from "../assessment/index.js";
import { createRun } from "../runtime/create-run.js";
import { executeChecks } from "../runtime/execute-checks.js";
import { evidenceMateriallyChanged, mergeEvidenceBundles } from "../runtime/merge-evidence.js";
import { createModelCallQueue } from "../runtime/model-queue.js";
import { bundleForCheck, outcomesToSnapshot } from "../adapters/index.js";
import type { AnalysisState } from "../../../../models/analysis-state.js";
import { buildRequirementEvidenceBundle } from "../investigation/build-bundle.js";
import { reviewCandidateBatches } from "../investigation/rerank-evidence.js";
import type { InvestigationRequirement, RankedEvidenceCandidate } from "../investigation/types.js";

const signal = () => new AbortController().signal;
function wire(r = requestFixture()): any {
  const old = responseFixture(r);
  return { ...old, protocolVersion: 2,
    citations: [{ citationId: "q1", evidenceId: "span", quote: r.bundle.passages[0].text, explanation: "Operative text." }],
    elements: old.elements.map(e => ({ ...e, citations: [{ citationId: "q1", use: "proof" }],
      actorScope: { relationshipScope: "unspecified", basis: "Reviewed scope", citationIds: [] } })), answers: [] };
}

test("shared citation registry grounds missing-element scope independently of proof", () => {
  const r = requestFixture(), raw = wire(r);
  r.check.rule!.relationshipScopes = ["controller_to_processor"];
  raw.elements[0].state = "not_located"; raw.elements[0].citations = [];
  raw.elements[0].actorScope = { relationshipScope: "controller_to_processor", basis: "Related instruction context identifies the relationship, not the missing term.", citationIds: ["q1"] };
  const checked = validateVerification(raw, r);
  assert.deepEqual(checked.errors, []);
  assert.equal(checked.decision!.elements[0].citations[0].use, "related");
  assert.equal(checked.decision!.elements[0].state, "not_located");
});

test("limitations have their own quoted evidence and still block unsupported affirmation", () => {
  const r = requestFixture(), raw = wire(r);
  const text = "Assistance is subject to an unresolved exception.";
  r.bundle.passages.push({ ...r.bundle.passages[0], evidenceId: "restriction", nodeId: "restriction", text, range: [0, text.length], role: "limitation" });
  raw.citations.push({ citationId: "q2", evidenceId: "restriction", quote: text, explanation: "Material qualification." });
  raw.elements[0].limitations = [{ description: "Unresolved exception.", materiality: "material", citationIds: ["q2"] }];
  const checked = validateVerification(raw, r);
  assert.deepEqual(checked.errors, []);
  assert.ok(checked.decision!.reviewRequired.includes("material_concern:instructions"));
  checked.decision!.reviewRequired = [];
  assert.equal(assessRequirement(r, { kind: "verified", attempts: 1, decision: checked.decision! }), "partial");
});

test("grounded actor interpretation does not review merely unspecified retrieval metadata", async () => {
  const r = requestFixture(), raw = wire(r); r.check.rule!.relationshipScopes = ["controller_to_processor"];
  raw.elements[0].actorScope = { relationshipScope: "controller_to_processor", basis: "This operative sentence binds the processor to controller instructions.", citationIds: ["q1"] };
  let calls = 0;
  const result = await runVerification(r, async () => { calls++; return raw; }, signal());
  assert.equal(result.kind, "verified"); assert.equal(calls, 1);
  raw.elements[0].actorScope.relationshipScope = "processor_obligation";
  assert.ok(validateVerification(raw, r).errors.length);
});

test("immaterial reviewer notes do not create semantic disagreement", async () => {
  const r = requestFixture(); r.bundle.passages[0].role = "supporting"; let calls = 0;
  const result = await runVerification(r, async () => {
    const raw = wire(r); raw.elements[0].roleReassessment = "Operative text is sufficient despite the retrieval role.";
    if (++calls === 2) raw.elements[0].limitations = [{ description: "No material effect.", materiality: "immaterial", citationIds: ["q1"] }];
    return raw;
  }, signal());
  assert.equal(calls, 2); assert.equal(result.kind, "verified");
  if (result.kind === "verified") assert.deepEqual(result.decision.reviewRequired, []);
});

test("optional answer linkage cannot erase a valid evidence matrix", () => {
  const r = requestFixture(), raw: any = responseFixture(r);
  r.context.questions = [{ id: "user_request", text: "Review the duty." }];
  raw.answers = [{ questionId: "user_request", answer: "Untrusted narrative", elementIds: ["instructions"], evidenceIds: ["invented"] }];
  const checked = validateVerification(raw, r);
  assert.deepEqual(checked.errors, []); assert.deepEqual(checked.decision!.answers, []);
  assert.ok(checked.warnings?.includes("unlinked_answer:user_request"));
});

test("missing dependency assessments remain unknown and request evidence even if all elements supported", async () => {
  const r = requestFixture(); r.bundle.dependencies = [{ id: "dep-1", edgeId: "reference-1", sourceNodeId: "node", targetNodeIds: ["appendix"], state: "unresolved_internal", effect: "subject_to", targetMention: "Appendix 2" }];
  const result = await verifyRequirement(r, async () => wire(r), signal());
  assert.equal(result.kind, "verified");
  if (result.kind === "verified") {
    assert.equal(result.decision.dependencies[0].materiality, "unknown");
    assert.deepEqual(result.additionalEvidence?.dependencyIds, ["dep-1"]);
    assert.deepEqual(result.additionalEvidence?.targetNodeIds, ["appendix"]);
    assert.ok(result.additionalEvidence?.queries.includes("Appendix 2"));
    result.decision.reviewRequired = [];
    assert.equal(assessRequirement(r, result), "partial");
  }
  const bad = wire(r); bad.dependencies = [{ id: "invented", elementIds: [], materiality: "immaterial", reason: "Invented" }];
  assert.ok(validateVerification(bad, r).errors.some(e => e.startsWith("invalid_dependency:")));
});

test("repair receives the failed response and safe facts survive a different invalid element", async () => {
  const r = requestFixture(); r.check.rule!.elements.push({ id: "other", kind: "mandatory", description: "Another duty." });
  r.check.rule!.aggregation = { operator: "all", children: [{ elementId: "instructions" }, { elementId: "other" }] };
  const raw: any = responseFixture(r); raw.elements[1].citations[0].quote = "fabricated term";
  let calls = 0;
  const result = await verifyRequirement(r, async prompt => {
    if (++calls === 2) { assert.ok(prompt.includes("previousResponse")); assert.ok(prompt.includes("fabricated term")); }
    return raw;
  }, signal());
  assert.equal(result.kind, "incomplete");
  if (result.kind === "incomplete") assert.deepEqual(result.validatedElements?.map(e => e.elementId), ["instructions"]);
  const outcome = lockOutcome(r, result);
  const state = { request: { instruction: "review" }, workspace: { documents: [] } } as unknown as AnalysisState;
  const row = outcomesToSnapshot(state, [outcome]).rows[0];
  assert.deepEqual(row.supportedElementIds, ["instructions"]); assert.deepEqual(row.missingElementIds, []);
});

test("context pruning is not an execution failure; material pruning still blocks", async () => {
  const r = requestFixture(); const result = await verifyRequirement(r, async () => wire(r), signal());
  r.bundle.coverageReasons = ["role_budget:context"];
  r.bundle.coverageIssues = [{ reason: "role_budget:context", elementIds: [], evidenceIds: ["background"], materiality: "immaterial" }];
  assert.equal(assessRequirement(r, result), "present");
  r.bundle.coverageIssues[0].materiality = "material";
  assert.equal(assessRequirement(r, result), "partial");
  r.bundle.coverageIssues[0].materiality = "immaterial"; r.bundle.executionStatus = "unknown";
  assert.equal(assessRequirement(r, result), "cannot_determine");
});

test("metadata-only retry stops without re-verification and with one final targeted review", async () => {
  const r = requestFixture(); r.bundle.executionStatus = "incomplete"; r.bundle.passages[0].role = "supporting";
  let calls = 0, investigations = 0;
  const run = createRun({ analysisId: "metadata", checks: [r.check], context: r.context, emit: () => {}, complete: async () => {
    const raw = wire(r); raw.elements[0].state = "ambiguous"; raw.elements[0].roleReassessment = "The operative clause provides related support.";
    calls++; return raw;
  } });
  const next = structuredClone(r.bundle); next.hash = "new-audit-version"; next.passages[0].reason = "Reworded rationale"; next.passages[0].confidence = .9;
  assert.equal(evidenceMateriallyChanged(r.bundle, next), false);
  await executeChecks(run, { bundle: () => r.bundle, investigate: async () => { investigations++; assert.equal(calls, 1); return next; } });
  assert.equal(investigations, 1); assert.equal(calls, 2); assert.equal(run.ledger.outcomes.size, 1);
  next.passages[0].text = "Changed obligation";
  assert.equal(evidenceMateriallyChanged(r.bundle, next), true);
});

function investigationFixture() {
  const requirement = { requirementId: "fixture", documentId: "document", requestRequirementId: "facet", packageId: "rule:fixture", profile: { hypothesis: "Duty", proofStandard: "Prove duties", evidenceHints: ["duty"] }, clauseTypes: [], extractionTargets: [], elementIds: ["a", "b", "c", "d"], proofElements: ["a", "b", "c", "d"].map(id => ({ id, description: id, required: true })) } as InvestigationRequirement;
  const candidates = ["a", "b", "c", "d", "background1", "background2"].map((id, i) => ({
    unit: { unitId: id, nodeId: id, documentId: "document", rawText: id, sourceRange: [0, id.length], structuralPath: id, relationshipScope: "unspecified", sourceGraph: { canonicalText: id, relationEdges: [] } },
    fusedScore: 1, rerankScore: 1, channelRanks: { sparse: 1 }, channelScores: {}, matchedQueries: [], signals: [],
  })) as unknown as RankedEvidenceCandidate[];
  const decisions = candidates.map((c, i) => ({ nodeId: c.unit.nodeId, role: i < 4 ? "primary" as const : "context" as const, contributesToElementIds: i < 4 ? [c.unit.nodeId] : [], confidence: 1, reason: "Reviewed." }));
  return { requirement, candidates, decisions, unresolvedElementIds: [] };
}

test("bundling retains unique proof beyond three primary passages and classifies context pruning", () => {
  const bundle = buildRequirementEvidenceBundle(investigationFixture());
  assert.equal(bundle.passages.filter(p => p.role === "primary").length, 4);
  assert.equal(bundle.executionStatus, "complete");
  assert.deepEqual(bundle.unresolvedElementIds, []);
  assert.deepEqual(bundle.coverageIssues?.map(i => i.materiality), ["immaterial"]);
});

test("graph edge identity prevents internal/external references from colliding", () => {
  const { requirement } = investigationFixture(); const check = requestFixture().check;
  const source = buildRequirementEvidenceBundle(investigationFixture());
  const dependency = { sourceNodeId: "source", targetNodeIds: [], semanticEffect: "subject_to" as const };
  source.dependencies = [{ ...dependency, edgeId: "one", state: "external" }, { ...dependency, edgeId: "two", state: "unresolved_internal" }];
  const state = { workspace: { documents: [] } } as unknown as AnalysisState;
  const mapped = bundleForCheck(state, check, source);
  assert.notEqual(mapped.dependencies[0].id, mapped.dependencies[1].id);
  assert.equal(mapped.dependencies[0].edgeId, "one");
});

test("independent investigation batches run in parallel without losing token usage", async () => {
  const state = { agent: { tokensUsed: 100 } } as AnalysisState;
  const entries = Array.from({ length: 14 }, (_, i) => ({ requirement: { ...investigationFixture().requirement, requirementId: "r" + i }, candidates: [] }));
  let active = 0, peak = 0;
  const result = await reviewCandidateBatches({ state, entries, concurrency: 4, complete: async (prompt, _system, _schema, tracker) => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--; tracker.tokensUsed += 7;
    return JSON.parse(prompt).requirements.map((r: any) => ({ requirementId: r.requirementId, decisions: [], unresolvedElementIds: [] }));
  } });
  assert.equal(peak, 4); assert.equal(state.agent!.tokensUsed, 128);
  assert.equal(result.decisionsByRequirement.size, 14); assert.equal(result.unavailableRequirementIds.size, 0);
});

test("one FIFO call pool bounds verification and investigation together", async () => {
  const schedule = createModelCallQueue(2, Date.now, () => {});
  let active = 0, peak = 0;
  const order: number[] = [];
  await Promise.all(Array.from({ length: 10 }, (_, i) => schedule(async () => {
    order.push(i); active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1)); active--;
  }, undefined, { stage: i % 2 ? "verification" : "investigation" })));
  assert.equal(peak, 2); assert.deepEqual(order, Array.from({ length: 10 }, (_, i) => i));
});

test("malformed optional protocol-v2 answers do not invalidate source-grounded elements", () => {
  const r = requestFixture(), raw = wire(r); raw.answers = [{ answer: 42 }];
  const result = validateVerification(raw, r);
  assert.deepEqual(result.errors, []); assert.ok(result.decision); assert.deepEqual(result.decision.answers, []);
});

test("additional searches preserve earlier omissions until the omitted text arrives", () => {
  const previous = requestFixture().bundle;
  previous.coverageReasons = ["role_budget:supporting"];
  previous.coverageIssues = [{ reason: "role_budget:supporting", evidenceIds: ["omitted"], elementIds: ["instructions"], materiality: "unknown" }];
  const next = requestFixture().bundle;
  next.coverageIssues = [];
  assert.equal(mergeEvidenceBundles(previous, next).coverageIssues?.length, 1);
  delete next.coverageIssues;
  assert.equal(mergeEvidenceBundles(previous, next).coverageIssues?.length, 1);
  next.passages.push({ ...next.passages[0], evidenceId: "omitted", nodeId: "omitted" });
  assert.deepEqual(mergeEvidenceBundles(previous, next).coverageIssues, []);
  delete previous.coverageIssues;
  assert.equal(mergeEvidenceBundles(previous, next).coverageIssues?.[0].materiality, "unknown");
});

test("receiving a known dependency target resolves the bundle omission, not an unknown reference", () => {
  const previous = requestFixture().bundle, next = requestFixture().bundle;
  previous.dependencies = [
    { id: "known", sourceNodeId: "node", targetNodeIds: ["appendix"], state: "unresolved_internal", effect: "subject_to" },
    { id: "unknown", sourceNodeId: "node", targetNodeIds: [], state: "unresolved_internal", effect: "subject_to" },
  ];
  next.passages.push({ ...next.passages[0], evidenceId: "appendix-unit", nodeId: "appendix" });
  const merged = mergeEvidenceBundles(previous, next);
  assert.equal(merged.dependencies.find(d => d.id === "known")?.state, "resolved_internal");
  assert.equal(merged.dependencies.find(d => d.id === "unknown")?.state, "unresolved_internal");
});

test("queue observers cannot break model work and cancelled waiting calls do not execute", async () => {
  const schedule = createModelCallQueue(1, Date.now, () => { throw new Error("observer unavailable"); });
  let release!: () => void;
  const first = schedule(() => new Promise<void>(resolve => { release = resolve; }));
  await Promise.resolve();
  const controller = new AbortController();
  let ran = false;
  const waiting = schedule(async () => { ran = true; }, controller.signal);
  controller.abort();
  await assert.rejects(waiting);
  release(); await first;
  await schedule(async () => {});
  assert.equal(ran, false);
});

test("a failed repair preserves independently validated elements from the first response", async () => {
  const r = requestFixture();
  r.check.rule!.elements.push({ id: "other", kind: "mandatory", description: "Another duty." });
  r.check.rule!.aggregation = { operator: "all", children: [{ elementId: "instructions" }, { elementId: "other" }] };
  const raw = responseFixture(r);
  raw.elements[1].citations[0].quote = "fabricated text";
  let calls = 0;
  const result = await verifyRequirement(r, async () => {
    if (++calls === 2) throw new Error("provider unavailable");
    return raw;
  }, signal());
  assert.equal(result.kind, "incomplete");
  if (result.kind === "incomplete") {
    assert.equal(result.reason, "verification_failed");
    assert.deepEqual(result.validatedElements?.map(e => e.elementId), ["instructions"]);
    assert.ok(result.validatedEvidence?.length);
  }
});
