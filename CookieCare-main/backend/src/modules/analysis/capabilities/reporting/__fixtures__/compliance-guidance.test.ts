import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ComplianceReportSnapshot } from "../../../models/compliance-report.js";
import {
  COMPLIANCE_REPORTING_EXAMPLES,
  loadComplianceReportingGuidance,
  selectComplianceReportingExamples,
} from "../guidance/index.js";

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

  it("selects short annotated examples by semantic request signals, not exact prompt strings", () => {
    const transfer = selectComplianceReportingExamples("Which cross-border mechanism and recipient country support each export?");
    const rights = selectComplianceReportingExamples("Show assistance duties and any response deadline for erasure requests.");
    const generic = selectComplianceReportingExamples("Check the confidentiality provision.");
    assert.equal(transfer[0]?.id, "transfer-comparison");
    assert.equal(rights[0]?.id, "timing-and-assistance");
    assert.deepEqual(generic, []);
    assert.ok(COMPLIANCE_REPORTING_EXAMPLES.every(example => example.annotation.includes("Composition example")));
  });

  it("uses examples only in planning and writing prompts", () => {
    const loaded = loadComplianceReportingGuidance("Review SCC transfer destinations.");
    assert.ok(loaded.versions.examples.some(id => id.startsWith("transfer-comparison@")));
    assert.match(loaded.system.compose, /Selected annotated composition examples/);
    assert.doesNotMatch(loaded.system.check, /Selected annotated composition examples/);
    assert.doesNotMatch(loaded.system.repair, /Selected annotated composition examples/);
  });
});
