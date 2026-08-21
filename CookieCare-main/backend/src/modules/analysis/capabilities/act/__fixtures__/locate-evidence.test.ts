process.env.GOOGLE_CLOUD_PROJECT ??= "locate-evidence-test";

/**
 * Deterministic evidence locator: heading/alias retrieval, cross-references,
 * and PLAN catalog shortlisting. No LLM.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { segmentDocument } from "../../../segmentation/segment-document.js";
import {
  buildRetrievalDictionary,
  extractCrossReferences,
  locateEvidence,
} from "../locate-evidence.js";
import { groupedResultsToFindings } from "../grouped-results-to-findings.js";
import { getSkillById, resetSkillRegistryForTests } from "../../../skills/runtime/catalog/registry.js";
import { buildActGraphDetailed } from "../../../skills/runtime/graph/build-act-graph.js";
import { EXPLICIT_DEEP_DEPTH_RE } from "../../plan/intent-heuristics.js";
import type { AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import type { IntentClassification } from "../../../models/intent.js";
import type { SharedEvidenceBundle } from "../../../models/evidence-package.js";

const { collectStrongCatalogShortlist } = await import(
  "../../../skills/runtime/focus/extract-instruction-focus.js"
);

const SAMPLE_DPA = `
DATA PROCESSING AGREEMENT

1. Processing of Personal Data
The processor shall process personal data only on documented instructions from the controller.
The subject matter is cloud hosting, the duration is the term of the agreement, and the nature and purpose is providing the Services. Types of personal data include contact details. Categories of data subjects include employees.

2. Subprocessors
The processor shall not appoint a sub-processor without prior written authorisation of the controller. The controller has a right to object to changes.

3. Security
The processor shall implement technical and organisational measures including encryption and regular testing.

4. Return or Deletion
Upon termination the processor shall delete or return all personal data at the controller's choice.

5. Audit
The processor shall make available all information necessary to demonstrate compliance and allow audits and inspections.

6. Data Subject Requests
The processor shall assist the controller in fulfilling data subject requests including access, rectification, and erasure.

7. Processing particulars
Subject matter of processing is set out in Annex 1 of Addendum A1 and applicable SOWs.
`.trim();

describe("locateEvidence", () => {
  it("retrieves authored clause types from headings and aliases without an LLM", () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const doc = segmentDocument("dpa-1", SAMPLE_DPA, { title: "DPA" });
    const types = [
      "processor_terms",
      "subprocessor_flow_down",
      "information_security",
      "deletion_on_termination",
      "audit_and_compliance_evidence",
      "data_subject_request_handling",
    ];
    const dict = buildRetrievalDictionary([gdpr], types);
    const located = locateEvidence(doc, types, dict);
    const byType = new Map(located.map((r) => [r.clauseType, r]));

    assert.ok(
      byType.get("subprocessor_flow_down")?.candidates.length,
      "subprocessor heading should match"
    );
    assert.notEqual(byType.get("subprocessor_flow_down")?.status, "not_found");
    assert.ok(
      byType.get("information_security")?.candidates.length,
      "security heading should match"
    );
    assert.ok(
      byType.get("data_subject_request_handling")?.candidates.length,
      "DSR heading should match"
    );
    assert.ok(
      byType.get("audit_and_compliance_evidence")?.candidates.length,
      "audit heading should match"
    );
    const sub = byType.get("subprocessor_flow_down")!;
    assert.ok(
      sub.candidates.some((c) => /sub-?processor/i.test(c.text)),
      "subprocessor candidate should quote the section"
    );
  });

  it("marks particulars referenced in another annex as referenced_elsewhere", () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const text = `
DATA PROCESSING AGREEMENT
1. Roles
The processor processes personal data for the controller.
2. Particulars
The subject matter of processing is set out in Annex 1 of Addendum A1 and applicable SOWs.
`.trim();
    const doc = segmentDocument("dpa-ref", text, { title: "DPA" });
    const dict = buildRetrievalDictionary([gdpr], ["processor_terms"]);
    const [result] = locateEvidence(doc, ["processor_terms"], dict);
    const refs = extractCrossReferences(
      "The subject matter of processing is set out in Annex 1 of Addendum A1 and applicable SOWs."
    );
    assert.ok(refs.length > 0, `expected cross-refs, got ${refs.join(", ")}`);
    if (result.status !== "found" && result.status !== "multiple_candidates") {
      assert.equal(result.status, "referenced_elsewhere");
      assert.ok((result.referencedDocuments ?? []).length > 0);
    }
  });

  it("returns not_found when the document has no matching section", () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const doc = segmentDocument("nda", "CONFIDENTIALITY\nEach party shall keep secrets.", {
      title: "NDA",
    });
    const dict = buildRetrievalDictionary([gdpr], ["subprocessor_flow_down"]);
    const [result] = locateEvidence(doc, ["subprocessor_flow_down"], dict);
    assert.equal(result.status, "not_found");
    assert.equal(result.candidates.length, 0);
  });
});

describe("collectStrongCatalogShortlist", () => {
  it("shortlists Article 28 capabilities and package siblings", () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const { strong, ids } = collectStrongCatalogShortlist(
      "Review this DPA for GDPR Article 28 compliance.",
      [gdpr]
    );
    assert.equal(strong, true);
    assert.ok(ids.has("gdpr.art28.3.a"));
    assert.ok(ids.has("gdpr.art28.3.h"), "package siblings should be included");
    assert.ok(!ids.has("gdpr.art45.1"), "unrelated transfer rules stay out of the shortlist");
  });

  it("does not shortlist a broad GDPR review", () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const { strong, ids } = collectStrongCatalogShortlist(
      "Review this DPA for GDPR compliance.",
      [gdpr]
    );
    assert.equal(strong, false);
    assert.equal(ids.size, 0);
  });
});

describe("package extract clauseTypes", () => {
  it("scopes wu-extract to package clause types instead of the full GDPR taxonomy", () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const { workUnits } = buildActGraphDetailed({
      docId: "doc1",
      instruction: "Review the DPA for GDPR Article 28 compliance.",
      skills: [gdpr],
      intent: {
        scope: "whole_document",
        operation: "compliance_check",
        standard: "regime_pack:gdpr",
        outputForm: "memo",
        compound: false,
        subIntents: [],
        requirements: [],
        confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
      } satisfies IntentClassification,
      focus: {
        ruleIds: ["gdpr.art28.3.a"],
        matrixRowIds: [],
        riskCategoryIds: [],
        instructionText: "Review the DPA for GDPR Article 28 compliance.",
      },
    });
    const extract = workUnits.find((u) => u.tool === "extract_clauses");
    const types = (extract?.input.clauseTypes as string[]) ?? [];
    assert.ok(types.length > 0);
    assert.ok(types.length < gdpr.clauseTypes.length);
    assert.ok(types.includes("processor_terms"));
    assert.ok(types.includes("subprocessor_flow_down"));
  });
});

describe("groupedResultsToFindings referenced_elsewhere", () => {
  it("does not emit a hard missing finding when evidence is only referenced elsewhere", () => {
    const unit = {
      workUnitId: "wu-pkg-eval",
      tool: "evaluate_package",
      input: {},
      dependsOn: [],
      outputSchema: "Finding[]",
      status: "succeeded",
    } as unknown as AnalysisWorkUnit;
    const bundle: SharedEvidenceBundle = {
      packageId: "gdpr.art28.particulars",
      docId: "d1",
      items: [
        {
          ref: "E1",
          clauseType: "processor_terms",
          quotedText: "Subject matter is set out in Annex 1.",
          structuralPath: "clause-7",
          charRange: [0, 40],
          evidenceStatus: "referenced_elsewhere",
          referencedDocuments: ["Annex 1 of Addendum A1"],
        },
      ],
    };
    const findings = groupedResultsToFindings(
      [
        {
          requirementId: "subject_matter",
          status: "missing",
          rationale: "Not in the main body.",
          evidenceRefs: ["E1"],
        },
      ],
      {
        unit,
        docId: "d1",
        packageId: "gdpr.art28.particulars",
        sourceMode: "authored",
        findingCategory: "processor_terms_incomplete",
        bundle,
      }
    );
    assert.equal(findings.length, 1);
    assert.equal(findings[0].status, "insufficient_evidence");
  });
});

describe("explicit deep depth", () => {
  it("does not treat a normal Article 28 verify-request as deep", () => {
    assert.equal(
      EXPLICIT_DEEP_DEPTH_RE.test(
        "Review this DPA for GDPR Article 28 compliance. Verify subject matter."
      ),
      false
    );
    assert.equal(
      EXPLICIT_DEEP_DEPTH_RE.test("Please produce a thorough, comprehensive analysis."),
      true
    );
  });
});
