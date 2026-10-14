import assert from "node:assert/strict";
import test from "node:test";
import type { SegmentedDocument } from "../../../../../models/document-workspace.js";
import { GDPR_RULE_INVESTIGATION } from "../../../../../skills/regimes/data-protection/gdpr/rule-investigation.js";
import { buildDpa5GdprDemoBundles, DPA_5_GDPR_RULE_EVIDENCE } from "../demo-evidence-bundles.js";
import type { InvestigationRequirement } from "../types.js";

function requirement(requirementId: string): InvestigationRequirement {
  return {
    requestRequirementId: requirementId,
    requirementId,
    packageId: "rule:regimes/data-protection/gdpr",
    documentId: "doc-5",
    profile: { hypothesis: "test", evidenceHints: [], proofStandard: "test" },
    clauseTypes: [],
    extractionTargets: [],
    elementIds: ["element"],
  };
}

function document(title = "DPA - 5.pdf"): SegmentedDocument {
  const fullText = [
    "HCL - Data Processing and Vendor Security Agreement",
    "This Data Processing and Vendor Security Agreement sets out the terms and conditions for the Processing of Personal Data by the Vendor on behalf of HCL.",
    "HCL may be a Controller for the Personal Data it collects or processes for its own Purposes and Vendor will be a Processor.",
    "Vendor shall only process Personal Data on behalf of HCL in accordance with this Agreement including the agreed Contractual Terms and any other written instructions it may receive from HCL.",
  ].join("\n\n");
  return { docId: "doc-5", title, role: "target", fullText, segments: [], clauses: [] };
}

test("the DPA - 5 registry covers every authored GDPR investigation rule", () => {
  assert.deepEqual(
    Object.keys(DPA_5_GDPR_RULE_EVIDENCE).sort(),
    Object.keys(GDPR_RULE_INVESTIGATION).sort()
  );
});

test("known DPA - 5 identity produces exact source-backed GDPR demo passages", () => {
  const source = document();
  const result = buildDpa5GdprDemoBundles(source, [requirement("gdpr.art28.3.a")]);
  assert.ok(result);
  const bundle = result.bundlesByRequirement.get("doc-5::gdpr.art28.3.a");
  assert.ok(bundle);
  assert.equal(bundle.passages.length, 1);
  assert.equal(source.fullText.slice(...bundle.passages[0].sourceRange), bundle.passages[0].rawText);
  assert.equal(bundle.passages[0].role, "primary");
});

test("multi-clause evidence retains DSR escalation, instruction control, and action deadline", () => {
  const source = document();
  source.fullText += [
    "Vendor will assist HCL taking into account the nature of the Processing by implementing appropriate technical and organizational measures. Vendor will fulfil requests from Data Subjects exercising their rights.",
    "Vendor shall promptly and no later than two (2) days of receiving such request notify HCL.",
    "Vendor shall ensure that it and any Sub-Processors do not respond to that request except on the documented instructions of HCL.",
    "Vendor agrees to take all actions required to respond to any request for access, change, correction or choice modification, with completion no longer than twenty (20) days.",
  ].map((paragraph) => `\n\n${paragraph}`).join("");
  const result = buildDpa5GdprDemoBundles(source, [requirement("gdpr.art12.3")]);
  assert.ok(result);
  const bundle = result.bundlesByRequirement.get("doc-5::gdpr.art12.3");
  assert.ok(bundle);
  assert.equal(bundle.passages.length, 4);
  assert.equal(bundle.executionStatus, "complete");
  assert.ok(bundle.passages.some((passage) => passage.rawText.includes("two (2) days")));
  assert.ok(bundle.passages.some((passage) => passage.rawText.includes("documented instructions")));
  assert.ok(bundle.passages.some((passage) => passage.rawText.includes("twenty (20) days")));
  for (const passage of bundle.passages) {
    assert.equal(source.fullText.slice(...passage.sourceRange), passage.rawText);
  }
});

test("unknown filenames do not activate demo evidence", () => {
  assert.equal(
    buildDpa5GdprDemoBundles(document("customer-contract.pdf"), [requirement("gdpr.art28.3.a")]),
    null
  );
});
