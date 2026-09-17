import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ComplianceReportSnapshot } from "../../../models/compliance-report.js";
import {
  COMPLIANCE_REPORTING_EXAMPLES,
  loadComplianceReportingGuidance,
  selectComplianceReportingExamples,
} from "../guidance/index.js";
import { resolveCompliancePresentationMode } from "../compliance-presentation.js";
import type { AnalysisState } from "../../../models/analysis-state.js";

const snapshot = (instruction: string): ComplianceReportSnapshot => ({
  version: 2,
  instruction,
  scope: "Supplied agreement",
  documents: [],
  rows: [],
  outstandingChecks: [],
  limitations: [],
});

describe("versioned compliance reporting guidance", () => {
  it("loads shared and compliance rules for every stage and records exact versions", () => {
    const loaded = loadComplianceReportingGuidance("Review all mandatory processor terms.", snapshot("Review all mandatory processor terms."));
    assert.match(loaded.versions.shared, /^reporting\.shared-core@\d+\.\d+\.\d+$/);
    assert.match(loaded.versions.compliance, /^reporting\.compliance@\d+\.\d+\.\d+$/);
    for (const stage of ["compose", "check", "repair"] as const) {
      assert.match(loaded.system[stage], /Application integrity rules are authoritative/);
      assert.ok(loaded.system[stage].length > 300);
    }
  });

  it("shared guidance is at version 1.2.0", () => {
    const loaded = loadComplianceReportingGuidance("Review all mandatory processor terms.");
    assert.equal(loaded.versions.shared, "reporting.shared-core@1.2.0");
  });

  it("compliance guidance is at version 1.4.0", () => {
    const loaded = loadComplianceReportingGuidance("Review all mandatory processor terms.");
    assert.equal(loaded.versions.compliance, "reporting.compliance@1.4.0");
  });

  it("selects short annotated examples by semantic request signals, not exact prompt strings", () => {
    const transfer = selectComplianceReportingExamples("Which cross-border mechanism and recipient country support each export?");
    const rights = selectComplianceReportingExamples("Show assistance duties and any response deadline for erasure requests.");
    const generic = selectComplianceReportingExamples("Check the confidentiality provision.");
    assert.equal(transfer[0]?.id, "transfer-comparison");
    assert.equal(rights[0]?.id, "timing-and-assistance");
    assert.deepEqual(generic, []);
    assert.ok(COMPLIANCE_REPORTING_EXAMPLES.every(example => example.annotation.includes("Composition example")));
  });

  it("selects partial-element-breakdown example for partial/missing-element requests", () => {
    const partial = selectComplianceReportingExamples("Which processor assistance elements are missing or partial?");
    const art28 = selectComplianceReportingExamples("Review Article 28 processor obligations.");
    assert.ok(partial.some(e => e.id === "partial-element-breakdown"), "partial-element-breakdown should be selected for partial/element signals");
    assert.ok(art28.some(e => e.id === "partial-element-breakdown"), "partial-element-breakdown should be selected for Article 28 signals");
  });

  it("uses examples only in planning and writing prompts", () => {
    const loaded = loadComplianceReportingGuidance("Review SCC transfer destinations.");
    assert.ok(loaded.versions.examples.some(id => id.startsWith("transfer-comparison@")));
    assert.match(loaded.system.compose, /Selected annotated composition examples/);
    assert.doesNotMatch(loaded.system.check, /Selected annotated composition examples/);
    assert.doesNotMatch(loaded.system.repair, /Selected annotated composition examples/);
  });

  it("shared guidance compose instruction covers dynamic question answer synthesis", () => {
    const loaded = loadComplianceReportingGuidance("Review all mandatory processor terms.");
    assert.match(loaded.system.compose, /dynamic question answers/);
    assert.match(loaded.system.check, /dynamic question answers/);
    assert.match(loaded.system.repair, /dynamic question answer/);
  });

  it("compliance guidance compose instruction covers mode-specific depth calibration", () => {
    const loaded = loadComplianceReportingGuidance("Review all mandatory processor terms.");
    assert.match(loaded.system.compose, /short mode/);
    assert.match(loaded.system.compose, /narrative mode/);
    assert.match(loaded.system.compose, /partial finding/);
    assert.match(loaded.system.check, /partially satisfied/);
    assert.match(loaded.system.repair, /supported element/);
  });
});

describe("resolveCompliancePresentationMode — intent.outputForm handling", () => {
  function stateWith(overrides: Partial<AnalysisState>): AnalysisState {
    return {
      request: { instruction: "Review processor terms.", sessionId: "test" },
      ...overrides,
    } as unknown as AnalysisState;
  }

  it("returns short when intent.outputForm is brief_summary and no keyword override", () => {
    const state = stateWith({ intent: { outputForm: "brief_summary" } as never });
    assert.equal(resolveCompliancePresentationMode(state), "short");
  });

  it("keyword overrides still take precedence over brief_summary outputForm", () => {
    const state = stateWith({
      intent: { outputForm: "brief_summary" } as never,
      request: { instruction: "provide a detailed review", sessionId: "test" },
    });
    assert.equal(resolveCompliancePresentationMode(state), "detailed");
  });

  it("narrative answerStyle overrides brief_summary outputForm", () => {
    const state = stateWith({
      intent: { outputForm: "brief_summary" } as never,
      request: { instruction: "review", answerStyle: "narrative", sessionId: "test" },
    });
    assert.equal(resolveCompliancePresentationMode(state), "narrative");
  });
});
