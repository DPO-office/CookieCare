import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import type { AnalysisState, PriorAnalysisSnapshot } from "../../../models/analysis-state.js";
import type {
  CompliancePresentationPlan,
  ComplianceReportRow,
  ComplianceReportSnapshot,
  ComplianceReportValidation,
} from "../../../models/compliance-report.js";
import { getSkillById } from "../../../skills/runtime/catalog/registry.js";
import { complianceSnapshotMatchesSources, toPersistedState } from "../../../utils/persisted-state.js";
import { buildPlan } from "../../plan/build-plan.js";

const text = "The processor shall assist the controller.\nSchedule: café — 東京.";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const statuses: Array<[ComplianceReportRow["status"], ComplianceReportRow["statusLabel"]]> = [
  ["present", "Present"],
  ["partial", "Partial"],
  ["gap", "Gap"],
  ["cannot_determine", "Cannot determine"],
  ["not_applicable", "Not applicable"],
  ["conflicting", "Conflicting"],
  ["judgment_required", "Judgment required"],
  ["verification_incomplete", "Verification incomplete"],
];

function snapshot(): ComplianceReportSnapshot {
  return {
    version: 1,
    instruction: "Review the processor terms.",
    scope: "Whole document",
    documents: [{ documentId: "doc-1", title: "Processor terms", contentHash: hash(text) }],
    rows: statuses.map(([status, statusLabel], index) => ({
      rowId: `row-${index}`,
      requirementId: `requirement-${index}`,
      canonicalKey: `canonical-${index}`,
      lockedAssessmentId: `lock-${index}`,
      legalCitation: "Article 28",
      title: `Requirement ${index}`,
      status,
      statusLabel,
      recommendedAction: `Action for ${status}`,
      supportedElementIds: [`supported-${index}`],
      missingElementIds: [`missing-${index}`],
      evidence: [{
        spanId: `span-${index}`,
        citationId: `citation-${index}`,
        documentId: "doc-1",
        documentTitle: "Processor terms",
        pointer: "§ 1, paragraph 1",
        quote: "The processor shall assist the controller.",
        structuralPath: "Section 1 > Paragraph 1",
        charRange: [0, 42],
      }],
      whatTheDocumentProvides: "Assistance obligation.",
      whatIsMissingOrUnclear: `Uncertainty for ${status}`,
      whyItMatters: "Defines the processor's obligations.",
      conclusion: `Conclusion for ${status}`,
      ruleVersion: "1",
      documentHash: hash(text),
    })),
    outstandingChecks: ["unmatched", "rejected", "unfinished"].map((kind) => ({
      requirementId: `outstanding-${kind}`,
      title: `Outstanding ${kind}`,
      reason: `Reason for ${kind}`,
      kind: kind as "unmatched" | "rejected" | "unfinished",
    })),
    limitations: [{ id: "limit-1", requirementIds: ["outstanding-unfinished"], message: "Verification is incomplete." }],
  };
}

const presentationPlan: CompliancePresentationPlan = {
  version: 1,
  mode: "layered",
  rationale: "Give the answer before the evidence.",
  sections: [
    { kind: "answer", heading: "Answer", findingIds: [], columns: [], detailWords: 60 },
    { kind: "details", heading: "Requirements", findingIds: ["row-0", "row-7"], columns: ["Requirement", "Status", "Contract provision", "Assessment"], detailWords: 150 },
    { kind: "limitations", heading: "Outstanding checks", findingIds: [], columns: [], detailWords: 80 },
  ],
};
const validation: ComplianceReportValidation = {
  passed: true,
  source: "validated_writer",
  failures: [],
  plannerFallback: false,
  repairAttempts: 1,
  outputHash: hash("Historical report"),
};

function state(): AnalysisState {
  return {
    request: {
      sessionId: "session-1",
      instruction: "Now show this as a table.",
      documentIds: ["doc-1"],
      documentTexts: { "doc-1": text },
    },
    workspace: {
      sessionId: "session-1",
      documents: [{ docId: "doc-1", title: "Processor terms", role: "target", fullText: text, segments: [], clauses: [] }],
    },
    intent: {
      scope: "whole_document",
      operation: "compliance_check",
      standard: "regime_pack:regimes/data-protection/gdpr",
      outputForm: "table",
      reportType: "regime_compliance_memo",
      compound: false,
      subIntents: [],
      requirements: [],
      confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
    },
    activeSkills: [getSkillById("_global")!],
    findings: [],
    draftTasks: [],
    complianceReportSnapshot: snapshot(),
    compliancePresentationPlan: presentationPlan,
    complianceReportValidation: validation,
    renderedOutput: "Historical report",
    metadata: { timestamp: "2026-09-07T00:00:00.000Z", clauseTaxonomyVersion: "1", riskTaxonomyVersion: "1" },
  };
}

function followUp(source = state()): AnalysisState {
  const saved = JSON.parse(JSON.stringify(toPersistedState(source)));
  const prior: PriorAnalysisSnapshot = {
    instruction: saved.request.instruction,
    intent: saved.intent,
    findings: saved.findings,
    complianceReportSnapshot: saved.complianceReportSnapshot,
    compliancePresentationPlan: saved.compliancePresentationPlan,
    renderedOutput: saved.renderedOutput,
  };
  return { ...state(), priorAnalysis: prior };
}

function stateWithRoles(): AnalysisState {
  const current = state();
  current.request.documentIds.push("doc-2");
  current.request.documentTexts["doc-2"] = "Reference requirements.";
  current.workspace.documents.push({
    docId: "doc-2", title: "Playbook", role: "reference",
    fullText: "Reference requirements.", segments: [], clauses: [],
  });
  current.complianceReportSnapshot!.documents[0].role = "target";
  current.complianceReportSnapshot!.documents.push({
    documentId: "doc-2", title: "Playbook", role: "reference", contentHash: hash("Reference requirements."),
  });
  return current;
}

describe("compliance persistence", () => {
  it("round-trips recorded document roles with the source snapshot", () => {
    const original = stateWithRoles();
    const restored = JSON.parse(JSON.stringify(toPersistedState(original)));
    assert.deepEqual(restored.complianceReportSnapshot.documents, original.complianceReportSnapshot!.documents);
    assert.equal(complianceSnapshotMatchesSources(restored.complianceReportSnapshot, restored), true);
  });

  it("round-trips every status, evidence locator, outstanding check, saved plan, and render validation", () => {
    const original = state();
    const restored = JSON.parse(JSON.stringify(toPersistedState(original)));
    assert.deepEqual(restored.complianceReportSnapshot, original.complianceReportSnapshot);
    assert.deepEqual(restored.compliancePresentationPlan, presentationPlan);
    assert.deepEqual(restored.complianceReportValidation, validation);
    assert.deepEqual(restored.request.documentTexts, {});
    assert.equal(restored.workspace.documents[0].fullText, text);
    assert.equal(complianceSnapshotMatchesSources(restored.complianceReportSnapshot, restored), true);
  });

  it("retains failed validation and fallback diagnostics for the saved output", () => {
    const original = state();
    original.complianceReportValidation = {
      passed: false, source: "snapshot_unavailable", failures: ["Fresh run needed"],
      plannerFallback: true, repairAttempts: 0, outputHash: hash("Fresh run needed"),
    };
    const restored = JSON.parse(JSON.stringify(toPersistedState(original)));
    assert.deepEqual(restored.complianceReportValidation, original.complianceReportValidation);
  });

  it("keeps historical reports readable when compliance fields are absent", () => {
    const original = state();
    delete original.complianceReportSnapshot;
    delete original.compliancePresentationPlan;
    delete original.complianceReportValidation;
    const restored = JSON.parse(JSON.stringify(toPersistedState(original)));
    assert.equal(restored.renderedOutput, "Historical report");
    assert.equal("complianceReportSnapshot" in restored, false);
    assert.equal("compliancePresentationPlan" in restored, false);
    assert.equal("complianceReportValidation" in restored, false);
  });
});

describe("compliance source identity", () => {
  it("accepts unchanged target/reference roles from the resolved workspace", () => {
    const current = stateWithRoles();
    assert.equal(complianceSnapshotMatchesSources(current.complianceReportSnapshot!, current), true);
  });

  for (const source of ["request", "workspace"]) {
    it(`rejects a target/reference role swap in ${source} with unchanged IDs and text`, () => {
      const current = stateWithRoles();
      if (source === "request") {
        current.request.documentRoles = { "doc-1": "reference", "doc-2": "target" };
      } else {
        current.workspace.documents[0].role = "reference";
        current.workspace.documents[1].role = "target";
      }
      assert.equal(complianceSnapshotMatchesSources(current.complianceReportSnapshot!, current), false);
    });
  }

  it("uses explicit request roles before workspace loading or resolution", () => {
    const current = stateWithRoles();
    current.request.documentRoles = { "doc-1": "target", "doc-2": "reference" };
    current.workspace.documents[0].role = "unknown";
    current.workspace.documents[1].role = "unknown";
    assert.equal(complianceSnapshotMatchesSources(current.complianceReportSnapshot!, current), true);
    current.workspace.documents = [];
    assert.equal(complianceSnapshotMatchesSources(current.complianceReportSnapshot!, current), true);
    current.request.documentRoles = { "doc-1": "reference", "doc-2": "target" };
    assert.equal(complianceSnapshotMatchesSources(current.complianceReportSnapshot!, current), false);
  });

  it("rejects unavailable or unresolved current roles when the snapshot records a role", () => {
    const current = stateWithRoles();
    current.workspace.documents[0].role = "unknown";
    assert.equal(complianceSnapshotMatchesSources(current.complianceReportSnapshot!, current), false);
    current.workspace.documents = [];
    assert.equal(complianceSnapshotMatchesSources(current.complianceReportSnapshot!, current), false);
  });

  it("keeps legacy snapshots without recorded roles compatible", () => {
    const current = stateWithRoles();
    for (const document of current.complianceReportSnapshot!.documents) delete document.role;
    current.request.documentRoles = { "doc-1": "reference", "doc-2": "target" };
    assert.equal(complianceSnapshotMatchesSources(current.complianceReportSnapshot!, current), true);
  });

  it("accepts request texts before workspace loading and empty document content", () => {
    const current = state();
    current.workspace.documents = [];
    assert.equal(complianceSnapshotMatchesSources(snapshot(), current), true);
    current.request.documentTexts["doc-1"] = "";
    const empty = snapshot();
    empty.documents[0].contentHash = hash("");
    assert.equal(complianceSnapshotMatchesSources(empty, current), true);
  });

  it("ignores document order and title changes while checking every document", () => {
    const current = state();
    current.request.documentIds.push("doc-2");
    current.request.documentTexts["doc-2"] = "Second source";
    current.workspace.documents.push({ ...current.workspace.documents[0], docId: "doc-2", fullText: "Second source" });
    current.workspace.documents.reverse();
    current.workspace.documents[1].title = "Renamed";
    const prior = snapshot();
    prior.documents.push({ documentId: "doc-2", title: "Second", contentHash: hash("Second source") });
    assert.equal(complianceSnapshotMatchesSources(prior, current), true);
    current.request.documentTexts["doc-2"] += " changed";
    assert.equal(complianceSnapshotMatchesSources(prior, current), false);
  });

  const changes: Array<[string, (current: AnalysisState) => void]> = [
    ["changed request text", (current) => { current.request.documentTexts["doc-1"] += " changed"; }],
    ["changed workspace text", (current) => { current.workspace.documents[0].fullText += " changed"; }],
    ["changed whitespace", (current) => { current.request.documentTexts["doc-1"] += " "; }],
    ["added document", (current) => { current.request.documentIds.push("doc-2"); }],
    ["removed document", (current) => { current.request.documentIds = []; }],
    ["replaced document", (current) => { current.request.documentIds = ["doc-2"]; }],
    ["duplicate document", (current) => { current.request.documentIds.push("doc-1"); }],
    ["extra workspace document", (current) => { current.workspace.documents.push({ ...current.workspace.documents[0], docId: "doc-2" }); }],
    ["unavailable source text", (current) => { current.workspace.documents = []; current.request.documentTexts = {}; }],
  ];
  for (const [name, change] of changes) {
    it(`rejects ${name}`, () => {
      const current = state();
      change(current);
      assert.equal(complianceSnapshotMatchesSources(snapshot(), current), false);
    });
  }
});

describe("compliance follow-up reuse", () => {
  it("requires new analysis after swapping target and reference roles without changing sources", async () => {
    const original = stateWithRoles();
    const current = {
      ...original,
      priorAnalysis: followUp(original).priorAnalysis,
      request: { ...original.request, documentRoles: { "doc-1": "reference", "doc-2": "target" } as const },
      pendingSkillClarification: { field: "skill", question: "Select review scope", severity: "critical" as const },
    };
    const result = await buildPlan(current);
    assert.deepEqual(result.plan?.missingClarifications, [current.pendingSkillClarification]);
    assert.deepEqual(result.plan?.workUnits, []);
    assert.equal(result.complianceReportSnapshot, undefined);
    assert.equal(result.compliancePresentationPlan, undefined);
    assert.equal(result.complianceReportValidation, undefined);
  });

  it("reuses canonical results and the saved plan, but invalidates the previous output validation", async () => {
    const current = followUp();
    const result = await buildPlan(current);
    assert.deepEqual(result.plan?.workUnits.map((unit) => unit.tool), ["render_output"]);
    assert.equal(result.plan?.workUnits[0].input.followUpKind, "presentation_change");
    assert.deepEqual(result.complianceReportSnapshot, current.priorAnalysis?.complianceReportSnapshot);
    assert.deepEqual(result.compliancePresentationPlan, presentationPlan);
    assert.equal(result.complianceReportValidation, undefined);
    assert.equal(current.complianceReportValidation, validation);
  });

  for (const outstanding of [true, false]) {
    it(`reuses a zero-accepted snapshot ${outstanding ? "with outstanding checks" : "with no checks"}`, async () => {
      const original = state();
      original.complianceReportSnapshot!.rows = [];
      if (!outstanding) original.complianceReportSnapshot!.outstandingChecks = [];
      original.renderedOutput = undefined;
      const result = await buildPlan(followUp(original));
      assert.deepEqual(result.plan?.workUnits.map((unit) => unit.tool), ["render_output"]);
      assert.deepEqual(result.complianceReportSnapshot, original.complianceReportSnapshot);
      assert.equal(result.complianceReportValidation, undefined);
    });
  }

  it("reuses canonical results for a conversational question", async () => {
    const current = followUp();
    current.request.instruction = "Why is that incomplete?";
    const result = await buildPlan(current);
    assert.equal(result.plan?.workUnits[0].input.followUpKind, "conversational_qa");
    assert.deepEqual(result.complianceReportSnapshot, snapshot());
    assert.equal(result.complianceReportValidation, undefined);
  });

  it("routes a historical presentation follow-up to the renderer without fabricating a snapshot", async () => {
    const current = followUp();
    delete current.priorAnalysis!.complianceReportSnapshot;
    delete current.priorAnalysis!.compliancePresentationPlan;
    const result = await buildPlan(current);
    assert.deepEqual(result.plan?.workUnits.map((unit) => unit.tool), ["render_output"]);
    assert.equal(result.priorAnalysis?.renderedOutput, "Historical report");
    assert.equal(result.complianceReportSnapshot, undefined);
    assert.equal(result.compliancePresentationPlan, undefined);
    assert.equal(result.complianceReportValidation, undefined);
  });

  for (const changed of ["request", "workspace", "document set", "topic", "new ask"]) {
    it(`continues new-analysis planning when ${changed} changes`, async () => {
      const current = followUp();
      if (changed === "request") current.request.documentTexts["doc-1"] += " Changed";
      if (changed === "workspace") current.workspace.documents[0].fullText += " Changed";
      if (changed === "document set") {
        current.request.documentIds = ["doc-2"];
        current.request.documentTexts = { "doc-2": text };
        current.workspace.documents[0].docId = "doc-2";
      }
      if (changed === "topic") current.intent = { ...current.intent!, standard: "regime_pack:regimes/data-protection/ccpa" };
      if (changed === "new ask") current.request.instruction = "Now check the same DPA for CCPA service-provider restrictions.";
      // Stop at the normal new-analysis clarification boundary, before any model calls.
      current.pendingSkillClarification = { field: "skill", question: "Select review scope", severity: "critical" };
      const result = await buildPlan(current);
      assert.deepEqual(result.plan?.missingClarifications, [current.pendingSkillClarification]);
      assert.deepEqual(result.plan?.workUnits, []);
      assert.equal(result.complianceReportSnapshot, undefined);
      assert.equal(result.compliancePresentationPlan, undefined);
      assert.equal(result.complianceReportValidation, undefined);
    });
  }
});
